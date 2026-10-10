import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, unlink, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);
const manifest = JSON.parse(await readFile(new URL('../src/services/compiler-assets.json', import.meta.url), 'utf8'));
const destination = fileURLToPath(new URL('../public/compiler/', import.meta.url));
const source = process.env.CODEGROW_COMPILER_SOURCE_URL || manifest.source;

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function prepare(name, expected) {
  const target = join(destination, name);
  try {
    const existing = await readFile(target);
    if (digest(existing) !== expected) {
      throw new Error(`${target} 已存在且 SHA-256 与清单不符；文件已保留，请先将它移走再重试。`);
    }
    console.log(`已校验 ${name} (${(existing.length / 1024 / 1024).toFixed(1)} MiB)，跳过下载。`);
    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const temporary = join(destination, `.${name}.download-${randomUUID()}`);
  const url = new URL(name, source.endsWith('/') ? source : `${source}/`);
  if (url.protocol !== 'https:') throw new Error('编译器下载地址必须使用 HTTPS。');
  console.log(`下载并校验 ${name}…`);
  try {
    // curl uses the OS certificate store and environment proxy. No shell or TLS bypass.
    await run('curl', [
      '--fail', '--location', '--silent', '--show-error',
      '--proto', '=https', '--proto-redir', '=https',
      '--retry', '2', '--connect-timeout', '20', '--max-time', '180',
      '--output', temporary, url.href,
    ], { windowsHide: true, timeout: 600_000 });
    const data = await readFile(temporary);
    if (digest(data) !== expected) throw new Error(`${name} SHA-256 校验失败，没有使用下载的文件。`);
    await rename(temporary, target);
    console.log(`已保存并校验 ${name} (${(data.length / 1024 / 1024).toFixed(1)} MiB)。`);
  } finally {
    await unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

try {
  await mkdir(destination, { recursive: true });
  const results = await Promise.allSettled(Object.entries(manifest.assets).map(([name, expected]) => prepare(name, expected)));
  const failures = results.filter(result => result.status === 'rejected');
  for (const result of failures) console.error(result.reason.message);
  if (failures.length) process.exitCode = 1;
  else {
    await cp(fileURLToPath(new URL('../resources/licenses/', import.meta.url)), join(destination, 'resources', 'licenses'), { recursive: true });
    await cp(fileURLToPath(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url)), join(destination, 'THIRD_PARTY_NOTICES.md'));
    console.log('Clang / LLD / C 标准库及第三方许可已就绪。构建时设置 VITE_COMPILER_ASSET_BASE_URL=./compiler/ 即可同源运行。');
  }
} catch (error) {
  console.error(`准备编译器失败：${error.message}`);
  process.exitCode = 1;
}
