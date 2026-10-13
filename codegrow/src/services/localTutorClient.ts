import { TutorError } from './tutorError'
import type { LocalTutorProgress, LocalTutorWorkerRequest, LocalTutorWorkerResponse } from './localTutorProtocol'

type Request = LocalTutorWorkerRequest extends infer Item ? Item extends { id: number } ? Omit<Item, 'id'> : never : never
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; progress?: (report: LocalTutorProgress) => void; token?: (text: string) => void }

/** The main thread contains only this small RPC client; the 6 MB WebLLM engine lives solely in its worker. */
export class LocalTutorWorkerClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextId = 0
  private closed = false
  constructor(onFailure?: (error: Error) => void) {
    this.worker = new Worker(new URL('./tutor.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', event => this.receive(event as MessageEvent<LocalTutorWorkerResponse>))
    const failed = () => {
      const error = new TutorError('MODEL_ERROR', '模型工作线程或 GPU 运行失败。请检查浏览器硬件加速与显存；可重新加载较小的 1.5B 模型。')
      if (this.closed) return
      this.dispose(error); onFailure?.(error)
    }
    this.worker.addEventListener('error', failed); this.worker.addEventListener('messageerror', failed)
  }
  request<T>(request: Request, callbacks: { progress?: Pending['progress']; token?: Pending['token'] } = {}): Promise<T> {
    if (this.closed) return Promise.reject(new DOMException('模型工作线程已停止', 'AbortError'))
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject, ...callbacks })
      try { this.worker.postMessage({ ...request, id }) } catch (error) { this.pending.delete(id); reject(error instanceof Error ? error : new Error('无法发送模型请求')) }
    })
  }
  private receive(event: MessageEvent<LocalTutorWorkerResponse>): void {
    if (this.closed) return
    const message = event.data
    const request = message && this.pending.get(message.id)
    if (!request) return
    if (message.kind === 'progress' || message.kind === 'chunk') {
      try {
        if (message.kind === 'progress') request.progress?.(message.report)
        else request.token?.(message.text)
      } catch (error) { this.pending.delete(message.id); request.reject(error instanceof Error ? error : new Error('模型回调处理失败')) }
      return
    }
    this.pending.delete(message.id)
    if (message.kind === 'error') request.reject(new TutorError(message.error.code, message.error.message))
    else if (message.kind === 'result') request.resolve(message.value)
  }
  dispose(error: Error = new DOMException('请求已取消', 'AbortError')): void {
    if (this.closed) return
    this.closed = true
    this.worker.terminate()
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }
}
