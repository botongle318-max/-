import test from 'node:test'
import assert from 'node:assert/strict'
import { createTutorServer, validatePayload } from './index.mjs'

const payload = {
  message: '循环为什么没有结束？',
  code: 'int main(void) { return 0; }',
  lessonTitle: '循环',
  hintLevel: 2,
  mode: 'debug',
}

async function withServer(options, callback) {
  const server = createTutorServer(options)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = `http://127.0.0.1:${server.address().port}`
  try {
    await callback(address)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

function post(address, body = payload, origin = 'http://localhost:5173') {
  return fetch(`${address}/v1/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}

test('L4 requires an explicit reference request or permitted repeated-failure escalation', () => {
  assert.equal(validatePayload({ ...payload, hintLevel: 4 }).hintLevel, 3)
  assert.equal(validatePayload({ ...payload, hintLevel: 4, message: '我想看参考代码' }).hintLevel, 4)
  assert.equal(validatePayload({ ...payload, hintLevel: 4, permitReference: true }).hintLevel, 4)
  assert.equal(validatePayload({ ...payload, hintLevel: 4, message: '不要给答案' }).hintLevel, 3)
  assert.equal(validatePayload({ ...payload, hintLevel: 4, message: "don't give sample code" }).hintLevel, 3)
})

test('rejects malformed payloads, oversized code, and client-specified proxy URLs', () => {
  for (const invalid of [null, [], { ...payload, mode: 'administrator' }, { ...payload, hintLevel: 0 }, { ...payload, code: 'a'.repeat(20001) }, { ...payload, url: 'https://evil.example' }, { ...payload, hints: ['a', 42] }]) {
    assert.throws(() => validatePayload(invalid), { status: 400 })
  }
})

test('rejects unsafe provider configuration and wildcard CORS', () => {
  assert.throws(() => createTutorServer({ env: { AI_BASE_URL: 'http://example.com/v1' } }), /HTTPS/)
  assert.throws(() => createTutorServer({ env: { AI_BASE_URL: 'https://user:password@example.com/v1' } }), /credentials/)
  assert.throws(() => createTutorServer({ env: { CODEGROW_ALLOWED_ORIGINS: '*' } }))
})

test('health endpoint is available without an AI key; chat clearly reports missing configuration', async () => {
  await withServer({ env: {} }, async (address) => {
    const health = await fetch(`${address}/health`)
    assert.deepEqual(await health.json(), { status: 'ok', aiConfigured: false })
    const response = await post(address)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'AI_NOT_CONFIGURED')
  })
})

test('enforces exact CORS allowlist and supports preflight', async () => {
  await withServer({ env: {} }, async (address) => {
    const denied = await post(address, payload, 'https://attacker.example')
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
    const allowed = await fetch(`${address}/v1/tutor`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5174' } })
    assert.equal(allowed.status, 204)
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5174')
  })
})

test('keeps provider credentials on the server, uses fixed upstream URL, and quotes student code', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer test-server-key')
    assert.equal(options.redirect, 'error')
    const sent = JSON.parse(options.body)
    assert.equal(sent.model, 'test-model')
    assert.equal(JSON.parse(sent.messages[1].content).studentCode, payload.code)
    assert.match(sent.messages[0].content, /L2/)
    return new Response(JSON.stringify({ choices: [{ message: { content: '请检查每次迭代之后，循环变量是否发生变化。' } }] }), { status: 200 })
  }
  await withServer({ env: { AI_API_KEY: 'test-server-key', AI_MODEL: 'test-model' }, fetchImpl }, async (address) => {
    const response = await post(address)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { content: '请检查每次迭代之后，循环变量是否发生变化。', source: 'ai' })
  })
})

test('rejects complete code below L4, but permits references after an explicit request', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: '```c\nint main(void) { return 0; }\n```' } }] }), { status: 200 })
  await withServer({ env: { AI_API_KEY: 'test-server-key' }, fetchImpl }, async (address) => {
    const denied = await post(address)
    assert.equal(denied.status, 502)
    assert.equal((await denied.json()).error.code, 'TEACHING_POLICY')
    const allowed = await post(address, { ...payload, hintLevel: 4, message: '我想看参考代码' })
    assert.equal(allowed.status, 200)
    assert.equal((await allowed.json()).source, 'ai')
  })
})

test('maps upstream authentication errors without leaking provider response contents', async () => {
  const fetchImpl = async () => new Response('upstream secret diagnostic', { status: 401 })
  await withServer({ env: { AI_API_KEY: 'test-server-key' }, fetchImpl }, async (address) => {
    const response = await post(address)
    assert.equal(response.status, 502)
    const result = await response.json()
    assert.equal(result.error.code, 'AI_AUTH_FAILED')
    assert.doesNotMatch(JSON.stringify(result), /secret|test-server-key/)
  })
})

test('rejects non-JSON requests and unknown routes', async () => {
  await withServer({ env: {} }, async (address) => {
    const bad = await fetch(`${address}/v1/tutor`, { method: 'POST', body: 'not json' })
    assert.equal(bad.status, 415)
    assert.equal((await fetch(`${address}/missing`)).status, 404)
  })
})

test('limits repeated requests to 30 per address per minute', async () => {
  await withServer({ env: {} }, async (address) => {
    for (let index = 0; index < 30; index += 1) assert.equal((await post(address)).status, 503)
    const response = await post(address)
    assert.equal(response.status, 429)
    assert.equal((await response.json()).error.code, 'RATE_LIMITED')
  })
})
