import type { WASIFS } from '@runno/wasi';
import type { ExecutionPreparation } from './executor';
import compilerManifest from './compiler-assets.json';

const ASSETS = compilerManifest.assets;
const CACHE_NAME = 'codegrow-compiler-v1';
const MANIFEST_KEY = JSON.stringify(ASSETS);
type AssetName = keyof typeof ASSETS;
type Report = (progress: ExecutionPreparation) => void;
export interface CompilerAssets {
  clang: WebAssembly.Module;
  linker: WebAssembly.Module;
  fs: WASIFS;
  timings: Record<string, number>;
}
let loaded: Promise<CompilerAssets> | undefined;
let loadedKey = '';
let ready = false;

async function digestMatches(data: ArrayBuffer, name: AssetName): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex === ASSETS[name];
}
async function verifiedAsset(baseUrl: string, name: AssetName, report: Report, timings: Record<string, number>): Promise<Uint8Array<ArrayBuffer>> {
  const url = new URL(name, baseUrl).href;
  const timed = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try { return await action(); }
    finally { timings[name + '.' + stage + 'Ms'] = performance.now() - started; }
  };
  const warn = (warning: string, source: ExecutionPreparation['source'] = 'cache') =>
    report({ stage: 'cache', asset: name, source, message: warning, warning });
  let cache: Cache | undefined;
  let cachedData: ArrayBuffer | undefined;
  report({ stage: 'cache', asset: name, source: 'cache', message: '正在检查 ' + name + ' 的浏览器缓存…' });
  await timed('cacheRead', async () => {
    if (typeof caches === 'undefined') {
      warn('浏览器不支持持久缓存；编译工具仍可在当前页面使用，刷新后可能需要重新下载。');
      return;
    }
    try { cache = await caches.open(CACHE_NAME); }
    catch { warn('编译器缓存不可用；将联网获取并校验资源，本次页面仍可复用。'); return; }
    try {
      const cached = await cache.match(url);
      if (!cached) return;
      if (!cached.ok) throw new Error('缓存响应无效');
      cachedData = await cached.arrayBuffer();
    } catch { warn(name + ' 缓存读取失败，将安全重取一次并进行 SHA-256 校验。'); }
  });
  if (cachedData) {
    report({ stage: 'verify', asset: name, source: 'cache', message: '命中 ' + name + ' 缓存，正在校验 SHA-256…' });
    if (await timed('verifyCache', () => digestMatches(cachedData!, name))) return new Uint8Array(cachedData);
    warn(name + ' 缓存完整性校验失败，不会执行缓存内容；将联网安全重取一次。');
    try { await cache?.delete(url); }
    catch { warn(name + ' 的损坏缓存无法删除；仍会独立验证新下载内容。'); }
  }
  report({ stage: 'download', asset: name, source: 'network', message: '正在下载 ' + name + '…' });
  // At most one network response per asset per preparation. Never retry a bad network hash.
  const data = await timed('download', async () => {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(name + ' 下载失败（HTTP ' + response.status + '）。');
    return response.arrayBuffer();
  });
  report({ stage: 'verify', asset: name, source: 'network', message: '正在校验 ' + name + ' 下载内容的 SHA-256…', durationMs: timings[name + '.downloadMs'] });
  if (!await timed('verifyNetwork', () => digestMatches(data, name)))
    throw new Error(name + ' 完整性校验失败；没有执行或缓存该资源。');
  if (cache) {
    await timed('cacheWrite', async () => {
      try { await cache!.put(url, new Response(data)); }
      catch (error) {
        warn(error instanceof Error && error.name === 'QuotaExceededError'
          ? name + ' 缓存空间不足；已校验资源仍可在当前页面运行，刷新后可能需要重新下载。'
          : name + ' 缓存写入失败；已校验资源仍可在当前页面运行，刷新后可能需要重新下载。', 'network');
      }
    });
  }
  return new Uint8Array(data);
}

/** Reads regular files from the toolchain's POSIX tar, verifying header checksums. */
export function readSysrootTar(data: Uint8Array): WASIFS {
  const decoder = new TextDecoder();
  const readString = (start: number, size: number) => {
    const field = data.subarray(start, start + size);
    const end = field.indexOf(0);
    return decoder.decode(end === -1 ? field : field.subarray(0, end));
  };
  const fs: WASIFS = {};
  const now = new Date(0);
  for (let offset = 0; offset + 512 <= data.length;) {
    if (data.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
    const name = readString(offset, 100);
    const prefix = readString(offset + 345, 155);
    const path = ('/' + (prefix ? prefix + '/' : '') + name).replace(/\/\.\//g, '/');
    const size = Number.parseInt(readString(offset + 124, 12).trim() || '0', 8);
    const expected = Number.parseInt(readString(offset + 148, 8).trim(), 8);
    let checksum = 0;
    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : data[offset + index];
    if (!Number.isSafeInteger(size) || size < 0 || checksum !== expected || offset + 512 + size > data.length)
      throw new Error('编译器文件系统包含损坏的 tar 记录。');
    if (path.split('/').includes('..')) throw new Error('编译器文件系统路径无效。');
    const type = data[offset + 156];
    if (type === 0 || type === 48) {
      fs[path] = { path, mode: 'binary', content: data.slice(offset + 512, offset + 512 + size),
        timestamps: { access: now, change: now, modification: now } };
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!fs['/include/stdio.h'] || !fs['/lib/wasm32-wasi/libc.a']) throw new Error('编译器文件系统缺少 C 标准库。');
  return fs;
}

export function loadCompilerAssets(baseUrl: string, report: Report = () => {}): Promise<CompilerAssets> {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').href;
  const key = base + '\u0000' + MANIFEST_KEY;
  const started = performance.now();
  if (loaded && loadedKey === key) {
    report({ stage: ready ? 'ready' : 'cache', source: 'memory', message: ready
      ? '已复用当前页面内存中的编译器，无需重新下载或编译工具。' : '正在等待当前页面已有的编译器准备任务…' });
    return loaded.then((assets) => ({ ...assets, timings: { assetsTotalMs: performance.now() - started } }));
  }
  loadedKey = key;
  ready = false;
  const timings: Record<string, number> = {};
  const compile = async (name: 'clang' | 'lld'): Promise<WebAssembly.Module> => {
    const bytes = await verifiedAsset(base, name, report, timings);
    report({ stage: 'wasm', asset: name, message: '正在准备 ' + name + ' WebAssembly 模块…' });
    const compileStarted = performance.now();
    const module = await WebAssembly.compile(bytes);
    timings[name + '.wasmMs'] = performance.now() - compileStarted;
    return module;
  };
  // Both compiles start as soon as their own verified bytes arrive; no serial await.
  const preparing = Promise.all([
    compile('clang'), compile('lld'),
    verifiedAsset(base, 'sysroot.tar', report, timings).then((tar) => {
      report({ stage: 'sysroot', asset: 'sysroot.tar', message: '正在展开并检查 C 标准库…' });
      const extractStarted = performance.now();
      const fs = readSysrootTar(tar);
      timings['sysroot.tar.extractMs'] = performance.now() - extractStarted;
      return fs;
    }),
  ]).then(([clang, linker, fs]) => {
    timings.assetsTotalMs = performance.now() - started;
    if (loaded === preparing) ready = true;
    report({ stage: 'ready', message: '编译器已准备好，可以运行 C/C++ 代码。', durationMs: timings.assetsTotalMs });
    return { clang, linker, fs, timings };
  }).catch((error: unknown) => {
    if (loaded === preparing) { loaded = undefined; ready = false; }
    throw error;
  });
  loaded = preparing;
  return preparing;
}
