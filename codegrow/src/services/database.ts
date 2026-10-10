import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { isLearningSnapshot, type LearningSnapshot } from './learning'

const DATABASE_NAME = 'codegrow-learning'
const OBJECT_STORE = 'database'
const FILE_KEY = 'learning.sqlite'

let sqlite: SqlJsStatic | null = null
let database: Database | null = null
let initialization: Promise<void> | null = null
let pendingWrite: Promise<void> = Promise.resolve()

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('当前浏览器不支持本地数据库，请使用最新版 Chrome、Edge 或 Firefox。'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) {
        request.result.createObjectStore(OBJECT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('无法打开本地数据库，请检查浏览器存储权限。'))
    request.onblocked = () => reject(new Error('数据库正在被其他标签页升级，请关闭其他 CodeGrow 页面后重试。'))
  })
}

async function readBytes(): Promise<Uint8Array | null> {
  const storage = await openStorage()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = storage.transaction(OBJECT_STORE, 'readonly')
      const request = transaction.objectStore(OBJECT_STORE).get(FILE_KEY)
      request.onsuccess = () => {
        const result: unknown = request.result
        if (result === undefined) resolve(null)
        else if (result instanceof Uint8Array) resolve(result)
        else if (result instanceof ArrayBuffer) resolve(new Uint8Array(result))
        else reject(new Error('本地数据库文件格式异常，请先导出备份后再重置。'))
      }
      request.onerror = () => reject(new Error('读取本地数据库失败。'))
      transaction.onabort = () => reject(new Error('读取本地数据库被中断。'))
    })
  } finally {
    storage.close()
  }
}

async function persistBytes(bytes: Uint8Array): Promise<void> {
  const storage = await openStorage()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = storage.transaction(OBJECT_STORE, 'readwrite')
      transaction.objectStore(OBJECT_STORE).put(bytes, FILE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('学习记录保存失败，浏览器存储可能已满。请导出备份后释放空间。'))
      transaction.onabort = () => reject(new Error('学习记录保存被中断，请重新尝试。'))
    })
  } finally {
    storage.close()
  }
}

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS learning_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    PRAGMA user_version = 1;
  `)
}

export function initDatabase(): Promise<void> {
  if (database) return Promise.resolve()
  if (initialization) return initialization
  initialization = (async () => {
    const [engine, bytes] = await Promise.all([
      initSqlJs({ locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm` }),
      readBytes(),
    ])
    sqlite = engine
    const candidate = bytes ? new engine.Database(bytes) : new engine.Database()
    try {
      createSchema(candidate)
      if (!bytes) await persistBytes(candidate.export())
      database = candidate
    } catch (error) {
      candidate.close()
      database = null
      throw error
    }
  })().catch((error: unknown) => {
    initialization = null
    throw error
  })
  return initialization
}

export async function readSnapshot(): Promise<LearningSnapshot | null> {
  await initDatabase()
  await pendingWrite
  const statement = database!.prepare('SELECT payload FROM learning_snapshot WHERE id = 1')
  try {
    if (!statement.step()) return null
    const { payload } = statement.getAsObject()
    const parsed: unknown = JSON.parse(String(payload))
    if (!isLearningSnapshot(parsed)) throw new Error('学习记录格式不兼容，请导出数据库备份后再重置。')
    return parsed
  } finally {
    statement.free()
  }
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const write = pendingWrite.then(operation)
  // A failed write must not prevent the next save or reset from running.
  pendingWrite = write.catch(() => undefined)
  return write
}

export function saveSnapshot(snapshot: LearningSnapshot): Promise<void> {
  if (!isLearningSnapshot(snapshot)) return Promise.reject(new Error('学习记录数据无效，未写入数据库。'))
  // Capture immediately so the caller cannot mutate a queued snapshot before it is saved.
  const payload = JSON.stringify(snapshot)
  return enqueueWrite(async () => {
    await initDatabase()
    const before = database!.export()
    try {
      database!.run(
        'INSERT INTO learning_snapshot (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at',
        [payload, new Date().toISOString()],
      )
      await persistBytes(database!.export())
    } catch (error) {
      database!.close()
      database = new sqlite!.Database(before)
      throw error
    }
  })
}

export function exportDatabase(): Uint8Array {
  if (!database) throw new Error('数据库尚未初始化，请稍后重试。')
  return database.export()
}

export function resetDatabase(): Promise<void> {
  return enqueueWrite(async () => {
    await initDatabase()
    const before = database!.export()
    try {
      database!.run('DELETE FROM learning_snapshot')
      await persistBytes(database!.export())
    } catch (error) {
      database!.close()
      database = new sqlite!.Database(before)
      throw error
    }
  })
}
