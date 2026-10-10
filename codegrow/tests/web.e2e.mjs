import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = resolve(root, 'dist')
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' }
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const relative = pathname.startsWith('/codegrow/') ? pathname.slice('/codegrow/'.length) : pathname.slice(1)
  const file = resolve(directory, relative || 'index.html')
  if (!file.startsWith(`${directory}/`) || !existsSync(file)) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(response)
})
let browser
let page
let checks = 0
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`) }
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function edit(page, source) {
  const editor = page.locator('.monaco-editor .view-lines')
  await editor.waitFor()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(source)
  await delay(450)
}
async function run(page) {
  await page.getByRole('button', { name: /^运行/ }).click()
  await page.getByRole('button', { name: /^停止$/ }).waitFor({ state: 'hidden', timeout: 130000 })
}

try {
  if (!existsSync(resolve(directory, 'compiler/clang'))) throw new Error('Run npm run build:site before browser tests.')
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = process.env.E2E_BASE_URL || `http://127.0.0.1:${server.address().port}/codegrow/`
  browser = await chromium.launch({ headless: true, ...(process.env.CODEGROW_CHROMIUM_PATH ? { executablePath: process.env.CODEGROW_CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => { errors.push(error.message); console.error('BROWSER ERROR', error.message) })
  page.on('console', (message) => { if (message.type() === 'error') console.error('BROWSER CONSOLE', message.text()) })
  await page.goto(base)
  await page.getByRole('heading', { name: /你好，未来的开发者/ }).waitFor()
  await page.getByText('已保存到本地 SQLite').waitFor()
  check('production site boots under /codegrow/ with real SQLite', await page.getByText('已保存到本地 SQLite').isVisible())
  check('no invented completed lessons for a new learner', (await page.locator('.dashboard-stats .stat-value').first().innerText()).replace(/\s/g, '') === '0节')
  await mkdir(resolve(root, 'test-results'), { recursive: true })
  await page.screenshot({ path: resolve(root, 'test-results/dashboard.png'), fullPage: true })

  await page.getByRole('button', { name: '课程中心', exact: true }).click()
  await page.getByRole('heading', { name: '你好，CodeGrow！', exact: true }).waitFor()
  check('course tree and micro-lesson are accessible', await page.getByRole('button', { name: '开始练习' }).isVisible())
  await page.getByRole('button', { name: '开始练习' }).click()
  await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 20000 })
  check('Monaco loads from bundled local assets', await page.locator('.monaco-editor').isVisible())

  await page.getByRole('button', { name: '给我下一级提示' }).click()
  await page.getByText('本地练习导师 · L1').waitFor()
  check('first hint stays L1 and does not reveal a reference answer', await page.locator('.hint-progress .active').count() === 1 && await page.locator('.chat-code').count() === 0)
  await page.getByLabel('向导师提问').fill('不要给我参考代码，请解释 printf 的作用。')
  await page.getByRole('button', { name: '发送消息' }).click()
  await page.locator('.chat-thinking').waitFor({ state: 'hidden' })
  check('negative reference request never escalates to L4', await page.locator('.hint-progress .active').count() === 1)

  const hello = '#include <stdio.h>\nint main(void) {\n    printf("Hello, CodeGrow!\\n");\n    return 0;\n}\n'
  await edit(page, hello)
  await run(page)
  check('real WASM C compile and run produces expected output', (await page.locator('.console-output pre').textContent()).trim() === 'Hello, CodeGrow!')
  await page.getByRole('tab', { name: '测试', exact: true }).click()
  check('sample output is tested', await page.getByText('样例测试通过 · 1/1').isVisible())
  await page.screenshot({ path: resolve(root, 'test-results/lab.png'), fullPage: true })
  await page.getByRole('button', { name: '学习档案', exact: true }).click()
  await page.getByRole('heading', { name: /每一次尝试，都在成长/ }).waitFor()
  check('learning records update from a real exercise', (await page.locator('.stat-card').nth(2).locator('strong').innerText()).replace(/\s/g, '') === '1节')

  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.locator('.monaco-editor .view-lines').waitFor()
  await run(page)
  await page.getByRole('button', { name: '学习档案', exact: true }).click()
  check('same source remains deduplicated across page navigation', await page.locator('.activity-row').count() === 1)
  await page.getByText('已保存到本地 SQLite').waitFor()
  await page.reload()
  await page.getByRole('heading', { name: /每一次尝试，都在成长/ }).waitFor()
  check('SQLite restores completion and attempts after a full reload', await page.locator('.activity-row').count() === 1 && (await page.locator('.stat-card').nth(2).locator('strong').innerText()).replace(/\s/g, '') === '1节')
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.locator('.monaco-editor .view-lines').waitFor()
  check('code draft survives reload', await page.locator('.monaco-editor').innerText().then((text) => text.replace(/\u00a0/g, ' ').includes('Hello, CodeGrow!')))

  await page.getByLabel('标准输入', { exact: true }).fill('custom')
  await run(page)
  await page.getByRole('tab', { name: '测试', exact: true }).click()
  check('custom input is explicitly ungraded', await page.getByText('自定义输入 · 未判定').isVisible())
  await page.getByLabel('标准输入', { exact: true }).fill('')
  check('changing stdin does not rewrite a previous test result', await page.getByText('自定义输入 · 未判定').isVisible())
  await page.getByRole('button', { name: '学习档案', exact: true }).click()
  check('custom input is not recorded as a student failure', await page.locator('.activity-row').count() === 1)

  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await edit(page, '#include <stdio.h>\nint main(void) { printf("broken") return 0; }')
  await run(page)
  check('compiler errors are genuine and readable', await page.locator('.error-output').innerText().then((text) => text.includes('error:') && text.includes('main.c')))
  await edit(page, 'int main(void) { while(1) {} return 0; }')
  await run(page)
  check('infinite loops are stopped within the runtime timeout', (await page.locator('.run-state').innerText()).includes('运行超时'))

  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 .sqlite' }).click()
  const download = await downloadEvent
  const bytes = await readFile(await download.path())
  check('exported file is an actual SQLite database', bytes.subarray(0, 16).toString() === 'SQLite format 3\0')
  await page.getByLabel('AI 代理服务地址').fill('https://example.com/v1/tutor')
  await page.getByRole('button', { name: '保存设置' }).click()
  check('AI proxy settings save without collecting API keys', await page.getByText('代理地址已保存，下一条导师消息将使用此配置。').isVisible())
  await page.getByLabel('AI 代理服务地址').fill('')
  await page.getByRole('button', { name: '保存设置' }).click()

  await page.setViewportSize({ width: 1024, height: 768 })
  for (const name of ['学习首页', '课程中心', '代码实验室', '学习档案', '偏好设置']) {
    await page.getByRole('button', { name, exact: true }).click()
    await delay(250)
    check(`${name} fits a 1024px desktop viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  await page.getByRole('button', { name: '学习首页', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('搜索课程').fill('循环')
  await page.locator('.search-results button').first().waitFor()
  check('course search returns usable lesson results', await page.locator('.search-results button').count() > 0)
  await page.locator('.search-results button').first().click()
  check('search opens the chosen lesson', await page.getByRole('heading', { name: /代码实验室/ }).isVisible())
  await page.locator('.monaco-editor .view-lines').waitFor()
  await page.getByRole('button', { name: '给我下一级提示' }).click()
  await page.locator('.hint-progress .active').first().waitFor()
  await page.getByRole('button', { name: '给我下一级提示' }).click()
  await delay(100)
  await page.getByRole('button', { name: '给我下一级提示' }).click()
  await page.getByRole('button', { name: '请求参考片段' }).waitFor()
  await page.getByRole('button', { name: '请求参考片段' }).click()
  check('L4 requires an explicit reference confirmation', await page.getByRole('dialog').isVisible())
  const codeBefore = await page.locator('.monaco-editor .view-lines').innerText()
  await page.getByRole('button', { name: '查看参考片段' }).click()
  await page.locator('.chat-code').waitFor()
  check('reference is shown without overwriting student code', await page.locator('.hint-progress .active').count() === 4 && await page.locator('.monaco-editor .view-lines').innerText() === codeBefore)

  const offlineContext = await browser.newContext()
  const offlinePage = await offlineContext.newPage()
  await offlinePage.route('**/compiler/**', (route) => route.fulfill({ status: 503, body: 'Compiler test outage' }))
  await offlinePage.goto(`${base}#lab`)
  await offlinePage.locator('.monaco-editor .view-lines').waitFor()
  await run(offlinePage)
  check('compiler asset failures are classified as environment failures', await offlinePage.getByText('编译工具暂不可用，请检查网络后重试。本次不会计入学习评估。').isVisible())
  await offlinePage.getByRole('button', { name: '学习档案', exact: true }).click()
  check('environment failures never count as student attempts', await offlinePage.locator('.activity-row').count() === 0)
  await offlineContext.close()
  check('no browser runtime exceptions', errors.length === 0)
  console.log(`Completed ${checks} production browser checks.`)
} catch (error) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    let diagnostic = error instanceof Error ? (error.stack || error.message) : String(error)
    if (page && !page.isClosed()) {
      try {
        const state = await page.locator('.run-state, .test-status, .lab-notice').allTextContents()
        const output = await page.locator('.console-output pre').allTextContents()
        diagnostic += `\nLast browser state: ${JSON.stringify({ state, output: output.map(value => value.slice(0, 2000)) })}`
      } catch { /* Preserve the original failure even if the page is unavailable. */ }
    }
    const escaped = diagnostic.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    console.error(`::error title=CodeGrow browser workflow::${escaped}`)
  }
  throw error
} finally {
  await page?.screenshot({ path: resolve(root, 'test-results/last-state.png'), fullPage: true }).catch(() => {})
  await browser?.close()
  await new Promise((done) => server.close(done))
}
