// Production-only cache checks. Run after npm run build:site and compiler-preparation UI integration.
// Every case owns a fresh, nonpersistent browser context: real user caches and databases are untouched.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import initSqlJs from 'sql.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, 'dist')
const assetNames = ['clang', 'lld', 'sysroot.tar']
const network = Object.fromEntries(assetNames.map(name => [name, 0]))
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' }
const hello = '#include <stdio.h>\nint main(void) {\n    printf("Hello, CodeGrow!\\n");\n    return 0;\n}\n'
const infinite = 'int main(void) { while (1) {} return 0; }\n'
const compilerPattern = /\/compiler\/(?:clang|lld|sysroot\.tar)(?:\?|$)/
const blockedModelPattern = /https:\/\/(?:[^/]*(?:huggingface\.co|hf\.co|hf-mirror\.com|mlc\.ai|mlc-ai\.github\.io)\/|raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/)/
const contexts = []
const browserErrors = []
let browser
let page
let SQL
let checks = 0
let base

const server = createServer((request, response) => {
  let pathname
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname) }
  catch { response.writeHead(400); response.end(); return }
  const relative = pathname.startsWith('/codegrow/') ? pathname.slice('/codegrow/'.length) : pathname.slice(1)
  const file = resolve(directory, relative || 'index.html')
  if (!file.startsWith(`${directory}/`) || !existsSync(file)) { response.writeHead(404); response.end(); return }
  const name = pathname.split('/').at(-1)
  if (compilerPattern.test(pathname)) network[name] += 1
  // An HTTP cache hit must not masquerade as the application's verified CacheStorage reuse.
  response.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    ...(compilerPattern.test(pathname) ? { 'Cache-Control': 'no-store' } : {}),
  })
  createReadStream(file).pipe(response)
})

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = (name, condition) => { assert.ok(condition, name); checks += 1; console.log(`PASS ${name}`) }
const counts = () => ({ ...network })
function checkDownloads(name, before, expected) {
  const actual = Object.fromEntries(assetNames.map(asset => [asset, network[asset] - before[asset]]))
  assert.deepEqual(actual, Object.fromEntries(assetNames.map(asset => [asset, expected[asset] ?? 0])), name)
  checks += 1
  console.log(`PASS ${name} ${JSON.stringify(actual)}`)
}

async function freshPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  contexts.push(context)
  // Match the Hello World fixture to its real lesson (the product default is for-loop).
  await context.addInitScript(() => {
    if (location.protocol === 'http:') localStorage.setItem('codegrow-current-lesson', 'hello-world')
  })
  // None of these compiler checks needs to download AI model weights.
  await context.route(blockedModelPattern, route => route.abort('blockedbyclient'))
  const current = await context.newPage()
  current.on('pageerror', error => { browserErrors.push(error.message); console.error('BROWSER ERROR', error.message) })
  page = current
  return { context, page: current }
}

async function boot(current, hash = '') {
  await current.goto(`${base}${hash}`)
  await current.getByText('已保存到本地 SQLite').waitFor()
}

async function openLab(current) {
  await current.getByRole('button', { name: '代码实验室', exact: true }).click()
  await current.locator('.monaco-editor .view-lines').waitFor({ timeout: 30_000 })
}

async function edit(current, source) {
  await current.locator('.monaco-editor .view-lines').click()
  await current.keyboard.press('ControlOrMeta+A')
  await current.keyboard.insertText(source)
  // Cross the app's 350 ms save debounce before testing persistence or navigating away.
  await delay(450)
  await current.getByText('已保存到本地 SQLite').waitFor()
}

async function editorSource(current) {
  await current.locator('.monaco-editor .view-lines').click()
  await current.keyboard.press('ControlOrMeta+A')
  await current.keyboard.press('ControlOrMeta+C')
  const source = await current.evaluate(() => navigator.clipboard.readText())
  await current.keyboard.press('ArrowLeft')
  return source
}

async function run(current, shortcut = false) {
  const started = Date.now()
  if (shortcut) {
    await current.locator('.monaco-editor .view-lines').click()
    await current.keyboard.press('ControlOrMeta+Enter')
  } else await current.getByRole('button', { name: /^运行/ }).click()
  await current.getByRole('button', { name: '停止', exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
  await current.getByRole('button', { name: '停止', exact: true }).waitFor({ state: 'hidden', timeout: 130_000 })
  return Date.now() - started
}

async function checkHello(current, name) {
  await current.getByRole('tab', { name: '输出', exact: true }).click()
  check(name, (await current.locator('.console-output pre').textContent()).trim() === 'Hello, CodeGrow!' &&
    (await current.locator('.run-state').textContent()).includes('运行完成'))
}

async function snapshot(current) {
  await current.getByText('已保存到本地 SQLite').waitFor()
  await current.getByRole('button', { name: '偏好设置', exact: true }).click()
  const event = current.waitForEvent('download')
  await current.getByRole('button', { name: '导出 .sqlite' }).click()
  const bytes = await readFile(await (await event).path())
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0')
  const database = new SQL.Database(bytes)
  try { return JSON.parse(database.exec('SELECT payload FROM learning_snapshot WHERE id = 1')[0].values[0][0]) }
  finally { database.close() }
}

async function waitPrepared(current) {
  await current.getByRole('button', { name: '取消准备', exact: true }).waitFor({ state: 'hidden', timeout: 130_000 })
  await current.getByRole('button', { name: '提前准备编译环境', exact: true }).waitFor()
  await current.locator('.lab-notice').filter({ hasText: /准备完成|已准备|已就绪/ }).waitFor()
}

try {
  for (const asset of assetNames) {
    if (!existsSync(resolve(directory, 'compiler', asset))) throw new Error('Run npm run build:site before compiler cache browser checks.')
  }
  const editorBundles = new Set(readdirSync(resolve(directory, 'assets')).filter(name => /^(?:Editor-|editor\.worker-).*\.js$/i.test(name)))
  assert.ok(editorBundles.size >= 2, 'production output must contain separate Monaco editor and editor Worker bundles')
  SQL = await initSqlJs({ locateFile: file => resolve(root, 'node_modules/sql.js/dist', file) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/codegrow/`
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CODEGROW_CHROMIUM_PATH ? { executablePath: process.env.CODEGROW_CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
  })
  await mkdir(resolve(root, 'test-results'), { recursive: true })

  const main = await freshPage()
  const editorRequests = []
  main.context.on('request', request => {
    if (editorBundles.has(new URL(request.url()).pathname.split('/').at(-1))) editorRequests.push(request.url())
  })
  const cold = counts()
  await boot(main.page)
  await main.page.getByRole('heading', { name: /你好，未来的开发者/ }).waitFor()
  await delay(250)
  check('Dashboard does not request Monaco or its editor Worker before opening the lab', editorRequests.length === 0)
  checkDownloads('Dashboard does not download the compiler automatically', cold, {})
  await openLab(main.page)
  check('opening the lab lazily loads the separate Monaco bundle', editorRequests.some(url => /\/Editor-[^/]*\.js$/i.test(url)))
  await main.page.locator('.monaco-editor .view-lines').click()
  await main.page.keyboard.press('ControlOrMeta+A')
  await main.page.keyboard.type('int main(void) {', { delay: 30 })
  await main.page.keyboard.press('Enter')
  await main.page.keyboard.type('return 0;', { delay: 30 })
  const indented = await editorSource(main.page)
  assert.match(indented, /\n[\t ]+return 0;/, 'C editor auto-indents a new line inside a function')
  check('C editor auto-indents a new line inside a function', true)
  await edit(main.page, hello)
  const savedHello = await editorSource(main.page)
  await main.page.keyboard.press('ControlOrMeta+f')
  await main.page.locator('.monaco-editor .find-widget.visible').waitFor()
  check('Ctrl+F opens Monaco’s own search widget', await main.page.locator('.monaco-editor .find-widget.visible').isVisible())
  await main.page.keyboard.press('Escape')
  await main.page.locator('.monaco-editor .find-widget.visible').waitFor({ state: 'hidden' })
  await main.page.locator('.monaco-editor .view-lines').click()
  await main.page.keyboard.press('ControlOrMeta+Home')
  await main.page.keyboard.press('ControlOrMeta+/')
  const commented = await editorSource(main.page)
  check('Ctrl+/ comments the active C source line', /^\/\/\s*#include/.test(commented))
  await main.page.keyboard.press('ControlOrMeta+z')
  check('undo restores the exact student document before compiling', await editorSource(main.page) === savedHello)
  await main.page.getByText('已保存到本地 SQLite').waitFor()
  const coldMs = await run(main.page, true)
  await checkHello(main.page, 'Ctrl+Enter compiles real C with a cold compiler cache')
  checkDownloads('cold cache fetches each of the three verified assets once', cold, { clang: 1, lld: 1, 'sysroot.tar': 1 })
  const cachedAssets = await main.page.evaluate(async () => (await (await caches.open('codegrow-compiler-v1')).keys()).map(request => new URL(request.url).pathname.split('/').at(-1)).sort())
  check('all three compiler assets are retained in CacheStorage', JSON.stringify(cachedAssets) === JSON.stringify([...assetNames].sort()))

  const repeated = counts()
  const repeatedMs = await run(main.page, true)
  await checkHello(main.page, 'same-Worker repeat still executes the real C program')
  checkDownloads('same-Worker repeat performs no additional compiler downloads', repeated, {})
  const firstEvidence = await snapshot(main.page)
  assert.equal(firstEvidence.attempts.length, 1, 'repeated runs remain deduplicated')
  assert.equal(firstEvidence.drafts['hello-world'], savedHello, 'persisted draft matches the actual student document')
  check('repeated execution preserves one learning attempt and its saved draft', true)
  await openLab(main.page)
  await main.page.getByText('已保存到本地 SQLite').waitFor()
  await main.page.reload()
  await main.page.locator('.monaco-editor .view-lines').waitFor()
  check('SQLite draft remains intact after a full reload', await editorSource(main.page) === savedHello)
  const warm = counts()
  const warmMs = await run(main.page, true)
  await checkHello(main.page, 'reloaded Worker executes C using verified browser cache assets')
  checkDownloads('full reload reuses CacheStorage without fetching compiler assets', warm, {})
  console.log(`TIMING ${JSON.stringify({ coldMs, repeatedMs, warmMs })}`)

  const corrupted = await main.page.evaluate(async () => {
    const cache = await caches.open('codegrow-compiler-v1')
    const key = (await cache.keys()).find(request => new URL(request.url).pathname.endsWith('/clang'))
    if (!key) return false
    await cache.put(key, new Response('Deliberately corrupted test-only compiler bytes', { status: 200 }))
    return true
  })
  check('test corrupts only the isolated context’s cached clang response', corrupted)
  await main.page.reload()
  await main.page.locator('.monaco-editor .view-lines').waitFor()
  const repair = counts()
  await run(main.page, true)
  await checkHello(main.page, 'SHA-256 mismatch is repaired before executing the C program')
  checkDownloads('repair downloads only the corrupted clang asset', repair, { clang: 1 })

  const beforeCancel = (await snapshot(main.page)).attempts.length
  await openLab(main.page)
  await edit(main.page, infinite)
  const cancelled = counts()
  await main.page.locator('.monaco-editor .view-lines').click()
  await main.page.keyboard.press('ControlOrMeta+Enter')
  await main.page.locator('.console-output').getByText(/正在运行程序/).waitFor({ timeout: 130_000 })
  await main.page.getByRole('button', { name: '停止', exact: true }).click()
  await main.page.getByRole('button', { name: '停止', exact: true }).waitFor({ state: 'hidden' })
  check('an explicit stop terminates an infinite program', (await main.page.locator('.run-state').textContent()).includes('已停止'))
  checkDownloads('infinite-loop cancellation does not redownload cached toolchain assets', cancelled, {})
  const afterCancel = await snapshot(main.page)
  check('cancelled execution is not counted as a student failure', afterCancel.attempts.length === beforeCancel)
  await openLab(main.page)
  await edit(main.page, hello)
  await main.page.reload()
  await main.page.locator('.monaco-editor .view-lines').waitFor()
  const restart = counts()
  await run(main.page, true)
  await checkHello(main.page, 'a reload after Worker cancellation still runs the persisted draft')
  checkDownloads('Worker cancellation leaves verified CacheStorage reusable on reload', restart, {})
  await main.context.close()

  const prepared = await freshPage()
  await boot(prepared.page, '#lab')
  await prepared.page.locator('.monaco-editor .view-lines').waitFor()
  const preparing = counts()
  await prepared.page.getByRole('button', { name: '提前准备编译环境', exact: true }).click()
  await prepared.page.getByRole('button', { name: '取消准备', exact: true }).waitFor({ timeout: 5_000 })
  await waitPrepared(prepared.page)
  checkDownloads('explicit preparation fetches three compiler assets without executing student code', preparing, { clang: 1, lld: 1, 'sysroot.tar': 1 })
  const preparationEvidence = await snapshot(prepared.page)
  check('preparing the compiler does not create a learning attempt', preparationEvidence.attempts.length === 0 && preparationEvidence.completedIds.length === 0)
  await openLab(prepared.page)
  await edit(prepared.page, hello)
  const firstPreparedRun = counts()
  await run(prepared.page, true)
  await checkHello(prepared.page, 'first run after explicit preparation executes the real C program')
  checkDownloads('first prepared run performs no compiler downloads', firstPreparedRun, {})
  await prepared.context.close()

  const failed = await freshPage()
  await failed.context.route(compilerPattern, route => route.fulfill({ status: 503, body: 'Isolated compiler outage' }))
  await boot(failed.page, '#lab')
  await failed.page.locator('.monaco-editor .view-lines').waitFor()
  await edit(failed.page, hello)
  await run(failed.page)
  check('cold HTTP 503 gives an explicit compiler environment error', (await failed.page.locator('.lab-notice').textContent()).includes('不会计入学习评估') && (await failed.page.locator('.error-output').textContent()).includes('503'))
  const outageEvidence = await snapshot(failed.page)
  check('cold compiler outage creates neither student attempts nor course completion', outageEvidence.attempts.length === 0 && outageEvidence.completedIds.length === 0)
  await failed.context.close()

  const slow = await freshPage()
  const held = []
  await slow.context.route(compilerPattern, route => new Promise(resolve => { held.push({ route, resolve }) }))
  try {
    await boot(slow.page, '#lab')
    await slow.page.locator('.monaco-editor .view-lines').waitFor()
    const downloading = slow.context.waitForEvent('request', { predicate: request => compilerPattern.test(request.url()) })
    await slow.page.getByRole('button', { name: '提前准备编译环境', exact: true }).click()
    await downloading
    await slow.page.getByRole('button', { name: '取消准备', exact: true }).click()
    await slow.page.getByRole('button', { name: '提前准备编译环境', exact: true }).waitFor()
    check('explicit cancellation exits slow compiler preparation', await slow.page.getByRole('button', { name: '取消准备', exact: true }).count() === 0)
    await slow.page.getByRole('button', { name: '课程中心', exact: true }).click()
    check('courses remain usable after cancelling a slow preparation', await slow.page.getByRole('heading', { name: '你好，CodeGrow！', exact: true }).isVisible())
    await openLab(slow.page)
    const secondDownload = slow.context.waitForEvent('request', { predicate: request => compilerPattern.test(request.url()) })
    await slow.page.getByRole('button', { name: '提前准备编译环境', exact: true }).click()
    await secondDownload
    await slow.page.getByRole('button', { name: '课程中心', exact: true }).click()
    await slow.page.getByRole('heading', { name: '你好，CodeGrow！', exact: true }).waitFor()
    check('navigation during a slow compiler download leaves course content responsive', await slow.page.getByRole('button', { name: '开始练习', exact: true }).isEnabled())
    const navigationEvidence = await snapshot(slow.page)
    check('cancelled or navigated preparation never creates student attempts', navigationEvidence.attempts.length === 0)
  } finally {
    for (const pending of held) { await pending.route.abort().catch(() => {}); pending.resolve() }
    await slow.context.close()
  }
  check('compiler cache flows have no browser runtime exceptions', browserErrors.length === 0)
  console.log(`Completed ${checks} production compiler cache browser checks.`)
} catch (error) {
  let diagnostic = error instanceof Error ? (error.stack || error.message) : String(error)
  if (page && !page.isClosed()) {
    try {
      const state = await page.locator('.run-state, .lab-notice, .console-output').allTextContents()
      diagnostic += `\nLast compiler state: ${JSON.stringify(state.map(value => value.slice(0, 2000)))}`
      await page.screenshot({ path: resolve(root, 'test-results/compiler-cache-last-state.png'), fullPage: true }).catch(() => {})
    } catch { /* Diagnostics must not replace the original failure. */ }
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = diagnostic.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    console.error(`::error title=CodeGrow production compiler cache checks::${escaped}`)
  }
  throw error
} finally {
  for (const context of contexts) await context.close().catch(() => {})
  await browser?.close()
  server.closeAllConnections()
  if (server.listening) await new Promise(resolve => server.close(resolve))
}
