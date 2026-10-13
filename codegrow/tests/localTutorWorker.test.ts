import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalTutorWorkerHandler } from '../src/services/localTutorWorker'
import { modelProgress } from '../src/services/localTutorProgress'
import { DEFAULT_LOCAL_MODEL_ID, LOCAL_TUTOR_MODELS, type LocalTutorWorkerResponse } from '../src/services/localTutorProtocol'

const fixture = vi.hoisted(() => {
  const ids = ['Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC', 'Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC']
  return { factory: vi.fn(), create: vi.fn(), cached: vi.fn(), config: { cacheBackend: 'cache' as const, model_list: ids.map(id => ({ model_id: id, model: `https://huggingface.co/mlc-ai/${id}`, model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/fixture.wasm', integrity: { config: 'sha256-fixture-config', model_lib: 'sha256-fixture-wasm', onFailure: 'error' } })) } }
})
// Actual worker business handler with a mocked WebLLM engine; no physical GPU or weights are used.
vi.mock('@mlc-ai/web-llm', () => ({ CreateMLCEngine: fixture.factory, hasModelInCache: fixture.cached, prebuiltAppConfig: fixture.config }))
const messages = [{ role: 'user' as const, content: '怎么读取变量？' }]
beforeEach(() => {
  fixture.factory.mockReset(); fixture.create.mockReset(); fixture.cached.mockReset()
  fixture.factory.mockResolvedValue({ chat: { completions: { create: fixture.create } } }); fixture.cached.mockResolvedValue(false)
  fixture.create.mockImplementation(async () => (async function* () { yield { choices: [{ delta: { content: '第一步：' } }] }; yield { choices: [{ delta: { content: '理解变量。' } }] } })())
})
function handler() { const output: LocalTutorWorkerResponse[] = []; return { output, handle: createLocalTutorWorkerHandler(message => output.push(message)) } }

describe('worker model configuration and cache', () => {
  it('creating the handler never starts engines, network downloads or GPU allocation', () => { handler(); expect(fixture.factory).not.toHaveBeenCalled(); expect(fixture.cached).not.toHaveBeenCalled() })
  it('loads the selected model only on request and preserves catalog integrity and cache backend', async () => {
    const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' })
    expect(fixture.factory).toHaveBeenCalledTimes(1); expect(fixture.factory.mock.calls[0][0]).toBe(DEFAULT_LOCAL_MODEL_ID)
    const config = fixture.factory.mock.calls[0][1].appConfig
    expect(config.cacheBackend).toBe('cache'); expect(config.model_list[0]).toEqual(fixture.config.model_list[0]); expect(config.model_list[0].integrity).toEqual(fixture.config.model_list[0].integrity)
    expect(fixture.factory.mock.calls[0][2]).toEqual({ context_window_size: 4096 }); expect(output[0]).toMatchObject({ kind: 'progress', report: { phase: 'runtime' } }); expect(output.at(-1)).toMatchObject({ kind: 'result' })
  })
  it('mirror changes only the explicitly selected weight origin, preserving official runtime and integrity', async () => {
    const { handle } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'mirror' }); const record = fixture.factory.mock.calls[0][1].appConfig.model_list[0]
    expect(record.model).toBe(`https://hf-mirror.com/mlc-ai/${DEFAULT_LOCAL_MODEL_ID}`); expect(record.model_lib).toBe(fixture.config.model_list[0].model_lib); expect(record.integrity).toEqual(fixture.config.model_list[0].integrity)
  })
  it('checks cache against the same source-specific AppConfig without starting an engine', async () => {
    fixture.cached.mockResolvedValue(true); const { handle, output } = handler(); await handle({ id: 4, kind: 'cache', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'mirror' })
    expect(fixture.cached.mock.calls[0][0]).toBe(DEFAULT_LOCAL_MODEL_ID); expect(fixture.cached.mock.calls[0][1].model_list[0].model).toContain('https://hf-mirror.com/'); expect(fixture.cached.mock.calls[0][1].cacheBackend).toBe('cache'); expect(fixture.factory).not.toHaveBeenCalled(); expect(output).toEqual([{ id: 4, kind: 'result', value: true }])
  })
  it('returns source metadata without fetching resources or loading an engine', async () => {
    const { handle, output } = handler(); await handle({ id: 3, kind: 'sources', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); expect(output).toEqual([{ id: 3, kind: 'result', value: { model: fixture.config.model_list[0].model, model_lib: fixture.config.model_list[0].model_lib } }]); expect(fixture.factory).not.toHaveBeenCalled(); expect(fixture.cached).not.toHaveBeenCalled()
  })
  it.each(['arbitrary-id', 'https://evil.example/model'])('rejects unsupported catalog identifier %s', async modelId => {
    const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId, source: 'official' }); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'INVALID_REQUEST' } }); expect(fixture.factory).not.toHaveBeenCalled()
  })
  it('rejects a tampered runtime host before engine loading', async () => {
    const original = fixture.config.model_list[0].model_lib
    try {
      fixture.config.model_list[0].model_lib = 'https://raw.githubusercontent.com/other/repo/untrusted.wasm'
      const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'MODEL_ERROR' } }); expect(fixture.factory).not.toHaveBeenCalled()
    } finally { fixture.config.model_list[0].model_lib = original }
  })
  it('never automatically retries a failed source against a mirror', async () => {
    fixture.factory.mockRejectedValueOnce(new Error('network unavailable')); const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); expect(fixture.factory).toHaveBeenCalledTimes(1); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'MODEL_ERROR', message: 'network unavailable' } })
  })
  it('rejects concurrent load or inference instead of allocating another engine', async () => {
    let resolve!: () => void; fixture.factory.mockReturnValue(new Promise<void>(done => { resolve = done }))
    const { handle, output } = handler(); const pending = handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); await handle({ id: 2, kind: 'load', modelId: LOCAL_TUTOR_MODELS[1].id, source: 'official' }); expect(output.at(-1)).toMatchObject({ id: 2, kind: 'error', error: { code: 'BUSY' } }); expect(fixture.factory).toHaveBeenCalledTimes(1); resolve(); await pending
  })
})

describe('worker generation', () => {
  it('requires an actually loaded matching model', async () => {
    const { handle, output } = handler(); await handle({ id: 1, kind: 'generate', modelId: DEFAULT_LOCAL_MODEL_ID, messages }); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'MODEL_NOT_LOADED' } }); expect(fixture.create).not.toHaveBeenCalled()
  })
  it('calls WebLLM stream generation and forwards only actual cumulative chunks', async () => {
    const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); await handle({ id: 2, kind: 'generate', modelId: DEFAULT_LOCAL_MODEL_ID, messages })
    expect(fixture.create.mock.calls[0][0]).toMatchObject({ model: DEFAULT_LOCAL_MODEL_ID, messages, stream: true, max_tokens: 512, temperature: 0.6, top_p: 0.9 }); expect(output.filter(item => item.kind === 'chunk')).toEqual([{ id: 2, kind: 'chunk', text: '第一步：' }, { id: 2, kind: 'chunk', text: '第一步：理解变量。' }]); expect(output.at(-1)).toEqual({ id: 2, kind: 'result', value: '第一步：理解变量。' })
  })
  it('bounds excessive replies and refuses empty replies', async () => {
    const { handle, output } = handler(); await handle({ id: 1, kind: 'load', modelId: DEFAULT_LOCAL_MODEL_ID, source: 'official' }); fixture.create.mockImplementationOnce(async () => (async function* () { yield { choices: [{ delta: { content: 'x'.repeat(12001) } }] } })()); await handle({ id: 2, kind: 'generate', modelId: DEFAULT_LOCAL_MODEL_ID, messages }); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'INVALID_RESPONSE' } }); fixture.create.mockImplementationOnce(async () => (async function* () {})()); await handle({ id: 3, kind: 'generate', modelId: DEFAULT_LOCAL_MODEL_ID, messages }); expect(output.at(-1)).toMatchObject({ kind: 'error', error: { code: 'INVALID_RESPONSE' } })
  })
})

describe('real WebLLM 0.2.85 phase text classification', () => {
  it.each([
    ['Fetching param cache[2/10]: 20MB fetched.', 'download'], ['Start to fetch params', 'download'],
    ['Loading model from cache[2/10]: 20MB loaded.', 'cache-upload'], ['Loading GPU shader modules[1/10]', 'shaders'], ['Finish loading on WebGPU', 'ready'],
  ])('classifies %s into %s, retaining only this stage percent', (text, phase) => { expect(modelProgress({ text, progress: 0.2, timeElapsed: 5 })).toEqual({ text, phase, progress: 0.2, elapsedSeconds: 5 }) })
  it('uses indeterminate progress before weight callbacks and clamps invalid numbers', () => {
    expect(modelProgress({ text: 'Loading configuration', progress: 1 })).not.toHaveProperty('progress'); expect(modelProgress({ text: 'Fetching param cache', progress: 1.4 }).progress).toBe(1); expect(modelProgress({ text: 'Fetching param cache', progress: NaN }).progress).toBe(0)
  })
})
