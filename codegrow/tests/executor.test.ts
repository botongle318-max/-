import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutorMessage, ExecutorRequest } from '../src/services/executor';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
let executor: typeof import('../src/services/executor');
let testWindow: EventTarget & { location: { href: string } };

class TestWorker {
  static latest: TestWorker;
  static instances: TestWorker[] = [];
  onmessage?: (event: MessageEvent<ExecutorMessage>) => void;
  onerror?: (event: ErrorEvent) => void;
  onmessageerror?: () => void;
  request?: ExecutorRequest;
  requests: ExecutorRequest[] = [];
  terminated = false;

  constructor() { TestWorker.latest = this; TestWorker.instances.push(this); }
  postMessage(request: ExecutorRequest) { this.request = request; this.requests.push(request); }
  terminate() { this.terminated = true; }
  emit(message: WithoutId<ExecutorMessage>, id = this.request!.id) {
    this.onmessage?.({ data: { ...message, id } } as MessageEvent<ExecutorMessage>);
  }
  succeed(timings?: Record<string, number>) { this.emit({ type: 'result', result: { stdout: 'ok', stderr: '', exitCode: 0, status: 'success', timings } }); }
}

describe('execution lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    TestWorker.instances = [];
    vi.stubGlobal('Worker', TestWorker);
    testWindow = Object.assign(new EventTarget(), { location: { href: 'http://localhost:4178/' } });
    vi.stubGlobal('window', testWindow);
    executor = await import('../src/services/executor');
  });
  afterEach(() => {
    executor.cancelRun();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('terminates a running Worker at the execution deadline', async () => {
    const resultPromise = executor.runCode({ code: 'int main(){while(1){}}' });
    const worker = TestWorker.latest;
    worker.emit({ type: 'phase', phase: 'running' });
    await vi.advanceTimersByTimeAsync(3001);
    expect((await resultPromise).status).toBe('timeout');
    expect(worker.terminated).toBe(true);
  });

  it('does not apply the runtime deadline to a compiler download', async () => {
    const resultPromise = executor.runCode({ code: 'int main(){return 0;}' });
    const worker = TestWorker.latest;
    await vi.advanceTimersByTimeAsync(4000);
    expect(worker.terminated).toBe(false);
    executor.cancelRun();
    expect((await resultPromise).status).toBe('cancelled');
  });

  it('classifies a compiler download deadline as an environment failure', async () => {
    const resultPromise = executor.runCode({ code: 'int main(){return 0;}' });
    await vi.advanceTimersByTimeAsync(120_001);
    expect((await resultPromise).status).toBe('environment-error');
    expect(TestWorker.latest.terminated).toBe(true);
  });

  it('classifies a Worker startup failure as an environment failure', async () => {
    const resultPromise = executor.runCode({ code: 'int main(){return 0;}' });
    TestWorker.latest.onerror?.({ preventDefault() {}, message: 'Worker blocked' } as ErrorEvent);
    const result = await resultPromise;
    expect(result.status).toBe('environment-error');
    expect(result.stderr).toContain('Worker blocked');
  });

  it('keeps partial output when a user cancels', async () => {
    const onOutput = vi.fn();
    const resultPromise = executor.runCode({ code: 'int main(){return 0;}', onOutput });
    const worker = TestWorker.latest;
    worker.emit({ type: 'output', channel: 'stdout', output: 'started\n' });
    executor.cancelRun();
    expect((await resultPromise).stdout).toBe('started\n');
    expect(onOutput).toHaveBeenCalledWith('started\n', 'stdout');
  });

  it('cancels the earlier run when a new run starts', async () => {
    const previous = executor.runCode({ code: 'int main(){while(1){}}' });
    const next = executor.runCode({ code: 'int main(){return 0;}' });
    expect((await previous).status).toBe('cancelled');
    executor.cancelRun();
    expect((await next).status).toBe('cancelled');
  });

  it('gives compiler execution a separate 90 second deadline', async () => {
    const result = executor.runCode({ code: 'int main(){return 0;}' });
    TestWorker.latest.emit({ type: 'phase', phase: 'compiling' });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(TestWorker.latest.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect((await result).status).toBe('environment-error');
  });

  it('prepares without sending any student code and retains diagnostic timings', async () => {
    const onPreparation = vi.fn();
    const result = executor.prepareCompiler({ onPreparation });
    expect(TestWorker.latest.request?.type).toBe('prepare');
    expect(TestWorker.latest.request).not.toHaveProperty('code');
    const progress = { stage: 'verify' as const, source: 'cache' as const, asset: 'clang', message: 'SHA checked' };
    TestWorker.latest.emit({ type: 'preparation', progress });
    TestWorker.latest.succeed({ assetsTotalMs: 12 });
    expect(await result).toMatchObject({ status: 'success', diagnostics: [progress], timings: { assetsTotalMs: 12 } });
    expect(onPreparation).toHaveBeenCalledWith(progress);
    expect(TestWorker.latest.terminated).toBe(false);
  });

  it('deduplicates concurrent explicit preparations', async () => {
    const first = executor.prepareCompiler();
    const secondProgress = vi.fn();
    const second = executor.prepareCompiler({ onPreparation: secondProgress });
    expect(TestWorker.latest.requests).toHaveLength(1);
    TestWorker.latest.emit({ type: 'preparation', progress: { stage: 'ready', message: 'ready' } });
    TestWorker.latest.succeed();
    expect((await first).status).toBe('success');
    expect((await second).status).toBe('success');
    expect(secondProgress).toHaveBeenCalledOnce();
  });

  it('terminates failed preparation before retry and ignores its late messages', async () => {
    const preparation = executor.prepareCompiler();
    const failed = TestWorker.latest;
    failed.emit({ type: 'result', result: { stdout: '', stderr: 'clang HTTP 503', exitCode: -1, status: 'environment-error' } });
    expect((await preparation).status).toBe('environment-error');
    expect(failed.terminated).toBe(true);
    const onPreparation = vi.fn();
    const retry = executor.prepareCompiler({ onPreparation });
    expect(TestWorker.latest).not.toBe(failed);
    failed.emit({ type: 'preparation', progress: { stage: 'download', message: 'old download' } });
    failed.succeed();
    expect(onPreparation).not.toHaveBeenCalled();
    TestWorker.latest.succeed();
    expect((await retry).status).toBe('success');
  });

  it('reuses the prepared Worker for subsequent warm runs', async () => {
    const prepared = executor.prepareCompiler();
    const original = TestWorker.latest;
    original.succeed();
    await prepared;
    const result = executor.runCode({ code: 'int main(){return 0;}' });
    expect(TestWorker.latest).toBe(original);
    expect(original.requests.map((request) => request.type)).toEqual(['prepare', 'run']);
    original.emit({ type: 'preparation', progress: { stage: 'ready', source: 'memory', message: 'warm' } });
    original.succeed();
    expect((await result).diagnostics?.[0].source).toBe('memory');
    executor.cancelRun();
    expect(original.terminated).toBe(false);
  });

  it('waits for active preparation without restarting its Worker or download', async () => {
    const prepared = executor.prepareCompiler();
    const original = TestWorker.latest;
    const run = executor.runCode({ code: 'int main(){return 0;}' });
    expect(original.requests).toHaveLength(1);
    expect(original.terminated).toBe(false);
    original.succeed();
    await prepared;
    await vi.advanceTimersByTimeAsync(0);
    expect(original.requests.map((request) => request.type)).toEqual(['prepare', 'run']);
    expect(TestWorker.instances).toHaveLength(1);
    original.succeed();
    expect((await run).status).toBe('success');
  });

  it('settles preparation and its waiting run when cancelled', async () => {
    const prepared = executor.prepareCompiler();
    const run = executor.runCode({ code: 'int main(){return 0;}' });
    executor.cancelRun();
    expect((await prepared).status).toBe('cancelled');
    expect((await run).status).toBe('cancelled');
    expect(TestWorker.latest.requests).toHaveLength(1);
  });

  it('cancels preparation via AbortSignal and cleans up the listener', async () => {
    const controller = new AbortController();
    const cleanup = vi.spyOn(controller.signal, 'removeEventListener');
    const prepared = executor.prepareCompiler({ signal: controller.signal });
    controller.abort();
    expect((await prepared).status).toBe('cancelled');
    expect(TestWorker.latest.terminated).toBe(true);
    expect(cleanup).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cancels active preparation when a waiting run is aborted', async () => {
    const prepared = executor.prepareCompiler();
    const controller = new AbortController();
    const run = executor.runCode({ code: 'int main(){return 0;}', signal: controller.signal });
    controller.abort();
    expect((await prepared).status).toBe('cancelled');
    expect((await run).status).toBe('cancelled');
    expect(TestWorker.instances).toHaveLength(1);
  });

  it('times out explicit preparation as an environment failure', async () => {
    const prepared = executor.prepareCompiler();
    await vi.advanceTimersByTimeAsync(120_001);
    const result = await prepared;
    expect(result.status).toBe('environment-error');
    expect(result.stderr).toContain('超时');
    expect(TestWorker.latest.terminated).toBe(true);
  });

  it('does not create a Worker for an already aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await executor.prepareCompiler({ signal: controller.signal })).status).toBe('cancelled');
    expect((await executor.runCode({ code: '', signal: controller.signal })).status).toBe('cancelled');
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('does not interrupt a running program to service a preparation request', async () => {
    const run = executor.runCode({ code: 'int main(){return 0;}' });
    expect((await executor.prepareCompiler()).status).toBe('environment-error');
    expect(TestWorker.latest.terminated).toBe(false);
    TestWorker.latest.succeed();
    expect((await run).status).toBe('success');
  });

  it('cancels preparation on pagehide without touching stored learning data', async () => {
    const prepared = executor.prepareCompiler();
    testWindow.dispatchEvent(new Event('pagehide'));
    expect((await prepared).status).toBe('cancelled');
    expect(TestWorker.latest.terminated).toBe(true);
  });

  it('ignores stale messages and errors from a terminated Worker', async () => {
    const oldRun = executor.runCode({ code: '' });
    const old = TestWorker.latest;
    const nextRun = executor.runCode({ code: '' });
    const next = TestWorker.latest;
    old.emit({ type: 'result', result: { status: 'success', stdout: 'stale', stderr: '', exitCode: 0 } }, next.request!.id);
    old.onerror?.({ preventDefault() {}, message: 'stale error' } as ErrorEvent);
    expect(next.terminated).toBe(false);
    next.succeed();
    expect((await oldRun).status).toBe('cancelled');
    expect((await nextRun).stdout).toBe('ok');
  });

  it('classifies an unreadable Worker message as an environment failure', async () => {
    const prepared = executor.prepareCompiler();
    TestWorker.latest.onmessageerror?.();
    expect((await prepared).status).toBe('environment-error');
  });

  it('does not let throwing UI callbacks break operation settlement', async () => {
    const fail = () => { throw new Error('UI callback failure'); };
    const result = executor.runCode({ code: '', onPhase: fail, onPreparation: fail, onOutput: fail });
    TestWorker.latest.emit({ type: 'phase', phase: 'running' });
    TestWorker.latest.emit({ type: 'preparation', progress: { stage: 'ready', message: 'ready' } });
    TestWorker.latest.emit({ type: 'output', channel: 'stdout', output: 'ok' });
    TestWorker.latest.succeed();
    expect((await result).status).toBe('success');
  });
});
