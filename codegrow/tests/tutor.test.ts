import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTutorReply, wantsReference, type TutorRequest } from '../src/services/tutor'

const request: TutorRequest = {
  message: '什么是循环？', code: '', lessonTitle: 'for 循环', mode: 'guide', hintLevel: 1,
}

let stored: Map<string, string>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  stored = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('local tutor and reference consent', () => {
  it('identifies the default tutor as local and never sends code to a network service', async () => {
    const reply = await getTutorReply(request)
    expect(reply.source).toBe('local')
    expect(reply.content).toContain('本地练习导师')
    expect(reply.content).toContain('循环')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('provides progressive course hints without revealing the L4 reference', async () => {
    const hints = ['L1 思路', 'L2 范围', 'L3 原理', '完整参考实现']
    for (const level of [1, 2, 3]) {
      const reply = await getTutorReply({ ...request, hintLevel: level, hints })
      expect(reply.content).toContain(hints[level - 1])
      expect(reply.content).not.toContain(hints[3])
    }
  })

  it('keeps all four local teaching modes distinct even when course hints are supplied', async () => {
    const replies = await Promise.all((['guide', 'practice', 'challenge', 'debug'] as const).map((mode) => getTutorReply({ ...request, mode, hints: ['循环线索'] })))
    expect(new Set(replies.map((reply) => reply.content)).size).toBe(4)
    expect(replies[1].content).toContain('最小可验证步骤')
    expect(replies[2].content).toContain('三个测试')
    expect(replies[3].content).toContain('第一个错误')
  })

  it('downgrades L4 without an active request and explains the reference gate', async () => {
    const reply = await getTutorReply({ ...request, hintLevel: 4, hints: ['思路', '范围', '原理', '完整参考实现'] })
    expect(reply.content).toContain('L3')
    expect(reply.content).toContain('主动请求')
    expect(reply.content).not.toContain('完整参考实现')
    expect(reply.content).not.toContain('```')
  })

  it.each(['我想看参考代码', '给我示例代码', 'show reference code'])('recognizes an explicit reference request: %s', async (message) => {
    expect(wantsReference(message)).toBe(true)
    const reply = await getTutorReply({ ...request, message, hintLevel: 4 })
    expect(reply.content).toContain('L4')
    expect(reply.content).toContain('```c')
  })

  it.each(['不要给答案', '不要给我参考代码', '我不想看示例代码', "don't give sample code"])('does not treat declined reference code as consent: %s', async (message) => {
    expect(wantsReference(message)).toBe(false)
    const reply = await getTutorReply({ ...request, message, hintLevel: 4 })
    expect(reply.content).toContain('L3')
    expect(reply.content).not.toContain('```')
  })

  it('accepts caller-authorized escalation and asks for independent follow-up', async () => {
    const reply = await getTutorReply({ ...request, hintLevel: 4, permitReference: true, hints: ['', '', '', 'for (int i = 0; i < 3; i++) { /* 处理 */ }'] })
    expect(reply.content).toContain('L4')
    expect(reply.content).toContain('```c')
    expect(reply.content).toContain('预测结果并验证')
  })

  it('explains compiler error causes in debug mode rather than claiming it ran the code', async () => {
    const reply = await getTutorReply({ ...request, mode: 'debug', hintLevel: 3, lastError: "error: expected ';' after expression" })
    expect(reply.content).toContain('分号')
    expect(reply.content).toContain('上一行')
    expect(reply.content).toContain('补救练习')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('honors a request that was cancelled before it started', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(getTutorReply(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('optional AI proxy', () => {
  it.each(['http://remote.example', 'https://user:password@example.com', 'https://example.com?token=secret', 'https://example.com#fragment', 'not-a-url'])('rejects unsafe or ambiguous endpoints without sending code: %s', async (endpoint) => {
    stored.set('codegrow-ai-endpoint', endpoint)
    const reply = await getTutorReply(request)
    expect(reply.source).toBe('local')
    expect(reply.content).toContain('配置无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['http://localhost:8787', 'http://127.0.0.1:8787/', 'https://tutor.example.com/v1/tutor'])('uses the documented POST interface at %s', async (endpoint) => {
    stored.set('codegrow-ai-endpoint', endpoint)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: '先预测每轮变量的变化。', source: 'ai' }), { status: 200 }))
    const reply = await getTutorReply(request)
    expect(reply).toEqual({ content: '先预测每轮变量的变化。', source: 'ai' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/v1\/tutor$/)
    expect(url).not.toContain('/v1/tutor/v1/tutor')
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' })
    expect(JSON.parse(options.body)).toEqual(request)
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('also enforces the L4 gate before sending context to the proxy', async () => {
    stored.set('codegrow-ai-endpoint', 'http://localhost:8787')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: '先考虑边界。', source: 'ai' }), { status: 200 }))
    await getTutorReply({ ...request, hintLevel: 4 })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).hintLevel).toBe(3)
  })

  it.each([
    { content: '普通回复', source: 'local' },
    { content: '', source: 'ai' },
    { content: 'a'.repeat(12001), source: 'ai' },
    { source: 'ai' },
  ])('falls back transparently when the proxy returns an invalid response', async (result) => {
    stored.set('codegrow-ai-endpoint', 'http://localhost:8787')
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }))
    const reply = await getTutorReply(request)
    expect(reply.source).toBe('local')
    expect(reply.content).toContain('以下为本地引导')
  })

  it('labels a proxy failure as local instead of claiming a real model answered', async () => {
    stored.set('codegrow-ai-endpoint', 'http://localhost:8787')
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }))
    const reply = await getTutorReply(request)
    expect(reply.source).toBe('local')
    expect(reply.content).toContain('云端导师暂时无法连接')
  })

  it('honors cancellation during a pending proxy request', async () => {
    stored.set('codegrow-ai-endpoint', 'http://localhost:8787')
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const controller = new AbortController()
    const pending = getTutorReply(request, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('times out an unavailable proxy and continues with local teaching', async () => {
    vi.useFakeTimers()
    stored.set('codegrow-ai-endpoint', 'http://localhost:8787')
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const pending = getTutorReply(request)
    await vi.advanceTimersByTimeAsync(35_000)
    const reply = await pending
    expect(reply.source).toBe('local')
    expect(reply.content).toContain('以下为本地引导')
  })
})
