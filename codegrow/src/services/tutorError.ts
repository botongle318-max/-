export type TutorErrorCode = 'NOT_CONFIGURED' | 'INVALID_ENDPOINT' | 'INVALID_REQUEST' | 'UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'SERVER_ERROR' | 'GPU_UNSUPPORTED' | 'MODEL_NOT_LOADED' | 'BUSY' | 'MODEL_ERROR'
export class TutorError extends Error {
  readonly code: TutorErrorCode
  readonly status?: number
  readonly serverCode?: string
  constructor(code: TutorErrorCode, message: string, details: { status?: number; serverCode?: string } = {}) {
    super(message); this.name = 'TutorError'; this.code = code; this.status = details.status; this.serverCode = details.serverCode
  }
}
