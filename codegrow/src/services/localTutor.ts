import { TutorError, type TutorReply, type TutorRequest } from './tutor'
import { buildLocalTutorMessages } from './tutorPrompt'
import { LocalTutorWorkerClient } from './localTutorClient'
import { DEFAULT_LOCAL_MODEL_ID, LOCAL_TUTOR_PHASE_LABELS, validateLocalModel, type LocalModelSource, type LocalTutorPhase, type ModelSources } from './localTutorProtocol'
export { DEFAULT_LOCAL_MODEL_ID, LOCAL_TUTOR_MODELS, LOCAL_TUTOR_PHASE_LABELS } from './localTutorProtocol'
export type { LocalModelSource } from './localTutorProtocol'

export interface LocalTutorState {
  status: 'idle' | 'checking' | 'loading' | 'ready' | 'generating' | 'error'
  modelId?: string
  source?: LocalModelSource
  progress: number
  text: string
  error?: string
  phase?: LocalTutorPhase
  phaseProgress?: number
  elapsedSeconds?: number
}

let state: LocalTutorState = { status: 'idle', progress: 0, text: '选择模型并点击加载后，才会下载模型文件。' }
const subscribers = new Set<() => void>()
let client: LocalTutorWorkerClient | null = null
let version = 0
interface Job { version: number; reject: (error: Error) => void; stopped: Promise<never>; cleanup: () => void }
let loadJob: Job | null = null
let generationJob: Job | null = null

export const getLocalTutorState = (): LocalTutorState => state
export function subscribeLocalTutor(listener: () => void): () => void { subscribers.add(listener); return () => { subscribers.delete(listener) } }
function update(next: LocalTutorState): void { state = next; for (const listener of subscribers) listener() }
const aborted = () => new DOMException('请求已取消', 'AbortError')

function destroyResources(): void {
  client?.dispose(); client = null
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
  if (!validateLocalModel(modelId, source)) throw new TutorError('INVALID_REQUEST', '请选择 CodeGrow 支持的模型和下载来源。')
  if (loadJob || generationJob) throw new TutorError('BUSY', '模型正在加载或回答，请先停止当前操作。')
  if (client && state.modelId === modelId && state.source === source && state.status === 'ready') return
  destroyResources(); version += 1
  const currentVersion = version
  update({ status: 'checking', modelId, source, progress: 0, phase: 'gpu-check', text: '正在检查 WebGPU 支持…' })
  const fail = (error: Error) => {
    if (version !== currentVersion) return
    const phase = state.phase
    const reason = /quota|storage|disk|space/i.test(error.message) ? '浏览器存储空间或配额可能不足。请先导出学习档案，检查磁盘与网站存储设置，不要清除全部网站数据。' : '请用“诊断两个下载来源”分别检查权重与运行库；GPU 或显存错误可尝试 1.5B。'
    loadJob?.reject(error); generationJob?.reject(error)
    version += 1; destroyResources()
    update(error.name === 'AbortError' ? { status: 'idle', progress: 0, text: '模型加载已取消，可重新加载。' } : { status: 'error', modelId, source, phase, progress: 0, text: '模型加载失败', error: `${phase ? `${LOCAL_TUTOR_PHASE_LABELS[phase]}：` : ''}${error.message} ${reason}` })
  }
  const currentJob = job(20 * 60 * 1000, signal, fail); loadJob = currentJob
  const stillActive = () => { if (version !== currentVersion || signal?.aborted) throw aborted() }
  try {
    await Promise.race([(async () => {
      const adapter = await getAdapter(); stillActive()
      if (modelId.includes('q4f16') && !adapter.features.has('shader-f16')) modelId = modelId.replace('q4f16', 'q4f32')
      update({ status: 'loading', modelId, source, progress: 0, phase: 'worker', text: '正在加载 AI 引擎 JavaScript；模型权重尚未开始下载。' })
      const createdClient = new LocalTutorWorkerClient(fail); client = createdClient
      await createdClient.request<void>({ kind: 'load', modelId, source }, { progress: report => {
        if (version !== currentVersion || !loadJob) return
        update({ status: 'loading', modelId, source, progress: report.progress ?? 0, phase: report.phase, phaseProgress: report.progress, elapsedSeconds: report.elapsedSeconds, text: report.text })
      } })
      stillActive()
      update({ status: 'ready', modelId, source, progress: 1, phase: 'ready', text: '模型已就绪，问题与代码将在此浏览器中推理。' })
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
  if (!client || state.status !== 'ready') throw new TutorError('MODEL_NOT_LOADED', '本地 AI 模型尚未加载。请点击加载模型；也可以在设置中切换到云端导师。')
  const currentClient = client
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
      const content = await currentClient.request<string>({ kind: 'generate', modelId: loadedState.modelId!, messages }, { token: text => {
        if (version === currentVersion && !signal?.aborted) onToken?.(text)
      } })
      if (version !== currentVersion || signal?.aborted) throw aborted()
      if (typeof content !== 'string' || !content.trim() || content.length > 12000) throw new TutorError('INVALID_RESPONSE', '本地模型没有生成有效回复，请重新加载或缩短问题后重试。')
      update({ ...loadedState, status: 'ready', text: '模型已就绪，问题与代码将在此浏览器中推理。' })
      return { content, source: 'local-model' as const }
    })(), currentJob.stopped])
  } catch (error) {
    const failure = error instanceof TutorError || (error instanceof Error && error.name === 'AbortError') ? error : new TutorError('MODEL_ERROR', `本地模型生成失败：${error instanceof Error ? error.message : '未知错误'}。请重新加载模型；显存不足时可选择 1.5B。`)
    if (version === currentVersion) stop(failure)
    throw failure
  } finally { currentJob.cleanup(); if (generationJob === currentJob) generationJob = null }
}

async function inspectModel<T>(kind: 'cache' | 'sources', modelId: string, source: LocalModelSource): Promise<T> {
  if (!validateLocalModel(modelId, source)) throw new TutorError('INVALID_REQUEST', '请选择支持的模型和下载来源。')
  const inspector = new LocalTutorWorkerClient()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([inspector.request<T>({ kind, modelId, source }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new TutorError('TIMEOUT', '缓存检查或资源目录加载超时，请检查网站连接后重试。')), 15000) })])
  } finally { clearTimeout(timer); inspector.dispose() }
}

/** User initiated; WebLLM checks its cached tensor index/shard keys, not GPU readiness or every auxiliary file. */
export function checkLocalModelCache(modelId: string, source: LocalModelSource): Promise<boolean> {
  return inspectModel<boolean>('cache', modelId, source)
}
export interface ModelNetworkDiagnostic { label: string; url: string; ok: boolean; durationMs: number; detail: string }
/** Only tiny configuration metadata and a HEAD request; no model-weight download, automatic mirror or TLS downgrade. */
export async function diagnoseModelNetwork(modelId: string, source: LocalModelSource): Promise<ModelNetworkDiagnostic[]> {
  const sources = await inspectModel<ModelSources>('sources', modelId, source)
  const probes = [{ label: source === 'mirror' ? 'HF Mirror 权重来源（小配置）' : 'Hugging Face 权重来源（小配置）', url: `${sources.model.replace(/\/+$/, '')}/resolve/main/mlc-chat-config.json`, method: 'GET' }, { label: '官方模型运行库（raw GitHub）', url: sources.model_lib, method: 'HEAD' }]
  return Promise.all(probes.map(async probe => {
    const controller = new AbortController(); const start = performance.now()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(probe.url, { method: probe.method, signal: controller.signal, credentials: 'omit' })
      await response.body?.cancel()
      return { label: probe.label, url: probe.url, ok: response.ok, durationMs: Math.round(performance.now() - start), detail: `HTTP ${response.status}；仅验证此请求可达，不代表所有分片可达或下载速度。` }
    } catch (error) {
      return { label: probe.label, url: probe.url, ok: false, durationMs: Math.round(performance.now() - start), detail: controller.signal.aborted ? '12 秒超时；请检查网络连接。' : `请求失败（网络、跨域 CORS 或服务限制）：${error instanceof Error ? error.message : '未知错误'}` }
    } finally { clearTimeout(timer) }
  }))
}
