// Run after npm install. Requires Playwright and an available Chromium installation.
// A fresh browser context is used so this test never touches the user's saved learning data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.CODEGROW_DATABASE_TEST_PORT ?? 5192)
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', chunk => { serverOutput += chunk.toString() })
server.stderr.on('data', chunk => { serverOutput += chunk.toString() })
let browser

function test(name, check) {
  assert.ok(check, name)
  console.log(`PASS ${name}`)
}

try {
  for (let tries = 0; tries < 100; tries += 1) {
    if (server.exitCode !== null) throw new Error(`Test server failed to start: ${serverOutput}`)
    try {
      const response = await fetch(`${origin}/sql-wasm.wasm`)
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        test('local SQL.js WebAssembly asset is served and has a WASM signature', bytes[0] === 0 && bytes[1] === 97 && bytes[2] === 115 && bytes[3] === 109)
        break
      }
    } catch { /* Vite has not started yet. */ }
    if (tries === 99) throw new Error(`Test server did not become ready: ${serverOutput}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  browser = await chromium.launch({
    ...(process.env.CODEGROW_CHROMIUM_PATH ? { executablePath: process.env.CODEGROW_CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
    headless: true,
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route(`${origin}/database-test.html`, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head><title>SQLite browser verification</title></head><body>Isolated SQLite test</body></html>',
  }))
  const errors = []
  page.on('pageerror', error => { errors.push(error.message) })
  await page.goto(`${origin}/database-test.html`)

  const first = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    const learning = await import('/src/services/learning.ts')
    await Promise.all([db.initDatabase(), db.initDatabase()])
    const empty = await db.readSnapshot()
    const snapshot = learning.recordAttempt(learning.createEmptySnapshot(), {
      exerciseId: 'browser-test', conceptId: 'loops', passed: true, score: 100,
      independent: true, hintLevel: 0, fingerprint: 'a'.repeat(64),
    })
    snapshot.drafts['browser-test'] = '#include <stdio.h>\nint main(void){puts("你好，CodeGrow!");return 0;}'
    snapshot.completedIds = ['browser-test']
    await db.saveSnapshot(snapshot)
    const actual = await db.readSnapshot()
    const signature = new TextDecoder().decode(db.exportDatabase().slice(0, 16))
    return { empty, actual, expected: snapshot, signature }
  })
  test('new database has no invented learning records', first.empty === null)
  assert.deepEqual(first.actual, first.expected)
  console.log('PASS save and read real SQLite state including UTF-8 code and fingerprints')
  test('export is a genuine SQLite database', first.signature === 'SQLite format 3\0')

  await page.reload()
  const restored = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    await db.initDatabase()
    return db.readSnapshot()
  })
  assert.deepEqual(restored, first.expected)
  console.log('PASS SQLite bytes are restored from IndexedDB after a complete page reload')

  const queued = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    const initial = await db.readSnapshot()
    const one = { ...initial, completedIds: ['one'] }
    const two = { ...initial, completedIds: ['one', 'two'] }
    await Promise.all([db.saveSnapshot(one), db.saveSnapshot(two)])
    return db.readSnapshot()
  })
  assert.deepEqual(queued.completedIds, ['one', 'two'])
  console.log('PASS queued writes preserve call order and the newest snapshot')

  const failedSave = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    const previous = await db.readSnapshot()
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new DOMException('Simulated quota failure', 'QuotaExceededError')
      return transaction.apply(this, args)
    }
    let rejected = false
    try {
      await db.saveSnapshot({ ...previous, completedIds: ['should-not-save'] })
    } catch { rejected = true }
    finally { IDBDatabase.prototype.transaction = transaction }
    return { rejected, previous, actual: await db.readSnapshot() }
  })
  test('a failed IndexedDB write reports failure instead of success', failedSave.rejected)
  assert.deepEqual(failedSave.actual, failedSave.previous)
  console.log('PASS failed persistence restores the previous in-memory SQLite snapshot')

  const reset = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    await db.resetDatabase()
    return { snapshot: await db.readSnapshot(), signature: new TextDecoder().decode(db.exportDatabase().slice(0, 16)) }
  })
  test('reset deletes records while retaining a valid SQLite database', reset.snapshot === null && reset.signature === 'SQLite format 3\0')
  await page.reload()
  const emptyAfterReload = await page.evaluate(async () => {
    const db = await import('/src/services/database.ts')
    await db.initDatabase()
    return db.readSnapshot()
  })
  test('reset is persisted across page reloads', emptyAfterReload === null)
  assert.deepEqual(errors, [])
  console.log('PASS no browser page errors during database operations')
} catch (error) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const diagnostic = error instanceof Error ? (error.stack || error.message) : String(error)
    const escaped = diagnostic.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    console.error(`::error title=CodeGrow SQLite browser verification::${escaped}`)
  }
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
