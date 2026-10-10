import { describe, expect, it } from 'vitest';
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
});
