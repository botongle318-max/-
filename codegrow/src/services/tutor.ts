import { validateTutorRequest } from './tutorPrompt'

export interface TutorTurn { role: 'user' | 'assistant'; content: string }
export interface TutorRequest {
  message: string
  code: string
  lessonTitle: string
  history?: TutorTurn[]
  lastError?: string
  output?: string
}
export interface TutorReply { content: string; source: 'local-model' | 'ai' }
export type TutorErrorCode = 'NOT_CONFIGURED' | 'INVALID_ENDPOINT' | 'INVALID_REQUEST' | 'UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'SERVER_ERROR' | 'GPU_UNSUPPORTED' | 'MODEL_NOT_LOADED' | 'BUSY' | 'MODEL_ERROR'
export class TutorError extends Error {
  readonly code: TutorErrorCode
  readonly status?: number
  readonly serverCode?: string
  constructor(code: TutorErrorCode, message: string, details: { status?: number; serverCode?: string } = {}) {
    super(message); this.name = 'TutorError'; this.code = code; this.status = details.status; this.serverCode = details.serverCode
  }
}

export function getTutorEndpoint(): string | null {
  let saved: string | null
  try { saved = localStorage.getItem('codegrow-ai-endpoint')?.trim() || null } catch { return null }
  if (!saved) return null
  try {
    const url = new URL(saved)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) throw new Error()
    const path = url.pathname.replace(/\/+$/, '')
    url.pathname = path.endsWith('/v1/tutor') ? path : `${path}/v1/tutor`
    return url.toString()
  } catch { throw new TutorError('INVALID_ENDPOINT', 'AI 服务地址无效。请使用 HTTPS 或本机 localhost HTTP 地址，不能包含账号、查询参数或片段。') }
}
export function hasTutorEndpoint(): boolean { try { return getTutorEndpoint() !== null } catch { return false } }
export function getTutorProvider(): 'local' | 'remote' {
  try { return localStorage.getItem('codegrow-ai-provider') === 'remote' ? 'remote' : 'local' } catch { return 'local' }
}

async function remoteError(response: Response): Promise<TutorError> {
  let serverCode: string | undefined
  let message: string | undefined
  try {
    const result = await response.json()
    if (typeof result?.error?.code === 'string') serverCode = result.error.code.slice(0, 100)
    if (typeof result?.error?.message === 'string' && result.error.message.trim()) message = result.error.message.slice(0, 500)
  } catch { /* Gateways can return non-JSON errors. */ }
  return new TutorError('SERVER_ERROR', message || `AI 导师服务暂不可用（HTTP ${response.status}），请检查服务配置后重试。`, { status: response.status, serverCode })
}

/** Returns only real model replies. No local scripted fallback is synthesized. */
export async function getTutorReply(request: TutorRequest, signal?: AbortSignal, onToken?: (text: string) => void): Promise<TutorReply> {
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
  const payload = validateTutorRequest(request)
  if (getTutorProvider() === 'local') {
    const { generateLocalTutor } = await import('./localTutor')
    return generateLocalTutor(payload, signal, onToken)
  }
  const endpoint = getTutorEndpoint()
  if (!endpoint) throw new TutorError('NOT_CONFIGURED', '云端 AI 导师尚未连接。请在设置中填写服务地址，并在服务端配置模型密钥。')
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 35_000)
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit', redirect: 'error' })
    if (!response.ok) throw await remoteError(response)
    let result: unknown
    try { result = await response.json() } catch { throw new TutorError('INVALID_RESPONSE', 'AI 服务返回了无法解析的回复，请重试或检查代理配置。') }
    if (!result || typeof result !== 'object' || !('content' in result) || typeof result.content !== 'string' || !result.content.trim() || result.content.length > 12000 || !('source' in result) || result.source !== 'ai') throw new TutorError('INVALID_RESPONSE', 'AI 服务没有返回有效的模型回复，请检查代理服务。')
    onToken?.(result.content)
    return { content: result.content, source: 'ai' }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    if (timedOut) throw new TutorError('TIMEOUT', 'AI 导师回复超时，请稍后重试。')
    if (error instanceof TutorError) throw error
    throw new TutorError('UNAVAILABLE', '无法连接 AI 导师服务，请检查服务、地址和网络后重试。')
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
}
