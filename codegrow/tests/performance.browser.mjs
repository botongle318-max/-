// Reproducible local-production measurement, NOT a mainland-network/GPU benchmark.
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

const directory = resolve(process.env.PERF_DIST || 'dist')
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' }
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/codegrow\//, '')
  const file = resolve(directory, path || 'index.html')
  if (!file.startsWith(`${directory}/`) || !existsSync(file)) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(response)
})
let browser
try {
  const assets = await Promise.all((await readdir(resolve(directory, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(async name => {
    const bytes = await readFile(resolve(directory, 'assets', name))
    return { name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
  }))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  browser = await chromium.launch({ headless: true, ...(process.env.CODEGROW_CHROMIUM_PATH ? { executablePath: process.env.CODEGROW_CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const compilerRequests = []
  const modelRequests = []
  page.on('request', request => {
    if (/\/compiler\/(clang|lld|sysroot.tar)$/.test(request.url())) compilerRequests.push(request.url())
    if (/huggingface|hf-mirror|raw\.githubusercontent/.test(request.url())) modelRequests.push(request.url())
  })
  const client = await context.newCDPSession(page)
  await client.send('Performance.enable')
  const networkProfile = process.env.PERF_THROTTLE === '1' ? { latency: 100, downloadThroughput: 1024 * 1024, uploadThroughput: 1024 * 1024 } : null
  if (networkProfile) {
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', { offline: false, ...networkProfile })
  }
  const editorOnly = process.env.PERF_EDITOR_ONLY === '1'
  const origin = `http://127.0.0.1:${server.address().port}/codegrow/`
  const measure = async action => { const start = performance.now(); await action(); return Math.round(performance.now() - start) }
  const homeMs = await measure(async () => { await page.goto(origin); await page.getByRole('heading', { name: /你好，未来的开发者/ }).waitFor(); await page.getByText('已保存到本地 SQLite').waitFor() })
  const homeResources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name.split('/').pop(), durationMs: entry.duration >= 0 ? Math.round(entry.duration) : null, transferBytes: entry.transferSize })))
  const editorMs = await measure(async () => { await page.getByRole('button', { name: '代码实验室', exact: true }).click(); await page.locator('.monaco-editor .view-lines').waitFor() })
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('#include <stdio.h>\nint main(void) { puts("Hello, CodeGrow!"); return 0; }')
  const run = async () => measure(async () => { await page.getByRole('button', { name: /^运行/ }).click(); await page.getByRole('button', { name: /^停止$/ }).waitFor({ state: 'hidden', timeout: 130000 }); if (!(await page.locator('.console-output pre').textContent()).includes('Hello, CodeGrow!')) throw new Error('Real compiler output missing') })
  const diagnostics = async () => page.locator('.compiler-diagnostics').count().then(count => count ? page.locator('.compiler-diagnostics').textContent() : null)
  const coldRunMs = editorOnly ? null : await run()
  const coldDiagnostics = await diagnostics()
  const warmRunMs = editorOnly ? [] : [await run(), await run(), await run()]
  const warmDiagnostics = await diagnostics()
  const requestsBeforeReload = compilerRequests.length
  const reloadEditorMs = await measure(async () => { await page.reload(); await page.locator('.monaco-editor .view-lines').waitFor() })
  const cachedRunMs = editorOnly ? null : await run()
  const cachedDiagnostics = await diagnostics()
  const metrics = Object.fromEntries((await client.send('Performance.getMetrics')).metrics.filter(item => ['ScriptDuration', 'TaskDuration', 'JSHeapUsedSize'].includes(item.name)).map(item => [item.name, item.value]))
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name.split('/').pop(), durationMs: entry.duration >= 0 ? Math.round(entry.duration) : null, transferBytes: entry.transferSize })))
  const report = { measuredAt: new Date().toISOString(), browser: await browser.version(), environment: 'Linux headless Chromium; uncompressed loopback HTTP; isolated empty browser context; no WebGPU/model inference measured; CDP ScriptDuration covers main thread only; invalid negative resource timings are null', networkProfile, editorOnly, homeMs, editorMs, coldRunMs, warmRunMs, reloadEditorMs, cachedRunMs, compilerRequestsCold: requestsBeforeReload, compilerRequestsAfterReload: compilerRequests.length - requestsBeforeReload, modelRequests: modelRequests.length, metrics, homeResources, resources, coldDiagnostics, warmDiagnostics, cachedDiagnostics, assets }
  await mkdir('test-results', { recursive: true })
  await writeFile(`test-results/performance-${process.env.PERF_LABEL || 'current'}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser?.close(); await new Promise(done => server.close(done)) }
