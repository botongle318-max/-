import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelLocalTutorLoad, checkGpuSupport, DEFAULT_LOCAL_MODEL_ID, generateLocalTutor, getLocalTutorState, LOCAL_TUTOR_MODELS, loadLocalTutor, subscribeLocalTutor, unloadLocalTutor } from '../src/services/localTutor'
import type { TutorRequest } from '../src/services/tutor'

const fixture = vi.hoisted(() => {
  const ids = ['Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC', 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC']
  return { factory: vi.fn(), create: vi.fn(), interrupt: vi.fn(), appConfig: { model_list: ids.map((id) => ({ model_id: id, model: `https://huggingface.co/mlc-ai/${id}`, model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/test-fixture.wasm' })) } }
})
// Explicit engine fixture only: this test never downloads weights or claims actual GPU inference ran.
vi.mock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: fixture.factory, prebuiltAppConfig: fixture.appConfig }))
const request: TutorRequest = { message: '我已经能读取数字了，下一步呢？', code: 'int number;', lessonTitle: '猜数字游戏' }
class FakeWorker extends EventTarget { static instances: FakeWorker[] = []; terminate = vi.fn(); constructor(..._args: unknown[]) { super(); FakeWorker.instances.push(this) } }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const fakeEngine = () => ({ chat: { completions: { create: fixture.create } }, interruptGenerate: fixture.interrupt })
const gpu = (fp16 = true) => vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: new Set(fp16 ? ['shader-f16'] : []) }) } })
async function waitForFactory() { await vi.waitFor(() => expect(fixture.factory).toHaveBeenCalled()) }
beforeEach(async () => {
  await unloadLocalTutor(); FakeWorker.instances = []; fixture.factory.mockReset(); fixture.create.mockReset(); fixture.interrupt.mockReset()
  fixture.factory.mockResolvedValue(fakeEngine()); vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('localStorage', { getItem: () => null }); vi.stubGlobal('fetch', vi.fn()); gpu()
  fixture.create.mockImplementation(async () => (async function* () { yield { choices: [{ delta: { content: '模型测试夹具：先比较输入与目标。' } }] } })())
})
afterEach(async () => { await unloadLocalTutor(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('explicit WebGPU model lifecycle', () => {
  it('never loads a model or downloads weights merely by importing or asking before readiness', async () => {
    expect(getLocalTutorState().status).toBe('idle'); expect(fixture.factory).not.toHaveBeenCalled()
    await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'MODEL_NOT_LOADED' }); expect(fixture.factory).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it('detects unsupported WebGPU without starting a worker', async () => {
    vi.stubGlobal('navigator', {}); expect((await checkGpuSupport()).supported).toBe(false)
    await expect(loadLocalTutor()).rejects.toMatchObject({ code: 'GPU_UNSUPPORTED' }); expect(getLocalTutorState().status).toBe('error'); expect(FakeWorker.instances).toHaveLength(0)
  })
  it('requires one of the four allowlisted model IDs and two fixed sources', async () => {
    expect(LOCAL_TUTOR_MODELS).toHaveLength(4); await expect(loadLocalTutor('https://evil.example/model')).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(loadLocalTutor(DEFAULT_LOCAL_MODEL_ID, undefined, 'arbitrary' as never)).rejects.toMatchObject({ code: 'INVALID_REQUEST' }); expect(fixture.factory).not.toHaveBeenCalled()
  })
  it('reports immutable loading state and clamps progress until actual initialization completes', async () => {
    const pending = deferred<ReturnType<typeof fakeEngine>>(); fixture.factory.mockReturnValue(pending.promise)
    const notify = vi.fn(); const unsubscribe = subscribeLocalTutor(notify); const initial = getLocalTutorState(); const loading = loadLocalTutor(); await waitForFactory()
    expect(getLocalTutorState()).not.toBe(initial); expect(getLocalTutorState().status).toBe('loading')
    const config = fixture.factory.mock.calls[0][2]; config.initProgressCallback({ progress: 0.4, text: 'explicit mock download', timeElapsed: 1 })
    expect(getLocalTutorState()).toMatchObject({ progress: 0.4, text: 'explicit mock download', status: 'loading' })
    config.initProgressCallback({ progress: 1.5, text: 'initializing', timeElapsed: 2 }); expect(getLocalTutorState().progress).toBe(1)
    pending.resolve(fakeEngine()); await loading; expect(getLocalTutorState()).toMatchObject({ status: 'ready', progress: 1, modelId: DEFAULT_LOCAL_MODEL_ID }); expect(notify).toHaveBeenCalled(); unsubscribe()
  })
  it('uses the FP32 sibling if the adapter lacks shader-f16', async () => {
    gpu(false); await loadLocalTutor(); const actual = DEFAULT_LOCAL_MODEL_ID.replace('q4f16', 'q4f32')
    expect(fixture.factory.mock.calls[0][1]).toBe(actual); expect(getLocalTutorState().modelId).toBe(actual)
  })
  it('uses a catalog-derived third-party mirror only when explicitly selected and preserves official wasm', async () => {
    await loadLocalTutor(DEFAULT_LOCAL_MODEL_ID, undefined, 'mirror'); const record = fixture.factory.mock.calls[0][2].appConfig.model_list[0]
    expect(record.model).toBe(`https://hf-mirror.com/mlc-ai/${DEFAULT_LOCAL_MODEL_ID}`); expect(record.model_lib).toBe(fixture.appConfig.model_list[0].model_lib); expect(getLocalTutorState().source).toBe('mirror')
  })
  it('does not auto-switch to a mirror after an official source failure and supports a fresh retry', async () => {
    fixture.factory.mockRejectedValueOnce(new Error('official source unavailable'))
    await expect(loadLocalTutor()).rejects.toMatchObject({ code: 'MODEL_ERROR' }); expect(fixture.factory).toHaveBeenCalledTimes(1); expect(getLocalTutorState().source).toBe('official')
    await loadLocalTutor(); expect(getLocalTutorState().status).toBe('ready'); expect(fixture.factory).toHaveBeenCalledTimes(2)
  })
  it('rejects concurrent loading rather than racing two model allocations', async () => {
    const pending = deferred<ReturnType<typeof fakeEngine>>(); fixture.factory.mockReturnValue(pending.promise); const loading = loadLocalTutor(); await waitForFactory()
    await expect(loadLocalTutor(LOCAL_TUTOR_MODELS[1].id)).rejects.toMatchObject({ code: 'BUSY' }); cancelLocalTutorLoad(); await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    pending.resolve(fakeEngine())
  })
  it('cancels a hung load, terminates its worker, and ignores late progress or factory completion', async () => {
    const pending = deferred<ReturnType<typeof fakeEngine>>(); fixture.factory.mockReturnValue(pending.promise); const loading = loadLocalTutor(); await waitForFactory(); const config = fixture.factory.mock.calls[0][2]
    cancelLocalTutorLoad(); await expect(loading).rejects.toMatchObject({ name: 'AbortError' }); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled(); expect(getLocalTutorState().status).toBe('idle')
    config.initProgressCallback({ progress: 1, text: 'stale callback', timeElapsed: 1 }); pending.resolve(fakeEngine()); await Promise.resolve(); expect(getLocalTutorState().status).toBe('idle'); expect(getLocalTutorState().text).not.toContain('stale')
  })
  it('clears readiness after a worker crash or GPU failure', async () => {
    await loadLocalTutor(); FakeWorker.instances[0].dispatchEvent(new Event('error')); expect(getLocalTutorState().status).toBe('error')
    await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'MODEL_NOT_LOADED' }); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
  it('bounds a hung adapter probe and reports a clear GPU failure', async () => {
    vi.useFakeTimers(); vi.stubGlobal('navigator', { gpu: { requestAdapter: () => new Promise(() => {}) } })
    const loading = loadLocalTutor(); const assertion = expect(loading).rejects.toMatchObject({ code: 'GPU_UNSUPPORTED' })
    await vi.advanceTimersByTimeAsync(15000); await assertion; expect(getLocalTutorState().status).toBe('error'); expect(fixture.factory).not.toHaveBeenCalled()
  })
  it('bounds a stalled model download, terminates its worker and enables a clean retry', async () => {
    const pending = deferred<ReturnType<typeof fakeEngine>>(); fixture.factory.mockReturnValueOnce(pending.promise)
    vi.useFakeTimers(); const loading = loadLocalTutor(); const assertion = expect(loading).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1); expect(fixture.factory).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000); await assertion; expect(getLocalTutorState().status).toBe('error'); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
    vi.useRealTimers(); await loadLocalTutor(); expect(getLocalTutorState().status).toBe('ready'); pending.resolve(fakeEngine()); await Promise.resolve(); expect(getLocalTutorState().status).toBe('ready')
  })
})

describe('real engine calls and bounded inference', () => {
  it('streams actual model chunks as cumulative text and returns the local-model source', async () => {
    fixture.create.mockImplementation(async () => (async function* () { yield { choices: [{ delta: { content: '第一步：' } }] }; yield { choices: [{ delta: { content: '比较输入。' } }] } })())
    await loadLocalTutor(); const token = vi.fn(); const reply = await generateLocalTutor(request, undefined, token)
    expect(reply).toEqual({ content: '第一步：比较输入。', source: 'local-model' }); expect(token.mock.calls.map((call) => call[0])).toEqual(['第一步：', '第一步：比较输入。'])
    expect(fixture.create.mock.calls[0][0]).toMatchObject({ stream: true, max_tokens: 512 }); expect(getLocalTutorState().status).toBe('ready')
  })
  it('does not invent replies when the model errors or emits no content', async () => {
    await loadLocalTutor(); fixture.create.mockRejectedValueOnce(new Error('GPU device lost')); await expect(generateLocalTutor(request)).rejects.toThrow('GPU device lost'); expect(getLocalTutorState().status).toBe('error')
    await loadLocalTutor(); fixture.create.mockImplementation(async () => (async function* () {})()); await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(getLocalTutorState().status).toBe('error')
  })
  it('rejects concurrent inference without queuing extra generations or model allocations', async () => {
    await loadLocalTutor(); const pending = deferred<AsyncIterable<never>>(); fixture.create.mockReturnValue(pending.promise); const controller = new AbortController(); const generation = generateLocalTutor(request, controller.signal)
    await expect(generateLocalTutor(request)).rejects.toMatchObject({ code: 'BUSY' }); controller.abort(); await expect(generation).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('aborts a hung generation immediately and terminates the worker as the cancellation backstop', async () => {
    await loadLocalTutor(); fixture.create.mockReturnValue(new Promise(() => {})); const controller = new AbortController(); const generation = generateLocalTutor(request, controller.signal); controller.abort()
    await expect(generation).rejects.toMatchObject({ name: 'AbortError' }); expect(fixture.interrupt).toHaveBeenCalled(); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled(); expect(getLocalTutorState().status).toBe('idle')
  })
  it('unloads pending inference without letting its late reply overwrite a fresh model state', async () => {
    await loadLocalTutor(); const pending = deferred<AsyncIterable<never>>(); fixture.create.mockReturnValueOnce(pending.promise); const generation = generateLocalTutor(request)
    await unloadLocalTutor(); await expect(generation).rejects.toMatchObject({ name: 'AbortError' }); await loadLocalTutor(LOCAL_TUTOR_MODELS[1].id)
    pending.resolve((async function* () {})()); await Promise.resolve(); expect(getLocalTutorState()).toMatchObject({ status: 'ready', modelId: LOCAL_TUTOR_MODELS[1].id })
  })
  it('times out stalled inference and leaves a recoverable error state', async () => {
    await loadLocalTutor(); vi.useFakeTimers(); fixture.create.mockReturnValue(new Promise(() => {})); const generation = generateLocalTutor(request); const assertion = expect(generation).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(120000); await assertion; expect(getLocalTutorState().status).toBe('error'); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled()
  })
})
