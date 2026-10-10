import compilerManifest from './compiler-assets.json';

export type RunStatus = 'success' | 'compile-error' | 'runtime-error' | 'environment-error' | 'timeout' | 'cancelled';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  status: RunStatus;
  durationMs: number;
}

export type ExecutionPhase = 'loading' | 'compiling' | 'linking' | 'running';

export interface RunOptions {
  code: string;
  stdin?: string;
  language?: 'c' | 'cpp';
  timeoutMs?: number;
  onOutput?: (output: string, channel: 'stdout' | 'stderr') => void;
  onPhase?: (phase: ExecutionPhase) => void;
}

export type ExecutorMessage =
  | { type: 'phase'; id: number; phase: ExecutionPhase }
  | { type: 'output'; id: number; channel: 'stdout' | 'stderr'; output: string }
  | { type: 'result'; id: number; result: Omit<RunResult, 'durationMs'> };

export interface ExecutorRequest {
  id: number;
  code: string;
  stdin: string;
  language: 'c' | 'cpp';
  assetBaseUrl: string;
}

interface ActiveRun {
  id: number;
  started: number;
  stdout: string;
  stderr: string;
  phase: ExecutionPhase;
  timer: ReturnType<typeof setTimeout>;
  finish: (result: Omit<RunResult, 'durationMs'>) => void;
}

let worker: Worker | undefined;
let active: ActiveRun | undefined;
let nextId = 0;

const ASSET_BASE_URL = compilerManifest.source;
const MAX_SOURCE_LENGTH = 128 * 1024;
const MAX_INPUT_LENGTH = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const COMPILE_TIMEOUT_MS = 90_000;

function stopWorker() {
  worker?.terminate();
  worker = undefined;
}

/** Terminates the Worker, so even a synchronous infinite C loop is stopped. */
export function cancelRun(): void {
  const current = active;
  if (!current) return;
  stopWorker();
  current.finish({
    stdout: current.stdout,
    stderr: current.stderr,
    exitCode: -1,
    status: 'cancelled',
  });
}

/** Compiles with Clang, links with LLD and executes real WASI code in a Worker. */
export async function runCode(options: RunOptions): Promise<RunResult> {
  cancelRun();
  const started = performance.now();
  if (options.code.length > MAX_SOURCE_LENGTH || (options.stdin?.length ?? 0) > MAX_INPUT_LENGTH) {
    return {
      stdout: '',
      stderr: '代码不能超过 128 KB，标准输入不能超过 64 KB。',
      exitCode: -1,
      status: 'runtime-error',
      durationMs: performance.now() - started,
    };
  }

  return new Promise<RunResult>((resolve) => {
    const id = ++nextId;
    const finish: ActiveRun['finish'] = (result) => {
      if (active?.id !== id) return;
      clearTimeout(active.timer);
      active = undefined;
      resolve({ ...result, durationMs: Math.round(performance.now() - started) });
    };
    const timeout = () => {
      const current = active;
      if (!current || current.id !== id) return;
      stopWorker();
      finish({
        stdout: current.stdout,
        stderr: `${current.stderr}${current.stderr ? '\n' : ''}${current.phase === 'running'
          ? '执行超时，已停止程序。检查循环条件或稍后重新运行。'
          : '编译环境准备超时。请检查网络或刷新后重试；本次不计入练习错误。'}`,
        exitCode: -1,
        status: current.phase === 'running' ? 'timeout' : 'environment-error',
      });
    };
    active = {
      id,
      started,
      stdout: '',
      stderr: '',
      phase: 'loading',
      timer: setTimeout(timeout, DOWNLOAD_TIMEOUT_MS),
      finish,
    };

    try {
      worker ??= new Worker(new URL('./executor.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<ExecutorMessage>) => {
        const current = active;
        if (!current || current.id !== data.id) return;
        if (data.type === 'phase') {
          current.phase = data.phase;
          clearTimeout(current.timer);
          const limit = data.phase === 'loading'
            ? DOWNLOAD_TIMEOUT_MS
            : data.phase === 'running'
              ? Math.min(Math.max(options.timeoutMs ?? 3_000, 250), 10_000)
              : COMPILE_TIMEOUT_MS;
          current.timer = setTimeout(timeout, limit);
          options.onPhase?.(data.phase);
        } else if (data.type === 'output') {
          current[data.channel] += data.output;
          options.onOutput?.(data.output, data.channel);
        } else {
          finish(data.result);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const current = active;
        stopWorker();
        finish({
          stdout: current?.stdout ?? '',
          stderr: `${current?.stderr ?? ''}\n代码运行环境无法启动：${event.message || '请刷新页面后重试。'}`.trim(),
          exitCode: -1,
          status: 'environment-error',
        });
      };
      const configuredBaseUrl = import.meta.env.VITE_COMPILER_ASSET_BASE_URL;
      const assetBaseUrl = configuredBaseUrl
        ? new URL(configuredBaseUrl, window.location.href).href
        : ASSET_BASE_URL;
      const request: ExecutorRequest = {
        id,
        code: options.code,
        stdin: options.stdin ?? '',
        language: options.language ?? 'c',
        assetBaseUrl,
      };
      worker.postMessage(request);
    } catch (error) {
      stopWorker();
      finish({
        stdout: '',
        stderr: `无法创建代码运行器：${error instanceof Error ? error.message : String(error)}`,
        exitCode: -1,
        status: 'environment-error',
      });
    }
  });
}
