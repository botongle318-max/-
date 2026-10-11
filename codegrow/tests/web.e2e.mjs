import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import initSqlJs from 'sql.js'

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
const firstQuestion = '什么是循环？'
const followupQuestion = '我还是不理解，换个例子'
// Explicit browser-test fixture. Production code never receives a fake local AI.
const firstReply = '循环会在条件成立时重复执行。例如依次输出 1、2、3，每轮更新计数器，超过 3 时停止。下一步：先预测下面程序会打印几行，再亲手运行。\n\n```c\nfor (int i = 1; i <= 3; i++) {\n    printf("%d\\n", i);\n}\n```'
const followupReply = '换成整理书架的例子：每次拿起一本书放好，直到所有书都整理完。“还有书没整理”是条件，“整理一本书”是重复动作。下一步：用一句话说明这次循环什么时候停止。'

async function exportSnapshot(page) {
  await page.getByText('已保存到本地 SQLite').waitFor()
  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 .sqlite' }).click()
  const bytes = await readFile(await (await event).path())
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0')
  const SQL = await initSqlJs({ locateFile: (file) => resolve(root, 'node_modules/sql.js/dist', file) })
  const database = new SQL.Database(bytes)
  try { return JSON.parse(database.exec('SELECT payload FROM learning_snapshot WHERE id = 1')[0].values[0][0]) }
  finally { database.close() }
}

async function edit(page, source) {
  const editor = page.locator('.monaco-editor .view-lines')
  await editor.waitFor()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(source)
  await delay(450)
}
async function readEditorSource(page) {
  // Monaco virtualizes visible lines; copy the entire document, not its viewport DOM.
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+C')
  const source = await page.evaluate(() => navigator.clipboard.readText())
  await page.keyboard.press('ArrowLeft')
  return source
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  const modelDownloads = []
  await context.route(/https:\/\/(?:[^/]*(?:huggingface\.co|hf\.co|hf-mirror\.com|mlc\.ai|mlc-ai\.github\.io)\/|raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/)/, (route) => {
    modelDownloads.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  const tutorRequests = []
  await context.route('https://tutor.test/v1/tutor', async (route) => {
    const request = route.request()
    const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    tutorRequests.push(request.postDataJSON())
    await route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'ai', content: tutorRequests.length === 1 ? firstReply : followupReply }) })
  })
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

  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  check('free browser AI is the default provider', await page.getByLabel('导师运行方式').inputValue() === 'local')

  await page.getByRole('button', { name: '课程中心', exact: true }).click()
  await page.getByRole('heading', { name: '你好，CodeGrow！', exact: true }).waitFor()
  check('course tree and micro-lesson are accessible', await page.getByRole('button', { name: '开始练习' }).isVisible())
  await page.getByRole('button', { name: '开始练习' }).click()
  await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 20000 })
  check('Monaco loads from bundled local assets', await page.locator('.monaco-editor').isVisible())

  await page.getByText('本地模型未启动', { exact: true }).waitFor()
  check('tutor waits for an explicit model download rather than generating canned answers', await page.locator('.chat-message.tutor').count() === 0 && await page.getByRole('button', { name: /下载并启动本地\s*AI/ }).isVisible())
  check('level-based hint controls and teaching modes have been removed', await page.getByRole('button', { name: /给我下一级提示|请求参考片段/ }).count() === 0 && await page.getByLabel('教学模式').count() === 0 && await page.locator('.hint-progress').count() === 0)
  const localModels = await page.locator('.tutor-panel').getByLabel('本地 AI 模型').locator('option').allTextContents()
  check('browser model choices offer a 7B model and a lighter 1.5B model', localModels.some((value) => value.includes('7B')) && localModels.some((value) => value.includes('1.5B')))
  const modelChoice = page.locator('.tutor-panel').getByLabel('本地 AI 模型')
  const modelSource = page.locator('.tutor-panel').getByLabel('模型下载来源')
  await modelChoice.selectOption({ label: localModels.find((value) => value.includes('1.5B')) })
  await modelSource.selectOption('mirror')
  await page.getByText('你选择了第三方镜像，其可用性和文件服务由第三方提供。', { exact: false }).waitFor()
  check('choosing a lighter model and HF Mirror does not start an automatic download', modelDownloads.length === 0 && await modelSource.inputValue() === 'mirror' && await page.getByText('本地模型未启动', { exact: true }).isVisible())
  await modelChoice.selectOption({ label: localModels.find((value) => value.includes('7B')) })
  await modelSource.selectOption('official')
  const question = page.getByLabel('向导师提问')
  if (await question.isEnabled()) await question.fill('请解释 printf 的作用。')
  check('sending is disabled before the local model is ready', await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled())
  if (await question.isEnabled()) await question.fill('')
  check('opening the classroom does not download model weights', modelDownloads.length === 0)
  const composer = await page.locator('.tutor-panel .chat-composer').boundingBox()
  check('local model setup leaves the chat composer inside the desktop viewport', composer !== null && composer.y >= 0 && composer.y + composer.height <= 1000)

  const hello = '#include <stdio.h>\nint main(void) {\n    printf("Hello, CodeGrow!\\n");\n    return 0;\n}\n'
  await page.getByRole('checkbox', { name: '本次练习由我独立完成' }).check()
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
  await page.getByRole('checkbox', { name: '本次练习由我独立完成' }).check()
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
  const beforeConversation = await exportSnapshot(page)
  check('exported SQLite contains genuine learning evidence and self-reported independence', beforeConversation.attempts.length === 3 && beforeConversation.attempts[0].independent === true && beforeConversation.hints.length === 0)

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
  check('navigation and course search never trigger automatic model downloads', modelDownloads.length === 0)
  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  await page.getByLabel('导师运行方式').selectOption('remote')
  await page.getByLabel('AI 代理服务地址').fill('https://tutor.test/v1/tutor')
  await page.getByRole('button', { name: '保存设置' }).click()
  check('optional remote provider saves without collecting API keys', await page.getByText('代理地址已保存，下一条导师消息将使用此配置。').isVisible())
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByText(/^云端\s*AI\s*待连接$/).waitFor()
  const codeBefore = await readEditorSource(page)
  await page.getByLabel('向导师提问').fill(firstQuestion)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByText('循环会在条件成立时重复执行。', { exact: false }).waitFor()
  await page.locator('.chat-code').waitFor()
  check('remote AI answers the actual question with explanation and a next task', await page.locator('.chat-message.tutor').first().innerText().then((text) => text.includes('循环会在条件成立时重复执行') && text.includes('下一步')))
  check('AI code snippets never overwrite the student editor', await page.locator('.chat-code').innerText().then((text) => text.includes('for (int i = 1; i <= 3; i++)')) && await readEditorSource(page) === codeBefore)
  await page.getByLabel('向导师提问').fill(followupQuestion)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByText(followupReply, { exact: true }).waitFor()
  check('follow-up replies remain conversational instead of advancing a fixed hint level', tutorRequests.length === 2 && await page.locator('.chat-message.tutor').count() === 2)
  check('remote requests include actual conversation history and current code', tutorRequests[1].history.some((message) => message.role === 'user' && message.content === firstQuestion) && tutorRequests[1].history.some((message) => message.role === 'assistant' && message.content === firstReply) && typeof tutorRequests[1].code === 'string' && tutorRequests[1].code.includes('sum'))
  check('remote tutor contract has no obsolete mode or hint-level fields', tutorRequests.every((request) => !Object.hasOwn(request, 'hintLevel') && !Object.hasOwn(request, 'mode')))
  await page.getByText('已保存到本地 SQLite').waitFor()
  await page.getByRole('button', { name: '课程中心', exact: true }).click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByText(followupReply, { exact: true }).waitFor()
  check('conversations survive navigation between pages', await page.getByText(firstQuestion, { exact: true }).isVisible() && await page.locator('.chat-message.tutor').count() === 2)
  await page.getByText('已保存到本地 SQLite').waitFor()
  await page.reload()
  await page.getByText(followupReply, { exact: true }).waitFor()
  check('conversations survive a full browser reload', await page.getByText(followupQuestion, { exact: true }).isVisible() && await page.locator('.chat-code').count() === 1)
  const afterConversation = await exportSnapshot(page)
  const persisted = JSON.stringify(afterConversation)
  check('chat transcripts are persisted in SQLite, not only component state', persisted.includes(firstQuestion) && persisted.includes(followupQuestion) && persisted.includes('循环会在条件成立时重复执行') && persisted.includes('换成整理书架的例子'))
  check('asking the tutor never invents hint events or student attempts', afterConversation.hints.length === 0 && afterConversation.attempts.length === beforeConversation.attempts.length)
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  const independence = page.getByRole('checkbox', { name: '本次练习由我独立完成' })
  await independence.check()
  check('learner can explicitly self-report independence after a conversation', await independence.isChecked())
  const loopSolution = '#include <stdio.h>\nint main(void) {\n    int sum = 0;\n    for (int i = 1; i <= 10; i++) { sum += i; }\n    printf("%d\\n", sum);\n    return 0;\n}\n'
  await edit(page, loopSolution)
  await run(page)
  const selfReported = await exportSnapshot(page)
  check('a learner-confirmed independent run is stored independently of earlier AI conversation', selfReported.attempts.at(-1).passed === true && selfReported.attempts.at(-1).independent === true && selfReported.hints.length === 0)
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await independence.uncheck()
  check('independence is an explicit learner choice, not the number of tutor messages', !(await independence.isChecked()))
  await edit(page, `${loopSolution}\n// This attempt was completed with assistance.\n`)
  await run(page)
  const assisted = await exportSnapshot(page)
  check('an unconfirmed independent run is stored as assisted even without hint buttons', assisted.attempts.at(-1).passed === true && assisted.attempts.at(-1).independent === false && assisted.hints.length === 0)
  check('browser CI did not fetch large AI model weights or claim local inference', modelDownloads.length === 0)

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
