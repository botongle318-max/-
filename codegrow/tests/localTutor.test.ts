import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelLocalTutorLoad, checkGpuSupport, checkLocalModelCache, diagnoseModelNetwork, DEFAULT_LOCAL_MODEL_ID, generateLocalTutor, getLocalTutorState, LOCAL_TUTOR_MODELS, loadLocalTutor, subscribeLocalTutor, unloadLocalTutor } from '../src/services/localTutor'
import type { TutorRequest } from '../src/services/tutor'
import type { LocalTutorWorkerRequest, LocalTutorWorkerResponse } from '../src/services/localTutorProtocol'

// Explicit RPC fixtures only; this suite never downloads weights or claims actual GPU inference.
const request: TutorRequest = { message: '我已经能读取数字了，下一步呢？', code: 'int number;', lessonTitle: '猜数字游戏' }
const load = vi.fn(), generate = vi.fn(), cache = vi.fn()
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  terminate = vi.fn()
  requests: LocalTutorWorkerRequest[] = []
  constructor(..._args: unknown[]) { super(); FakeWorker.instances.push(this) }
  reply(message: LocalTutorWorkerResponse) { this.dispatchEvent(new MessageEvent('message', { data: message })) }
  postMessage(message: LocalTutorWorkerRequest) {
    this.requests.push(message)
    void (async () => {
      try {
        const value = message.kind === 'load' ? await load(message, this) : message.kind === 'generate' ? await generate(message, this) : message.kind === 'cache' ? await cache(message, this) : { model: `https://${message.source === 'mirror' ? 'hf-mirror.com' : 'huggingface.co'}/mlc-ai/${message.modelId}`, model_lib: 'https://raw.githubusercontent.com/mlc-ai/test-fixture.wasm' }
        this.reply({ id: message.id, kind: 'result', value })
      } catch (error) { this.reply({ id: message.id, kind: 'error', error: { code: 'MODEL_ERROR', message: error instanceof Error ? error.message : 'fixture error' } }) }
    })()
  }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(res => { resolve = res }); return { promise, resolve } }
const gpu = (fp16 = true) => vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: new Set(fp16 ? ['shader-f16'] : []) }) } })
async function waitForLoad() { await vi.waitFor(() => expect(load).toHaveBeenCalled()) }
beforeEach(async () => {
  await unloadLocalTutor(); FakeWorker.instances = []; load.mockReset(); generate.mockReset(); cache.mockReset()
  load.mockResolvedValue(undefined); cache.mockResolvedValue(false)
  generate.mockImplementation(async (message, worker) => { worker.reply({ id: message.id, kind: 'chunk', text: '模型测试夹具：比较输入。' }); return '模型测试夹具：比较输入。' })
  vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('localStorage', { getItem: () => null }); vi.stubGlobal('fetch', vi.fn()); gpu()
})
afterEach(async () => { await unloadLocalTutor(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('explicit worker model lifecycle', () => {
  it('imports and GPU checks never create an engine worker or download weights', async () => {
    expect(getLocalTutorState().status).toBe('idle'); expect((await checkGpuSupport()).supported).toBe(true)
    await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'MODEL_NOT_LOADED' }); expect(FakeWorker.instances).toHaveLength(0); expect(fetch).not.toHaveBeenCalled()
  })
  it('defaults new selections to lightweight 1.5B while keeping all four existing IDs', () => { expect(DEFAULT_LOCAL_MODEL_ID).toContain('1.5B'); expect(LOCAL_TUTOR_MODELS).toHaveLength(4); expect(LOCAL_TUTOR_MODELS.some(model => model.id.includes('7B'))).toBe(true) })
  it('detects unsupported WebGPU without starting a worker', async () => {
    vi.stubGlobal('navigator', {}); expect((await checkGpuSupport()).supported).toBe(false)
    await expect(loadLocalTutor()).rejects.toMatchObject({ code: 'GPU_UNSUPPORTED' }); expect(getLocalTutorState().status).toBe('error'); expect(FakeWorker.instances).toHaveLength(0)
  })
  it('rejects arbitrary model IDs and sources before worker creation', async () => {
    await expect(loadLocalTutor('https://evil.example/model')).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(loadLocalTutor(DEFAULT_LOCAL_MODEL_ID, undefined, 'arbitrary' as never)).rejects.toMatchObject({ code: 'INVALID_REQUEST' }); expect(load).not.toHaveBeenCalled()
  })
  it('reports immutable per-stage progress and waits for actual readiness', async () => {
    const pending = deferred<void>(); load.mockReturnValue(pending.promise)
    const notify = vi.fn(); const unsubscribe = subscribeLocalTutor(notify); const initial = getLocalTutorState(); const loading = loadLocalTutor(); await waitForLoad()
    expect(getLocalTutorState()).not.toBe(initial); expect(getLocalTutorState()).toMatchObject({ status: 'loading', phase: 'worker' })
    const worker = FakeWorker.instances[0], id = worker.requests[0].id
    worker.reply({ id, kind: 'progress', report: { phase: 'download', progress: 1, text: 'weight download complete' } })
    expect(getLocalTutorState()).toMatchObject({ status: 'loading', phaseProgress: 1, phase: 'download' })
    worker.reply({ id, kind: 'progress', report: { phase: 'cache-upload', progress: 0.1, text: 'uploading' } })
    expect(getLocalTutorState()).toMatchObject({ status: 'loading', phaseProgress: 0.1, phase: 'cache-upload' })
    pending.resolve(); await loading; expect(getLocalTutorState()).toMatchObject({ status: 'ready', modelId: DEFAULT_LOCAL_MODEL_ID }); expect(notify).toHaveBeenCalled(); unsubscribe()
  })
  it('uses an FP32 sibling when shader-f16 is absent', async () => { gpu(false); await loadLocalTutor(); expect(load.mock.calls[0][0].modelId).toBe(DEFAULT_LOCAL_MODEL_ID.replace('q4f16', 'q4f32')); expect(getLocalTutorState().modelId).toContain('q4f32') })
  it('keeps the learner-selected 7B and explicit mirror choice', async () => {
    const large = LOCAL_TUTOR_MODELS.find(model => model.id.includes('7B'))!.id
    await loadLocalTutor(large, undefined, 'mirror'); expect(load.mock.calls[0][0]).toMatchObject({ kind: 'load', modelId: large, source: 'mirror' }); expect(getLocalTutorState().source).toBe('mirror')
  })
  it('does not switch to a mirror after an official failure and retries on a fresh worker', async () => {
    load.mockRejectedValueOnce(new Error('official source unavailable')); await expect(loadLocalTutor()).rejects.toMatchObject({ code: 'MODEL_ERROR' }); expect(getLocalTutorState().source).toBe('official'); expect(load).toHaveBeenCalledTimes(1)
    await loadLocalTutor(); expect(getLocalTutorState().status).toBe('ready'); expect(FakeWorker.instances).toHaveLength(2)
  })
  it('rejects concurrent loads and cancels a hung operation', async () => {
    load.mockReturnValue(new Promise(() => {})); const loading = loadLocalTutor(); await waitForLoad()
    await expect(loadLocalTutor(LOCAL_TUTOR_MODELS[1].id)).rejects.toMatchObject({ code: 'BUSY' }); cancelLocalTutorLoad(); await expect(loading).rejects.toMatchObject({ name: 'AbortError' }); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
  it('ignores late progress/completion after cancellation and a new load', async () => {
    const pending = deferred<void>(); load.mockReturnValueOnce(pending.promise); const loading = loadLocalTutor(); await waitForLoad(); const old = FakeWorker.instances[0]
    cancelLocalTutorLoad(); await expect(loading).rejects.toMatchObject({ name: 'AbortError' }); await loadLocalTutor(LOCAL_TUTOR_MODELS[1].id)
    old.reply({ id: old.requests[0].id, kind: 'progress', report: { phase: 'download', progress: 1, text: 'stale callback' } }); pending.resolve(); await Promise.resolve()
    expect(getLocalTutorState()).toMatchObject({ status: 'ready', modelId: LOCAL_TUTOR_MODELS[1].id }); expect(getLocalTutorState().text).not.toContain('stale')
  })
  it.each(['error', 'messageerror'])('clears readiness on worker %s', async kind => { await loadLocalTutor(); FakeWorker.instances[0].dispatchEvent(new Event(kind)); expect(getLocalTutorState().status).toBe('error'); await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'MODEL_NOT_LOADED' }); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled() })
  it('bounds a hung GPU probe to 15 seconds', async () => {
    vi.useFakeTimers(); vi.stubGlobal('navigator', { gpu: { requestAdapter: () => new Promise(() => {}) } }); const loading = loadLocalTutor(); const assertion = expect(loading).rejects.toMatchObject({ code: 'GPU_UNSUPPORTED' })
    await vi.advanceTimersByTimeAsync(15000); await assertion; expect(FakeWorker.instances).toHaveLength(0)
  })
  it('bounds a stalled download and permits retry', async () => {
    load.mockReturnValueOnce(new Promise(() => {})); vi.useFakeTimers(); const loading = loadLocalTutor(); const assertion = expect(loading).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000); await assertion; expect(FakeWorker.instances[0].terminate).toHaveBeenCalled(); vi.useRealTimers(); await loadLocalTutor(); expect(getLocalTutorState().status).toBe('ready')
  })
})

describe('worker inference protocol', () => {
  it('streams cumulative RPC chunks and forwards current messages', async () => {
    generate.mockImplementation(async (message, worker) => { worker.reply({ id: message.id, kind: 'chunk', text: '第一步：' }); worker.reply({ id: message.id, kind: 'chunk', text: '第一步：比较输入。' }); return '第一步：比较输入。' })
    await loadLocalTutor(); const token = vi.fn(); expect(await generateLocalTutor(request, undefined, token)).toEqual({ content: '第一步：比较输入。', source: 'local-model' }); expect(token.mock.calls.map(call => call[0])).toEqual(['第一步：', '第一步：比较输入。']); expect(generate.mock.calls[0][0].messages.at(-1).content).toContain(request.message); expect(getLocalTutorState().status).toBe('ready')
  })
  it('does not invent answers when GPU fails or emits no content', async () => {
    await loadLocalTutor(); generate.mockRejectedValueOnce(new Error('GPU device lost')); await expect(generateLocalTutor(request)).rejects.toThrow('GPU device lost'); expect(getLocalTutorState().status).toBe('error')
    await loadLocalTutor(); generate.mockResolvedValueOnce(''); await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects concurrent inference and immediately terminates on abort', async () => {
    await loadLocalTutor(); generate.mockReturnValue(new Promise(() => {})); const controller = new AbortController(); const generation = generateLocalTutor(request, controller.signal)
    await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'BUSY' }); controller.abort(); await expect(generation).rejects.toMatchObject({ name: 'AbortError' }); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled(); expect(getLocalTutorState().status).toBe('idle')
  })
  it('unloads pending inference without a late response overwriting a new model', async () => {
    await loadLocalTutor(); const pending = deferred<string>(); generate.mockReturnValueOnce(pending.promise); const generation = generateLocalTutor(request); await unloadLocalTutor(); await expect(generation).rejects.toMatchObject({ name: 'AbortError' }); await loadLocalTutor(LOCAL_TUTOR_MODELS[1].id); pending.resolve('late response'); await Promise.resolve(); expect(getLocalTutorState()).toMatchObject({ status: 'ready', modelId: LOCAL_TUTOR_MODELS[1].id })
  })
  it('bounds stalled inference to 120 seconds', async () => {
    await loadLocalTutor(); vi.useFakeTimers(); generate.mockReturnValue(new Promise(() => {})); const generation = generateLocalTutor(request); const assertion = expect(generation).rejects.toMatchObject({ code: 'TIMEOUT' }); await vi.advanceTimersByTimeAsync(120000); await assertion; expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
  it('fails cleanly when a consumer callback throws', async () => {
    await loadLocalTutor(); await expect(generateLocalTutor(request, undefined, () => { throw new Error('consumer callback failed') })).rejects.toThrow('consumer callback failed'); expect(getLocalTutorState().status).toBe('error')
  })
})

describe('explicit cache and network inspection', () => {
  it('checks the selected source on a transient worker without loading GPU or downloading weights', async () => {
    cache.mockResolvedValue(true); expect(await checkLocalModelCache(DEFAULT_LOCAL_MODEL_ID, 'mirror')).toBe(true); expect(cache.mock.calls[0][0]).toMatchObject({ source: 'mirror', modelId: DEFAULT_LOCAL_MODEL_ID }); expect(load).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled(); expect(getLocalTutorState().status).toBe('idle')
  })
  it('bounds a hung cache inspection and terminates its transient worker', async () => {
    cache.mockReturnValue(new Promise(() => {})); vi.useFakeTimers(); const checking = checkLocalModelCache(DEFAULT_LOCAL_MODEL_ID, 'official'); const assertion = expect(checking).rejects.toMatchObject({ code: 'TIMEOUT' }); await vi.advanceTimersByTimeAsync(15000); await assertion; expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
  it('diagnoses the mirror configuration and separate official runtime without reading weights', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('small fixture', { status: 200 })); const results = await diagnoseModelNetwork(DEFAULT_LOCAL_MODEL_ID, 'mirror'); expect(results).toHaveLength(2); expect(results.every(item => item.ok)).toBe(true)
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('https://hf-mirror.com/'); expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('GET'); expect(vi.mocked(fetch).mock.calls[1][0]).toContain('https://raw.githubusercontent.com/'); expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe('HEAD'); expect(load).not.toHaveBeenCalled(); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
  it('reports HTTP and CORS/network failures individually without switching sources', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 })).mockRejectedValueOnce(new TypeError('Failed to fetch')); const results = await diagnoseModelNetwork(DEFAULT_LOCAL_MODEL_ID, 'official'); expect(results[0]).toMatchObject({ ok: false }); expect(results[0].detail).toContain('503'); expect(results[1].detail).toContain('CORS'); expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
  it('retains model readiness while inspecting a different source', async () => {
    await loadLocalTutor(); await checkLocalModelCache(DEFAULT_LOCAL_MODEL_ID, 'mirror'); expect(getLocalTutorState()).toMatchObject({ status: 'ready', source: 'official' }); expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled(); expect(FakeWorker.instances[1].terminate).toHaveBeenCalled()
  })
})
