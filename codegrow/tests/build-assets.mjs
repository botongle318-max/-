// Production bundle regressions. Does not load a model or contact any model host.
import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve('dist')
const manifest = JSON.parse(await readFile(resolve(directory, '.vite/manifest.json'), 'utf8'))
const editor = manifest['src/components/Editor.tsx']
assert.ok(editor?.isDynamicEntry, 'Monaco stays a lazy production entry')
assert.ok(manifest['index.html'].dynamicImports.includes('src/components/Editor.tsx'))
assert.ok(!manifest['index.html'].imports?.includes('src/components/Editor.tsx'), 'homepage never eagerly imports the editor')
assert.ok((await stat(resolve(directory, editor.file))).size < 3_200_000, 'C editor does not regain the all-contributions bundle')
assert.ok(!manifest['node_modules/@mlc-ai/web-llm/lib/index.js'], 'main thread has no separate full WebLLM runtime entry')
const bundles = await Promise.all((await readdir(resolve(directory, 'assets'))).filter(name => name.endsWith('.js')).map(async name => ({ name, size: (await stat(resolve(directory, 'assets', name))).size })))
const large = bundles.filter(bundle => bundle.size > 4_000_000)
assert.equal(large.length, 1, 'exactly one large local AI runtime, not separate main + worker copies')
assert.match(large[0].name, /^tutor\.worker-/)
for (const asset of ['clang', 'lld', 'sysroot.tar']) assert.ok((await stat(resolve(directory, 'compiler', asset))).size > 0)
assert.ok((await stat(resolve(directory, 'sql-wasm.wasm'))).size > 0)
console.log('PASS lazy Monaco budget, single Worker-only WebLLM runtime and intact compiler/SQLite assets')
