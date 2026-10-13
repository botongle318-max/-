import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import type { ExecutionPreparation } from '../src/services/executor';
import { readSysrootTar } from '../src/services/executorAssets';

function tarFixture(paths = ['include/stdio.h', 'lib/wasm32-wasi/libc.a']) {
  const archive = new Uint8Array(paths.length * 1024 + 1024);
  const encoder = new TextEncoder();
  for (let index = 0; index < paths.length; index++) {
    const offset = index * 1024;
    archive.set(encoder.encode(paths[index]), offset);
    archive.set(encoder.encode('00000000001\0'), offset + 124);
    archive.fill(32, offset + 148, offset + 156);
    archive[offset + 156] = 48;
    archive[offset + 512] = 65;
    const sum = archive.subarray(offset, offset + 512).reduce((total, byte) => total + byte, 0);
    archive.set(encoder.encode(`${sum.toString(8).padStart(6, '0')}\0 `), offset + 148);
  }
  return archive;
}

describe('compiler filesystem archive', () => {
  it('extracts a checksummed C standard library archive', () => {
    const fs = readSysrootTar(tarFixture());
    expect(Object.keys(fs)).toEqual(['/include/stdio.h', '/lib/wasm32-wasi/libc.a']);
    expect(fs['/include/stdio.h'].content).toEqual(new Uint8Array([65]));
  });

  it('rejects a corrupt header rather than loading compiler inputs', () => {
    const data = tarFixture();
    data[20] = 127;
    expect(() => readSysrootTar(data)).toThrow('损坏');
  });

  it('rejects archive paths escaping the virtual filesystem', () => {
    expect(() => readSysrootTar(tarFixture(['../include/stdio.h']))).toThrow('路径无效');
  });

  it('rejects an archive without the required standard library', () => {
    expect(() => readSysrootTar(tarFixture(['hello.txt']))).toThrow('缺少 C 标准库');
  });

  it('rejects signed negative sizes even with a valid header checksum', () => {
    const data = tarFixture();
    data.set(new TextEncoder().encode('-0000001000\0'), 124);
    data.fill(32, 148, 156);
    const checksum = data.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
    data.set(new TextEncoder().encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148);
    expect(() => readSysrootTar(data)).toThrow('损坏');
  });
});

describe('verified compiler resource preparation', () => {
  const base = 'https://compiler.test/v1/';
  const clang = new Uint8Array([1, 2, 3]);
  const linker = new Uint8Array([4, 5, 6]);
  const tar = tarFixture();
  const bodies: Record<string, Uint8Array<ArrayBuffer>> = { clang, lld: linker, 'sysroot.tar': tar };
  let load: typeof import('../src/services/executorAssets')['loadCompilerAssets'];
  let stored: Map<string, Uint8Array<ArrayBuffer>>;
  let cache: {
    match: ReturnType<typeof vi.fn<(url: string) => Promise<Response | undefined>>>;
    delete: ReturnType<typeof vi.fn<(url: string) => Promise<boolean>>>;
    put: ReturnType<typeof vi.fn<(url: string, response: Response) => Promise<void>>>;
  };
  let cacheOpen: ReturnType<typeof vi.fn<() => Promise<typeof cache>>>;
  let fetchMock: ReturnType<typeof vi.fn<(url: string, options?: RequestInit) => Promise<Response>>>;
  let wasmCompile: MockInstance<typeof WebAssembly.compile>;
  let reports: ExecutionPreparation[];
  const report = (progress: ExecutionPreparation) => { reports.push(progress); };
  const seedCache = () => { for (const [name, bytes] of Object.entries(bodies)) stored.set(base + name, bytes); };
  const assetName = (url: string) => new URL(url).pathname.split('/').at(-1)!;

  beforeEach(async () => {
    vi.resetModules();
    reports = [];
    stored = new Map();
    vi.doMock('../src/services/compiler-assets.json', () => ({ default: {
      source: base,
      assets: Object.fromEntries(Object.entries(bodies).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')])),
    } }));
    vi.stubGlobal('crypto', webcrypto);
    cache = {
      match: vi.fn(async (url: string) => { const data = stored.get(url); return data ? new Response(data) : undefined; }),
      delete: vi.fn(async (url: string) => stored.delete(url)),
      put: vi.fn(async (url: string, response: Response) => { stored.set(url, new Uint8Array(await response.arrayBuffer())); }),
    };
    cacheOpen = vi.fn(async () => cache);
    vi.stubGlobal('caches', { open: cacheOpen });
    fetchMock = vi.fn(async (url: string) => new Response(bodies[assetName(url)]));
    vi.stubGlobal('fetch', fetchMock);
    wasmCompile = vi.spyOn(WebAssembly, 'compile').mockResolvedValue({} as WebAssembly.Module);
    load = (await import('../src/services/executorAssets')).loadCompilerAssets;
  });
  afterEach(() => {
    vi.doUnmock('../src/services/compiler-assets.json');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('verifies persistent cache entries without network requests', async () => {
    seedCache();
    const result = await load(base, report);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wasmCompile).toHaveBeenCalledTimes(2);
    expect(reports.filter((event) => event.stage === 'verify').every((event) => event.source === 'cache')).toBe(true);
    expect(result.timings).toHaveProperty('clang.verifyCacheMs');
    expect(cacheOpen).toHaveBeenCalledWith('codegrow-compiler-v1');
  });

  it('safely refetches one corrupt cached asset once and never executes its bytes', async () => {
    seedCache();
    const corrupt = new Uint8Array([99]);
    stored.set(base + 'clang', corrupt);
    await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(base + 'clang', { cache: 'reload' });
    expect(cache.delete).toHaveBeenCalledWith(base + 'clang');
    expect(stored.get(base + 'clang')).toEqual(clang);
    expect(wasmCompile).not.toHaveBeenCalledWith(corrupt);
    expect(reports.some((event) => event.warning?.includes('完整性'))).toBe(true);
  });

  it('falls back to verified network resources when CacheStorage cannot open', async () => {
    cacheOpen.mockRejectedValue(new DOMException('CacheStorage unavailable', 'SecurityError'));
    const result = await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.fs['/include/stdio.h']).toBeDefined();
    expect(cache.put).not.toHaveBeenCalled();
    expect(reports.some((event) => event.warning?.includes('缓存不可用'))).toBe(true);
  });

  it('falls back once when a cache match operation throws', async () => {
    seedCache();
    cache.match.mockImplementation(async (url) => {
      if (assetName(url) === 'clang') throw new Error('match failed');
      return new Response(stored.get(url)!);
    });
    await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reports.some((event) => event.warning?.includes('读取失败'))).toBe(true);
  });

  it('falls back once when a cached response body cannot be read', async () => {
    seedCache();
    cache.match.mockImplementation(async (url) => assetName(url) === 'clang'
      ? { ok: true, arrayBuffer: async () => { throw new Error('body unreadable'); } } as unknown as Response
      : new Response(stored.get(url)!));
    await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wasmCompile).toHaveBeenCalledWith(clang);
  });

  it('does not trust a non-successful cached response', async () => {
    seedCache();
    cache.match.mockImplementation(async (url) => assetName(url) === 'clang'
      ? new Response(clang, { status: 503 }) : new Response(stored.get(url)!));
    await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still verifies a fresh download if corrupt-cache deletion fails', async () => {
    seedCache();
    stored.set(base + 'clang', new Uint8Array([99]));
    cache.delete.mockRejectedValue(new Error('delete failed'));
    await load(base, report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored.get(base + 'clang')).toEqual(clang);
    expect(reports.some((event) => event.warning?.includes('无法删除'))).toBe(true);
  });

  it('rejects a bad network hash without retrying, caching, or executing it', async () => {
    seedCache();
    const corrupt = new Uint8Array([99]);
    stored.set(base + 'clang', corrupt);
    fetchMock.mockResolvedValue(new Response(corrupt));
    await expect(load(base, report)).rejects.toThrow('完整性');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls.some(([url]) => url === base + 'clang')).toBe(false);
    expect(wasmCompile).not.toHaveBeenCalledWith(corrupt);
  });

  it('keeps verified memory resources usable when persistent-cache quota is exceeded', async () => {
    cache.put.mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));
    const result = await load(base, report);
    expect(result.fs['/lib/wasm32-wasi/libc.a']).toBeDefined();
    expect(wasmCompile).toHaveBeenCalledTimes(2);
    expect(reports.some((event) => event.warning?.includes('缓存空间不足'))).toBe(true);
    expect(result.timings['clang.cacheWriteMs']).toBeGreaterThanOrEqual(0);
  });

  it('awaits cache persistence before preparing executable modules', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    cache.put.mockImplementation(async () => pending);
    const result = load(base, report);
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledTimes(3));
    expect(wasmCompile).not.toHaveBeenCalled();
    release();
    await result;
    expect(wasmCompile).toHaveBeenCalledTimes(2);
  });

  it('runs both WebAssembly compiles concurrently rather than serially awaiting Clang', async () => {
    seedCache();
    const releases: ((module: WebAssembly.Module) => void)[] = [];
    wasmCompile.mockImplementation(() => new Promise((resolve) => { releases.push(resolve); }));
    const result = load(base, report);
    await vi.waitFor(() => expect(wasmCompile).toHaveBeenCalledTimes(2));
    for (const release of releases) release({} as WebAssembly.Module);
    await result;
  });

  it('reports same-page memory reuse without repeating downloads, hashing, or compilation', async () => {
    const first = await load(base, report);
    const previousRequests = fetchMock.mock.calls.length;
    reports = [];
    const second = await load(base, report);
    expect(second.clang).toBe(first.clang);
    expect(second.fs).toBe(first.fs);
    expect(fetchMock).toHaveBeenCalledTimes(previousRequests);
    expect(wasmCompile).toHaveBeenCalledTimes(2);
    expect(reports).toEqual([expect.objectContaining({ stage: 'ready', source: 'memory' })]);
    expect(second.timings).not.toHaveProperty('clang.wasmMs');
  });

  it('does not reuse an in-memory preparation from a different asset base URL', async () => {
    await load(base, report);
    const secondBase = 'https://other-compiler.test/v1/';
    await load(secondBase, report);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenCalledWith(secondBase + 'clang', { cache: 'reload' });
    expect(wasmCompile).toHaveBeenCalledTimes(4);
  });

  it('clears a failed preparation promise so a later explicit retry can succeed', async () => {
    seedCache();
    stored.set(base + 'clang', new Uint8Array([99]));
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([99])));
    await expect(load(base, report)).rejects.toThrow('完整性');
    expect((await load(base, report)).fs['/include/stdio.h']).toBeDefined();
    expect(fetchMock.mock.calls.filter(([url]) => url === base + 'clang')).toHaveLength(2);
  });
});
