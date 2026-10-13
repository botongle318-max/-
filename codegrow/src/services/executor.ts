import compilerManifest from './compiler-assets.json';

export type RunStatus = 'success' | 'compile-error' | 'runtime-error' | 'environment-error' | 'timeout' | 'cancelled';
export interface ExecutionPreparation {
  stage: 'cache' | 'download' | 'verify' | 'wasm' | 'sysroot' | 'ready';
  asset?: string;
  message: string;
  source?: 'cache' | 'network' | 'memory';
  warning?: string;
  durationMs?: number;
}
export type PreparationEvent = ExecutionPreparation;
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  status: RunStatus;
  durationMs: number;
  diagnostics?: ExecutionPreparation[];
  timings?: Record<string, number>;
}
export interface PrepareResult {
  status: 'success' | 'environment-error' | 'cancelled';
  durationMs: number;
  stderr: string;
  diagnostics: ExecutionPreparation[];
  timings?: Record<string, number>;
}
export type ExecutionPhase = 'loading' | 'compiling' | 'linking' | 'running';
export interface PreparationOptions {
  signal?: AbortSignal;
  onPreparation?: (progress: ExecutionPreparation) => void;
}
export interface RunOptions extends PreparationOptions {
  code: string;
  stdin?: string;
  language?: 'c' | 'cpp';
  timeoutMs?: number;
  onOutput?: (output: string, channel: 'stdout' | 'stderr') => void;
  onPhase?: (phase: ExecutionPhase) => void;
}
export type ExecutorMessage =
  | { type: 'phase'; id: number; phase: ExecutionPhase }
  | { type: 'preparation'; id: number; progress: ExecutionPreparation }
  | { type: 'output'; id: number; channel: 'stdout' | 'stderr'; output: string }
  | { type: 'result'; id: number; result: Omit<RunResult, 'durationMs'> };
export type ExecutorRequest =
  | { type: 'prepare'; id: number; assetBaseUrl: string }
  | { type: 'run'; id: number; code: string; stdin: string; language: 'c' | 'cpp'; assetBaseUrl: string };

interface ActiveOperation {
  type: ExecutorRequest['type'];
  id: number;
  stdout: string;
  stderr: string;
  phase: ExecutionPhase;
  phaseStarted: number;
  phaseTimings: Record<string, number>;
  diagnostics: ExecutionPreparation[];
  callbacks: Set<NonNullable<PreparationOptions['onPreparation']>>;
  options: RunOptions | PreparationOptions;
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<RunResult>;
  finish: (result: Omit<RunResult, 'durationMs'>) => void;
  timeout: () => void;
}
let worker: Worker | undefined;
let active: ActiveOperation | undefined;
let nextId = 0;
let lifecycleRegistered = false;
const MAX_SOURCE_LENGTH = 128 * 1024;
const MAX_INPUT_LENGTH = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const COMPILE_TIMEOUT_MS = 90_000;

function notify<T extends unknown[]>(callback: ((...args: T) => void) | undefined, ...args: T): void {
  // UI callbacks must not break timers, settlement, or Worker isolation.
  try { callback?.(...args); } catch { /* The consuming UI owns callback failures. */ }
}
function stopWorker(): void { worker?.terminate(); worker = undefined; }

/** Cancels preparation or execution, including a synchronous infinite C loop. */
export function cancelRun(): void {
  const current = active;
  if (!current) return;
  stopWorker();
  current.finish({ stdout: current.stdout, stderr: current.stderr, exitCode: -1, status: 'cancelled' });
}
function cancelActiveExecution(): void { if (active?.type === 'run') cancelRun(); }
function workerFailure(message: string): void {
  const current = active;
  stopWorker();
  current?.finish({
    stdout: current.stdout,
    stderr: (current.stderr + '\n代码运行环境无法启动：' + message).trim(),
    exitCode: -1, status: 'environment-error',
  });
}
function getWorker(): Worker {
  if (!lifecycleRegistered && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => { cancelRun(); stopWorker(); });
    lifecycleRegistered = true;
  }
  if (worker) return worker;
  const created = new Worker(new URL('./executor.worker.ts', import.meta.url), { type: 'module' });
  worker = created;
  created.onmessage = ({ data }: MessageEvent<ExecutorMessage>) => {
    const current = active;
    if (worker !== created || !current || current.id !== data.id) return;
    if (data.type === 'phase') {
      const now = performance.now();
      const key = current.phase + 'Ms';
      current.phaseTimings[key] = (current.phaseTimings[key] ?? 0) + now - current.phaseStarted;
      current.phase = data.phase;
      current.phaseStarted = now;
      clearTimeout(current.timer);
      const limit = data.phase === 'loading' ? DOWNLOAD_TIMEOUT_MS
        : data.phase === 'running'
          ? Math.min(Math.max((current.options as RunOptions).timeoutMs ?? 3_000, 250), 10_000)
          : COMPILE_TIMEOUT_MS;
      current.timer = setTimeout(current.timeout, limit);
      if (current.type === 'run') notify((current.options as RunOptions).onPhase, data.phase);
    } else if (data.type === 'preparation') {
      current.diagnostics.push(data.progress);
      for (const callback of current.callbacks) notify(callback, data.progress);
    } else if (data.type === 'output') {
      current[data.channel] += data.output;
      if (current.type === 'run') notify((current.options as RunOptions).onOutput, data.output, data.channel);
    } else if (data.type === 'result') current.finish(data.result);
  };
  created.onerror = (event) => {
    event.preventDefault();
    if (worker === created) workerFailure(event.message || '请刷新页面后重试。');
  };
  created.onmessageerror = () => {
    if (worker === created) workerFailure('工作线程消息无法读取，请刷新页面后重试。');
  };
  return created;
}
function assetBaseUrl(): string {
  const configured = import.meta.env.VITE_COMPILER_ASSET_BASE_URL;
  return configured ? new URL(configured, window.location.href).href : compilerManifest.source;
}
function startOperation(type: 'prepare', options: PreparationOptions, started: number): Promise<RunResult>;
function startOperation(type: 'run', options: RunOptions, started: number): Promise<RunResult>;
function startOperation(type: ExecutorRequest['type'], options: RunOptions | PreparationOptions, started: number): Promise<RunResult> {
  let resolve!: (result: RunResult) => void;
  const promise = new Promise<RunResult>((done) => { resolve = done; });
  const id = ++nextId;
  const abort = () => { if (active?.id === id) cancelRun(); };
  const finish: ActiveOperation['finish'] = (result) => {
    const current = active;
    if (!current || current.id !== id) return;
    // A failed parallel preparation must not keep old downloads alive during retry.
    // Completed, SHA-verified CacheStorage entries remain intact.
    if (result.status === 'environment-error') stopWorker();
    clearTimeout(current.timer);
    options.signal?.removeEventListener('abort', abort);
    const key = current.phase + 'Ms';
    const timings = { ...current.phaseTimings, [key]: (current.phaseTimings[key] ?? 0) + performance.now() - current.phaseStarted, ...result.timings };
    active = undefined;
    resolve({ ...result, diagnostics: current.diagnostics, timings, durationMs: Math.round(performance.now() - started) });
  };
  const timeout = () => {
    const current = active;
    if (!current || current.id !== id) return;
    stopWorker();
    const running = current.type === 'run' && current.phase === 'running';
    finish({
      stdout: current.stdout,
      stderr: current.stderr + (current.stderr ? '\n' : '') + (running
        ? '执行超时，已停止程序。检查循环条件或稍后重新运行。'
        : '编译环境准备超时。请检查网络或刷新后重试；本次不计入练习错误。'),
      exitCode: -1, status: running ? 'timeout' : 'environment-error',
    });
  };
  active = {
    type, id, stdout: '', stderr: '', phase: 'loading', phaseStarted: performance.now(), phaseTimings: {}, diagnostics: [],
    callbacks: new Set(options.onPreparation ? [options.onPreparation] : []), options,
    timer: setTimeout(timeout, DOWNLOAD_TIMEOUT_MS), promise, finish, timeout,
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) { abort(); return promise; }
  try {
    const base = assetBaseUrl();
    const request: ExecutorRequest = type === 'prepare' ? { type, id, assetBaseUrl: base } : {
      type, id, assetBaseUrl: base, code: (options as RunOptions).code,
      stdin: (options as RunOptions).stdin ?? '', language: (options as RunOptions).language ?? 'c',
    };
    getWorker().postMessage(request);
  } catch (error) {
    stopWorker();
    finish({ stdout: '', stderr: '无法创建代码运行器：' + (error instanceof Error ? error.message : String(error)), exitCode: -1, status: 'environment-error' });
  }
  return promise;
}
function emptyResult(status: RunStatus, started: number, stderr = ''): RunResult {
  return { stdout: '', stderr, exitCode: -1, status, durationMs: Math.round(performance.now() - started), diagnostics: [] };
}
async function observePreparation(current: ActiveOperation, options: PreparationOptions): Promise<RunResult> {
  const callback = options.onPreparation;
  if (callback) {
    current.callbacks.add(callback);
    const latest = current.diagnostics.at(-1);
    if (latest) notify(callback, latest);
  }
  const abort = () => { if (active?.id === current.id) cancelRun(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  try { return await current.promise; }
  finally { options.signal?.removeEventListener('abort', abort); if (callback) current.callbacks.delete(callback); }
}

/** Explicit preparation RPC: downloads/verifies/compiles tools, never student code. */
export async function prepareCompiler(options: PreparationOptions = {}): Promise<PrepareResult> {
  const started = performance.now();
  let result: RunResult;
  if (options.signal?.aborted) result = emptyResult('cancelled', started);
  else if (active?.type === 'run') result = emptyResult('environment-error', started, '程序正在编译或运行，请停止当前运行后再准备编译器。');
  else if (active?.type === 'prepare') result = await observePreparation(active, options);
  else result = await startOperation('prepare', options, started);
  return { status: result.status === 'success' || result.status === 'cancelled' ? result.status : 'environment-error',
    stderr: result.stderr, durationMs: result.durationMs, diagnostics: result.diagnostics ?? [], timings: result.timings };
}

/** Compiles, links, and executes real WASI code in the same Worker. */
export async function runCode(options: RunOptions): Promise<RunResult> {
  const started = performance.now();
  if (options.signal?.aborted) return emptyResult('cancelled', started);
  cancelActiveExecution();
  if (options.code.length > MAX_SOURCE_LENGTH || (options.stdin?.length ?? 0) > MAX_INPUT_LENGTH) {
    return emptyResult('runtime-error', started, '代码不能超过 128 KB，标准输入不能超过 64 KB。');
  }
  let waitingMs = 0;
  if (active?.type === 'prepare') {
    const result = await observePreparation(active, options);
    waitingMs = performance.now() - started;
    if (result.status !== 'success') return { ...result, durationMs: Math.round(waitingMs) };
    if (options.signal?.aborted) return emptyResult('cancelled', started);
    // Two waiting callers still obey latest-run-wins after preparation resolves.
    cancelActiveExecution();
  }
  const result = await startOperation('run', options, started);
  return waitingMs ? { ...result, timings: { ...result.timings, preparationWaitMs: waitingMs } } : result;
}
