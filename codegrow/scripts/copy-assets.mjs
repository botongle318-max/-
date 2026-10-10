import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const publicDirectory = new URL('../public/', import.meta.url)
await mkdir(publicDirectory, { recursive: true })
await copyFile(
  fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)),
  fileURLToPath(new URL('sql-wasm.wasm', publicDirectory)),
)
console.log('SQLite WebAssembly asset prepared.')
