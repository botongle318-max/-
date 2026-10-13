// Production Worker integration: real WebLLM JavaScript, but NO actual model weights or GPU inference.
// The main-thread adapter and tiny cache manifest are explicit fixtures; never run against a real profile.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const directory = fileURLToPath(new URL('../dist/', import.meta.url))
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf' }
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/codegrow\//, '')
  const file = resolve(directory, pathname || 'index.html')
  if (!file.startsWith(directory) || !existsSync(file)) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(response)
})
const delay = ms => new Promise(done => setTimeout(done, ms))
const check = (name, condition) => { assert.ok(condition, name); console.log(`PASS ${name}`); checks += 1 }
let browser, context, releaseHeldRequest, checks = 0
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  browser = await chromium.launch({ headless: true, ...(process.env.CODEGROW_CHROMIUM_PATH ? { executablePath: process.env.CODEGROW_CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}) })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.addInitScript(() => {
    // This fixture only allows the UI lifecycle to start. The real worker waits on blocked configuration,
    // so no native GPU request or actual model inference is asserted by this integration test.
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) } })
  })
  const errors = [], requests = []
  let mode = 'hold'
  const held = new Promise(done => { releaseHeldRequest = done })
  await context.route(/https:\/\/(?:huggingface\.co|hf-mirror\.com|raw\.githubusercontent\.com)\//, async route => {
    requests.push({ url: route.request().url(), method: route.request().method() })
    if (mode === 'hold') { await held; await route.abort('blockedbyclient').catch(() => {}); return }
    if (mode === 'fail') { await route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'explicit integration fixture: configuration unavailable' }); return }
    await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const base = `http://127.0.0.1:${server.address().port}/codegrow/`
  await page.goto(base); await page.getByText('已保存到本地 SQLite').waitFor()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click(); await page.locator('.monaco-editor .view-lines').waitFor()
  const launcher = page.locator('.tutor-panel .model-launcher')
  await launcher.getByText('WebGPU 可用，支持 FP16 模型。', { exact: true }).waitFor()
  const model = launcher.getByLabel('本地 AI 模型')
  check('new users default to 1.5B without any model requests', (await model.inputValue()).includes('1.5B') && requests.length === 0)
  await launcher.getByLabel('模型下载来源').selectOption('mirror'); await launcher.getByLabel('模型下载来源').selectOption('official')
  check('source selection alone does not download configuration, runtime or weights', requests.length === 0)
  const draft = '// local AI cancellation keeps my draft\nint main(void) { return 0; }\n'
  await page.locator('.monaco-editor .view-lines').click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText(draft)
  await delay(450); await page.getByText('已保存到本地 SQLite').waitFor()
  await launcher.getByRole('button', { name: /下载并启动本地\s*AI/ }).click()
  await launcher.locator('.model-progress strong').filter({ hasText: '配置 / 运行库 / WebGPU 初始化' }).waitFor({ timeout: 30000 })
  check('real production worker reports the pre-weight runtime phase, not a fabricated total percentage', await launcher.locator('.model-progress').textContent().then(text => text.includes('阶段百分比不是总进度')))
  check('held configuration prevents all actual weight and model-runtime downloads', requests.length === 1 && requests[0].url.endsWith('mlc-chat-config.json'))
  await launcher.getByRole('button', { name: '取消模型加载' }).click()
  await launcher.locator('.model-progress').waitFor({ state: 'hidden' }); await launcher.getByRole('button', { name: /下载并启动本地\s*AI/ }).waitFor()
  releaseHeldRequest(); await delay(100)
  check('cancelling real worker loading restores idle without an error or late completion', await launcher.getByRole('alert').count() === 0 && await page.getByText('本地模型未启动', { exact: true }).isVisible())
  mode = 'fail'; await launcher.getByRole('button', { name: /下载并启动本地\s*AI/ }).click()
  await launcher.getByRole('alert').waitFor({ timeout: 30000 })
  const failure = await launcher.getByRole('alert').textContent()
  check('a source failure retains the exact phase and recovery guidance', failure.includes('配置 / 运行库 / WebGPU 初始化') && failure.includes('诊断两个下载来源'))
  check('failed official loading never automatically switches to a mirror', requests.every(request => !request.url.includes('hf-mirror.com')))
  await page.reload(); await page.locator('.monaco-editor .view-lines').waitFor()
  await page.locator('.monaco-editor .view-lines').click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('ControlOrMeta+C')
  check('learning draft survives AI cancellation, failure and page refresh', await page.evaluate(() => navigator.clipboard.readText()) === draft)
  const selected = await launcher.getByLabel('本地 AI 模型').inputValue()
  await page.evaluate(async modelId => {
    const cache = await caches.open('webllm/model')
    const base = `https://huggingface.co/mlc-ai/${modelId}/resolve/main/`
    // Deliberately not real model bytes: prove read-only key detection, not integrity or offline readiness.
    await cache.put(`${base}tensor-cache.json`, new Response(JSON.stringify({ records: [{ dataPath: 'explicit-fixture.weights.bin' }] })))
    await cache.put(`${base}explicit-fixture.weights.bin`, new Response('not real model weights'))
  }, selected)
  const beforeCache = requests.length
  await launcher.locator('summary').click(); await launcher.getByRole('button', { name: '检查所选模型缓存' }).click()
  await launcher.getByText('所选来源的权重索引与全部分片已缓存。', { exact: false }).waitFor({ timeout: 30000 })
  check('real WebLLM cache probe reuses cached keys without a weight request', requests.length === beforeCache)
  check('cache presence is explicitly distinguished from integrity and offline readiness', await launcher.getByText('本检查不校验完整性或证明可以离线启动。', { exact: false }).isVisible())
  await launcher.getByLabel('模型下载来源').selectOption('mirror'); await launcher.getByRole('button', { name: '检查所选模型缓存' }).click()
  await launcher.getByText('所选来源的权重未完整缓存', { exact: false }).waitFor({ timeout: 30000 })
  check('mirror cache probe does not mistake the official URL cache for a hit', requests.length === beforeCache)
  mode = 'diagnose'; await launcher.getByRole('button', { name: '诊断两个下载来源' }).click()
  await launcher.getByText('官方模型运行库（raw GitHub）', { exact: false }).waitFor({ timeout: 30000 })
  const diagnostic = requests.slice(beforeCache)
  check('explicit network diagnosis probes mirror configuration and official runtime separately', diagnostic.length === 2 && diagnostic.some(request => request.method === 'GET' && request.url.startsWith('https://hf-mirror.com/')) && diagnostic.some(request => request.method === 'HEAD' && request.url.startsWith('https://raw.githubusercontent.com/')))
  check('all external requests were configuration or runtime HEAD, never model weights', requests.every(request => request.url.endsWith('mlc-chat-config.json') || request.method === 'HEAD'))
  check('production AI lifecycle generated no browser errors', errors.length === 0)
  console.log(`${checks} production local-AI lifecycle checks passed; NO actual GPU inference or mainland network speed measured.`)
} finally {
  releaseHeldRequest?.(); await context?.close(); await browser?.close(); await new Promise(done => server.close(done))
}
