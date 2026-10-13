import { createLocalTutorWorkerHandler } from './localTutorWorker'
import type { LocalTutorWorkerRequest } from './localTutorProtocol'

const handle = createLocalTutorWorkerHandler(message => self.postMessage(message))
self.onmessage = (event: MessageEvent<LocalTutorWorkerRequest>) => { void handle(event.data) }
