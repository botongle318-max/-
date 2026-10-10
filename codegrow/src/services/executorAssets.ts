import type { WASIFS } from '@runno/wasi';
import compilerManifest from './compiler-assets.json';

// Historical binji/wasm-clang build, also used by EduOJ/wasm-clang.
// HTTPS source URLs are version-pinned; each response is verified before use.
const ASSETS = compilerManifest.assets;
const CACHE_NAME = 'codegrow-compiler-v1';

interface CompilerAssets {
  clang: WebAssembly.Module;
  linker: WebAssembly.Module;
  fs: WASIFS;
}

let loaded: Promise<CompilerAssets> | undefined;

async function verifiedAsset(baseUrl: string, name: keyof typeof ASSETS): Promise<Uint8Array<ArrayBuffer>> {
  const url = new URL(name, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
  const cache = typeof caches === 'undefined' ? undefined : await caches.open(CACHE_NAME).catch(() => undefined);
  const cached = await cache?.match(url);
  const response = cached ?? await fetch(url);
  if (!response.ok) throw new Error(`${name} 下载失败（HTTP ${response.status}）。`);
  const data = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== ASSETS[name]) {
    await cache?.delete(url);
    throw new Error(`${name} 完整性校验失败；没有执行该资源。`);
  }
  if (!cached) await cache?.put(url, new Response(data)).catch(() => undefined);
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
    const path = `/${prefix ? `${prefix}/` : ''}${name}`.replace(/\/\.\//g, '/');
    const size = Number.parseInt(readString(offset + 124, 12).trim() || '0', 8);
    const expected = Number.parseInt(readString(offset + 148, 8).trim(), 8);
    let checksum = 0;
    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : data[offset + index];
    if (!Number.isFinite(size) || checksum !== expected || offset + 512 + size > data.length) {
      throw new Error('编译器文件系统包含损坏的 tar 记录。');
    }
    if (path.split('/').includes('..')) throw new Error('编译器文件系统路径无效。');
    const type = data[offset + 156];
    if (type === 0 || type === 48) {
      fs[path] = {
        path,
        mode: 'binary',
        content: data.slice(offset + 512, offset + 512 + size),
        timestamps: { access: now, change: now, modification: now },
      };
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!fs['/include/stdio.h'] || !fs['/lib/wasm32-wasi/libc.a']) {
    throw new Error('编译器文件系统缺少 C 标准库。');
  }
  return fs;
}

export function loadCompilerAssets(baseUrl: string): Promise<CompilerAssets> {
  loaded ??= Promise.all([
    verifiedAsset(baseUrl, 'clang'),
    verifiedAsset(baseUrl, 'lld'),
    verifiedAsset(baseUrl, 'sysroot.tar'),
  ]).then(async ([clang, linker, tar]) => ({
    clang: await WebAssembly.compile(clang),
    linker: await WebAssembly.compile(linker),
    fs: readSysrootTar(tar),
  })).catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
