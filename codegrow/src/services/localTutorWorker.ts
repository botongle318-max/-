import { CreateMLCEngine, hasModelInCache, prebuiltAppConfig, type AppConfig, type MLCEngineInterface } from '@mlc-ai/web-llm'
import { TutorError } from './tutorError'
import { modelProgress } from './localTutorProgress'
import { validateLocalModel, type LocalModelSource, type LocalTutorWorkerRequest, type LocalTutorWorkerResponse } from './localTutorProtocol'

function modelConfig(modelId: string, source: LocalModelSource): AppConfig {
  if (!validateLocalModel(modelId, source)) throw new TutorError('INVALID_REQUEST', '请选择 CodeGrow 支持的模型和下载来源。')
  const original = prebuiltAppConfig.model_list.find(record => record.model_id === modelId)
  if (!original || new URL(original.model).origin !== 'https://huggingface.co' || !original.model_lib.startsWith('https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/')) throw new TutorError('MODEL_ERROR', '当前 WebLLM 版本没有可信的模型配置。')
  // Preserve every pinned catalog field, including optional integrity metadata. Only the explicitly selected weight origin changes.
  const record = { ...original, model: source === 'mirror' ? original.model.replace('https://huggingface.co/', 'https://hf-mirror.com/') : original.model }
  return { ...prebuiltAppConfig, cacheBackend: 'cache', model_list: [record] }
}

export function createLocalTutorWorkerHandler(post: (message: LocalTutorWorkerResponse) => void): (request: LocalTutorWorkerRequest) => Promise<void> {
  let engine: MLCEngineInterface | null = null
  let loadedModel: string | undefined
  let busy = false
  return async request => {
    const id = request.id
    try {
      if (request.kind === 'cache' || request.kind === 'sources') {
        const config = modelConfig(request.modelId, request.source)
        const value = request.kind === 'cache' ? await hasModelInCache(request.modelId, config) : { model: config.model_list[0].model, model_lib: config.model_list[0].model_lib }
        post({ id, kind: 'result', value }); return
      }
      if (busy) throw new TutorError('BUSY', '模型正在加载或回答，请先停止当前操作。')
      busy = true
      try {
        if (request.kind === 'load') {
          const appConfig = modelConfig(request.modelId, request.source)
          post({ id, kind: 'progress', report: { phase: 'runtime', text: '正在读取配置、模型运行库并初始化 WebGPU；镜像仅替换权重来源，运行库仍来自 raw.githubusercontent.com。' } })
          engine = await CreateMLCEngine(request.modelId, { appConfig, initProgressCallback: report => post({ id, kind: 'progress', report: modelProgress(report) }) }, { context_window_size: 4096 })
          loadedModel = request.modelId
          post({ id, kind: 'result', value: undefined })
        } else if (request.kind === 'generate') {
          if (!engine || loadedModel !== request.modelId) throw new TutorError('MODEL_NOT_LOADED', '本地 AI 模型尚未加载，请先启动模型。')
          const chunks = await engine.chat.completions.create({ model: request.modelId, messages: request.messages, stream: true, max_tokens: 512, temperature: 0.6, top_p: 0.9 })
          let content = ''
          for await (const chunk of chunks) {
            content += chunk.choices[0]?.delta.content ?? ''
            if (content.length > 12000) throw new TutorError('INVALID_RESPONSE', '模型回复异常过长，请重新加载后重试。')
            post({ id, kind: 'chunk', text: content })
          }
          if (!content.trim()) throw new TutorError('INVALID_RESPONSE', '本地模型没有生成有效回复，请重新加载或缩短问题后重试。')
          post({ id, kind: 'result', value: content })
        }
      } finally { busy = false }
    } catch (error) {
      const failure = error instanceof TutorError ? error : new TutorError('MODEL_ERROR', error instanceof Error ? error.message : '模型操作失败，请检查网络和显存。')
      post({ id, kind: 'error', error: { code: failure.code, message: failure.message } })
    }
  }
}
