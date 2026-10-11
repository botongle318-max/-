import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import { TutorError, type TutorReply, type TutorRequest } from './tutor'
import { buildLocalTutorMessages } from './tutorPrompt'

export type LocalModelSource = 'official' | 'mirror'
export interface LocalTutorState {
  status: 'idle' | 'checking' | 'loading' | 'ready' | 'generating' | 'error'
  modelId?: string
  source?: LocalModelSource
  progress: number
  text: string
  error?: string
}
export const LOCAL_TUTOR_MODELS = [
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 7B · FP16（推荐）', vramMB: 5106.67 },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 1.5B · FP16（轻量）', vramMB: 1629.75 },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC', name: 'Qwen2.5 Coder 7B · FP32（兼容）', vramMB: 5900.09 },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC', name: 'Qwen2.5 Coder 1.5B · FP32（兼容轻量）', vramMB: 1888.97 },
] as const
export const DEFAULT_LOCAL_MODEL_ID = LOCAL_TUTOR_MODELS[0].id

let state: LocalTutorState = { status: 'idle', progress: 0, text: '选择模型并点击加载后，才会下载模型文件。' }
const subscribers = new Set<() => void>()
let engine: MLCEngineInterface | null = null
let worker: Worker | null = null
let version = 0
interface Job { version: number; reject: (error: Error) => void; stopped: Promise<never>; cleanup: () => void }
let loadJob: Job | null = null
let generationJob: Job | null = null

export const getLocalTutorState = (): LocalTutorState => state
export function subscribeLocalTutor(listener: () => void): () => void { subscribers.add(listener); return () => { subscribers.delete(listener) } }
function update(next: LocalTutorState): void { state = next; for (const listener of subscribers) listener() }
const aborted = () => new DOMException('请求已取消', 'AbortError')

function destroyResources(): void {
  const previous = engine
  engine = null
  try { previous?.interruptGenerate() } catch { /* Termination below is the cancellation backstop. */ }
  worker?.terminate(); worker = null
}
function reset(text = '模型已卸载；浏览器缓存保留，可重新加载。'): void {
  version += 1
  loadJob?.reject(aborted()); generationJob?.reject(aborted())
  loadJob?.cleanup(); generationJob?.cleanup(); loadJob = null; generationJob = null
  destroyResources(); update({ status: 'idle', progress: 0, text })
}
export function cancelLocalTutorLoad(): void { if (loadJob) reset('模型加载已取消；再次点击加载可以重试。') }
export async function unloadLocalTutor(): Promise<void> { reset() }

function job(timeoutMs: number, signal: AbortSignal | undefined, onStop: (error: Error) => void): Job {
  let reject!: (error: Error) => void
  const stopped = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise })
  const abort = () => onStop(aborted())
  const timer = setTimeout(() => onStop(new TutorError('TIMEOUT', '本地模型操作超时，请重新加载模型；网络或显存不足时可选择 1.5B。')), timeoutMs)
  signal?.addEventListener('abort', abort, { once: true })
  return { version, reject, stopped, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) } }
}

interface Adapter { features: { has: (feature: string) => boolean } }
interface GpuNavigator { gpu?: { requestAdapter: (options?: { powerPreference: string }) => Promise<Adapter | null> } }
async function getAdapter(): Promise<Adapter> {
  const gpu = (globalThis.navigator as unknown as GpuNavigator | undefined)?.gpu
  if (!gpu) throw new TutorError('GPU_UNSUPPORTED', '当前浏览器不支持 WebGPU。请使用最新版 Chrome / Edge，并在 HTTPS 或 localhost 网页中开启硬件加速。')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const adapter = await Promise.race([gpu.requestAdapter({ powerPreference: 'high-performance' }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new TutorError('GPU_UNSUPPORTED', 'WebGPU 检测超时，请检查浏览器硬件加速与显卡驱动。')), 15000) })])
    if (!adapter) throw new TutorError('GPU_UNSUPPORTED', '浏览器没有可用的 WebGPU 显卡，请检查硬件加速、驱动和浏览器设置。')
    return adapter
  } catch (error) {
    if (error instanceof TutorError) throw error
    throw new TutorError('GPU_UNSUPPORTED', '无法访问 WebGPU，请检查浏览器硬件加速与显卡驱动。')
  } finally { clearTimeout(timer) }
}
export async function checkGpuSupport(): Promise<{ supported: boolean; reason: string }> {
  try { const adapter = await getAdapter(); return { supported: true, reason: adapter.features.has('shader-f16') ? 'WebGPU 可用，支持 FP16 模型。' : 'WebGPU 可用；将使用 FP32 兼容模型。' } }
  catch (error) { return { supported: false, reason: error instanceof Error ? error.message : 'WebGPU 不可用。' } }
}
function savedSource(): LocalModelSource { try { return localStorage.getItem('codegrow-model-source') === 'mirror' ? 'mirror' : 'official' } catch { return 'official' } }

/** Explicit loading only. Model URLs come from WebLLM's pinned catalog, never from arbitrary user URLs. */
export async function loadLocalTutor(modelId: string = DEFAULT_LOCAL_MODEL_ID, signal?: AbortSignal, source: LocalModelSource = savedSource()): Promise<void> {
  if (signal?.aborted) throw aborted()
  if (!LOCAL_TUTOR_MODELS.some((model) => model.id === modelId) || !['official', 'mirror'].includes(source)) throw new TutorError('INVALID_REQUEST', '请选择 CodeGrow 支持的模型和下载来源。')
  if (loadJob || generationJob) throw new TutorError('BUSY', '模型正在加载或回答，请先停止当前操作。')
  if (engine && state.modelId === modelId && state.source === source && state.status === 'ready') return
  destroyResources(); version += 1
  const currentVersion = version
  update({ status: 'checking', modelId, source, progress: 0, text: '正在检查 WebGPU 支持…' })
  const fail = (error: Error) => {
    if (version !== currentVersion) return
    loadJob?.reject(error); generationJob?.reject(error)
    version += 1; destroyResources()
    update(error.name === 'AbortError' ? { status: 'idle', progress: 0, text: '模型加载已取消，可重新加载。' } : { status: 'error', modelId, source, progress: 0, text: '模型加载失败', error: error.message })
  }
  const currentJob = job(20 * 60 * 1000, signal, fail); loadJob = currentJob
  const stillActive = () => { if (version !== currentVersion || signal?.aborted) throw aborted() }
  try {
    await Promise.race([(async () => {
      const adapter = await getAdapter(); stillActive()
      if (modelId.includes('q4f16') && !adapter.features.has('shader-f16')) modelId = modelId.replace('q4f16', 'q4f32')
      const webllm = await import('@mlc-ai/web-llm'); stillActive()
      const original = webllm.prebuiltAppConfig.model_list.find((record) => record.model_id === modelId)
      if (!original || new URL(original.model).origin !== 'https://huggingface.co' || !original.model_lib.startsWith('https://raw.githubusercontent.com/mlc-ai/')) throw new TutorError('MODEL_ERROR', '当前 WebLLM 版本没有可信的模型配置。')
      const record = { ...original, model: source === 'mirror' ? original.model.replace('https://huggingface.co/', 'https://hf-mirror.com/') : original.model }
      const createdWorker = new Worker(new URL('./tutor.worker.ts', import.meta.url), { type: 'module' }); worker = createdWorker
      const workerFailure = () => fail(new TutorError('MODEL_ERROR', '模型工作线程或 GPU 运行失败。请重新加载，显存不足时选择较小模型。'))
      createdWorker.addEventListener('error', workerFailure); createdWorker.addEventListener('messageerror', workerFailure)
      update({ status: 'loading', modelId, source, progress: 0, text: source === 'mirror' ? '正在从第三方 HF-Mirror 下载模型…' : '正在从 Hugging Face 下载模型…' })
      const loaded = await webllm.CreateWebWorkerMLCEngine(createdWorker, modelId, {
        appConfig: { ...webllm.prebuiltAppConfig, model_list: [record] },
        initProgressCallback: (report) => {
          if (version !== currentVersion || !loadJob) return
          update({ status: 'loading', modelId, source, progress: Number.isFinite(report.progress) ? Math.max(0, Math.min(1, report.progress)) : 0, text: report.text || '正在加载模型…' })
        },
      }, { context_window_size: 4096 })
      stillActive(); engine = loaded
      update({ status: 'ready', modelId, source, progress: 1, text: '模型已就绪，问题与代码将在此浏览器中推理。' })
    })(), currentJob.stopped])
  } catch (error) {
    const failure = error instanceof TutorError || (error instanceof Error && error.name === 'AbortError') ? error : new TutorError('MODEL_ERROR', `本地模型加载失败：${error instanceof Error ? error.message : '请检查网络与显存'}。可重试或切换较小模型。`)
    if (version === currentVersion) fail(failure)
    throw failure
  } finally { currentJob.cleanup(); if (loadJob === currentJob) loadJob = null }
}

export async function generateLocalTutor(request: TutorRequest, signal?: AbortSignal, onToken?: (text: string) => void): Promise<TutorReply> {
  if (signal?.aborted) throw aborted()
  const messages = buildLocalTutorMessages(request)
  if (generationJob || loadJob) throw new TutorError('BUSY', '模型正在处理其他操作，请稍后再发送。')
  if (!engine || state.status !== 'ready') throw new TutorError('MODEL_NOT_LOADED', '本地 AI 模型尚未加载。请点击加载模型；也可以在设置中切换到云端导师。')
  const currentEngine = engine
  const currentVersion = version
  const loadedState = state
  update({ ...loadedState, status: 'generating', text: '本地模型正在思考…', error: undefined })
  const stop = (error: Error) => {
    if (version !== currentVersion) return
    generationJob?.reject(error); version += 1; destroyResources()
    update(error.name === 'AbortError' ? { status: 'idle', progress: 0, text: '回复已停止，模型已释放；可从缓存重新加载。' } : { status: 'error', modelId: loadedState.modelId, source: loadedState.source, progress: 0, text: '本地模型回复失败', error: error.message })
  }
  const currentJob = job(120000, signal, stop); generationJob = currentJob
  try {
    return await Promise.race([(async () => {
      const chunks = await currentEngine.chat.completions.create({ model: loadedState.modelId, messages, stream: true, max_tokens: 512, temperature: 0.6, top_p: 0.9 })
      let content = ''
      for await (const chunk of chunks) {
        if (version !== currentVersion || signal?.aborted) throw aborted()
        content += chunk.choices[0]?.delta.content ?? ''
        if (content.length > 12000) throw new TutorError('INVALID_RESPONSE', '模型回复异常过长，请重新加载后重试。')
        onToken?.(content)
      }
      if (version !== currentVersion || signal?.aborted) throw aborted()
      if (!content.trim()) throw new TutorError('INVALID_RESPONSE', '本地模型没有生成有效回复，请重新加载或缩短问题后重试。')
      update({ ...loadedState, status: 'ready', text: '模型已就绪，问题与代码将在此浏览器中推理。' })
      return { content, source: 'local-model' as const }
    })(), currentJob.stopped])
  } catch (error) {
    const failure = error instanceof TutorError || (error instanceof Error && error.name === 'AbortError') ? error : new TutorError('MODEL_ERROR', `本地模型生成失败：${error instanceof Error ? error.message : '未知错误'}。请重新加载模型；显存不足时可选择 1.5B。`)
    if (version === currentVersion) stop(failure)
    throw failure
  } finally { currentJob.cleanup(); if (generationJob === currentJob) generationJob = null }
}
