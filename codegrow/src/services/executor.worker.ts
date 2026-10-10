import { WASI, type WASIFS } from '@runno/wasi';
import type { ExecutorMessage, ExecutorRequest, ExecutionPhase, RunResult } from './executor';
import { loadCompilerAssets } from './executorAssets';

const OUTPUT_LIMIT = 64 * 1024;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ExecutorRequest>) => void) | null;
  postMessage: (message: ExecutorMessage) => void;
};

scope.onmessage = async ({ data: request }) => {
  let stdout = '';
  let stderr = '';
  const execution: { phase: ExecutionPhase } = { phase: 'loading' };
  const sendPhase = (value: ExecutionPhase) => {
    execution.phase = value;
    scope.postMessage({ type: 'phase', id: request.id, phase: value });
  };
  const output = (value: string, channel: 'stdout' | 'stderr') => {
    const current = channel === 'stdout' ? stdout : stderr;
    if (current.length + value.length > OUTPUT_LIMIT) {
      throw new Error('输出超过 64 KB，程序已停止。检查是否持续打印或进入无限循环。');
    }
    if (channel === 'stdout') stdout += value;
    else stderr += value;
    scope.postMessage({ type: 'output', id: request.id, channel, output: value });
  };
  const complete = (status: RunResult['status'], exitCode: number) => {
    scope.postMessage({ type: 'result', id: request.id, result: { stdout, stderr, status, exitCode } });
  };

  try {
    sendPhase('loading');
    const assets = await loadCompilerAssets(request.assetBaseUrl);
    const now = new Date();
    let fs: WASIFS = structuredClone(assets.fs);
    const source = request.language === 'cpp' ? '/main.cpp' : '/main.c';
    fs[source] = {
      path: source,
      content: request.code,
      mode: 'string',
      timestamps: { access: now, change: now, modification: now },
    };
    const execute = async (module: WebAssembly.Module, args: string[], input = '') => {
      let inputConsumed = false;
      const wasi = new WASI({
        fs,
        args,
        env: {},
        stdout: (text) => output(text, 'stdout'),
        stderr: (text) => output(text, 'stderr'),
        stdin: () => {
          if (inputConsumed || !input) return null;
          inputConsumed = true;
          return input;
        },
      });
      const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
      const result = wasi.start({ module, instance });
      fs = result.fs;
      return result.exitCode;
    };

    sendPhase('compiling');
    const compileExit = await execute(assets.clang, [
      'clang', '-cc1', '-triple', 'wasm32-unknown-wasi',
      '-isysroot', '/',
      ...(request.language === 'cpp' ? ['-internal-isystem', '/include/c++/v1', '-x', 'c++', '-std=c++17'] : ['-x', 'c', '-std=c11']),
      '-internal-isystem', '/include', '-internal-isystem', '/lib/clang/8.0.1/include',
      '-ferror-limit', '6', '-fmessage-length', '100',
      '-O0', '-emit-obj', '-o', '/main.o', source,
    ]);
    if (compileExit !== 0) {
      complete('compile-error', compileExit);
      return;
    }
    sendPhase('linking');
    const linkExit = await execute(assets.linker, [
      'wasm-ld', '--no-threads', '--export-dynamic', '--max-memory=67108864', '-z', 'stack-size=1048576',
      '-L/lib/wasm32-wasi', '/lib/wasm32-wasi/crt1.o', '/main.o', '-lc',
      ...(request.language === 'cpp' ? ['-lc++', '-lc++abi'] : []),
      '-o', '/program.wasm',
    ]);
    if (linkExit !== 0) {
      complete('compile-error', linkExit);
      return;
    }
    const binary = fs['/program.wasm'];
    if (!binary || binary.mode !== 'binary') throw new Error('链接器没有生成可执行程序。');
    const program = await WebAssembly.compile(new Uint8Array(binary.content));
    // Yield once so the main thread can arm the runtime timer before _start executes.
    sendPhase('running');
    const programExit = await execute(program, ['program'], request.stdin);
    complete(programExit === 0 ? 'success' : 'runtime-error', programExit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = execution.phase === 'loading'
      ? `编译器资源加载失败：${message}\n首次运行需要网络下载编译器；请检查网络后重试。`
      : `程序执行失败：${message}`;
    stderr += `${stderr ? '\n' : ''}${diagnostic}`;
    complete(execution.phase === 'loading'
      ? 'environment-error'
      : execution.phase === 'compiling' || execution.phase === 'linking' ? 'compile-error' : 'runtime-error', -1);
  }
};
