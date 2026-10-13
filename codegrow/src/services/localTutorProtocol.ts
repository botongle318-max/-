import type { TutorErrorCode } from './tutorError'
import type { TutorModelMessage } from './tutorPrompt'

export type LocalModelSource = 'official' | 'mirror'
export const LOCAL_TUTOR_MODELS = [
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 1.5B · FP16（轻量推荐）', vramMB: 1629.75 },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 7B · FP16（回答更完整）', vramMB: 5106.67 },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC', name: 'Qwen2.5 Coder 1.5B · FP32（兼容轻量）', vramMB: 1888.97 },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC', name: 'Qwen2.5 Coder 7B · FP32（兼容）', vramMB: 5900.09 },
] as const
export const DEFAULT_LOCAL_MODEL_ID = LOCAL_TUTOR_MODELS[0].id
export type LocalTutorPhase = 'gpu-check' | 'worker' | 'runtime' | 'download' | 'cache-upload' | 'shaders' | 'ready'
export const LOCAL_TUTOR_PHASE_LABELS: Record<LocalTutorPhase, string> = {
  'gpu-check': '检测 WebGPU', worker: '加载 AI 引擎 JavaScript', runtime: '配置 / 运行库 / WebGPU 初始化',
  download: '模型权重下载', 'cache-upload': '读取缓存并装入显存', shaders: '编译 GPU 着色器', ready: '模型就绪',
}
export interface LocalTutorProgress { phase: LocalTutorPhase; progress?: number; text: string; elapsedSeconds?: number }
export type LocalTutorWorkerRequest = { id: number } & (
  { kind: 'load' | 'cache' | 'sources'; modelId: string; source: LocalModelSource } |
  { kind: 'generate'; modelId: string; messages: TutorModelMessage[] }
)
export type LocalTutorWorkerResponse =
  { id: number; kind: 'progress'; report: LocalTutorProgress } |
  { id: number; kind: 'chunk'; text: string } |
  { id: number; kind: 'result'; value: unknown } |
  { id: number; kind: 'error'; error: { code: TutorErrorCode; message: string } }
export interface ModelSources { model: string; model_lib: string }
export function validateLocalModel(modelId: string, source: LocalModelSource): boolean {
  return LOCAL_TUTOR_MODELS.some(model => model.id === modelId) && (source === 'official' || source === 'mirror')
}
