import type { LocalTutorProgress } from './localTutorProtocol'

/** WebLLM percentages restart for download, cache upload and shaders; never treat them as an overall percent. */
export function modelProgress(report: { text: string; progress: number; timeElapsed?: number }): LocalTutorProgress {
  const text = report.text || '正在初始化本地模型…'
  const phase = /Loading model from cache/i.test(text) ? 'cache-upload' : /GPU shader/i.test(text) ? 'shaders' : /Finish loading/i.test(text) ? 'ready' : /Fetching param|Start to fetch params/i.test(text) ? 'download' : 'runtime'
  return { phase, text, ...(phase !== 'runtime' ? { progress: Number.isFinite(report.progress) ? Math.max(0, Math.min(1, report.progress)) : 0 } : {}), ...(Number.isFinite(report.timeElapsed) ? { elapsedSeconds: report.timeElapsed } : {}) }
}
