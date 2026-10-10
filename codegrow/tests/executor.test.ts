import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelRun, runCode, type ExecutorMessage, type ExecutorRequest } from '../src/services/executor';

class TestWorker {
  static latest: TestWorker;
  onmessage?: (event: MessageEvent<ExecutorMessage>) => void;
  onerror?: (event: ErrorEvent) => void;
  request?: ExecutorRequest;
  terminated = false;

  constructor() { TestWorker.latest = this; }
  postMessage(request: ExecutorRequest) { this.request = request; }
  terminate() { this.terminated = true; }
  emit(message: Omit<ExecutorMessage, 'id'>) {
    this.onmessage?.({ data: { ...message, id: this.request!.id } } as MessageEvent<ExecutorMessage>);
  }
}

describe('execution lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TestWorker);
    vi.stubGlobal('window', { location: { href: 'http://localhost:4178/' } });
  });
  afterEach(() => {
    cancelRun();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('terminates a running Worker at the execution deadline', async () => {
    const resultPromise = runCode({ code: 'int main(){while(1){}}' });
    const worker = TestWorker.latest;
    worker.emit({ type: 'phase', phase: 'running' } as Omit<ExecutorMessage, 'id'>);
    await vi.advanceTimersByTimeAsync(3001);
    expect((await resultPromise).status).toBe('timeout');
    expect(worker.terminated).toBe(true);
  });

  it('does not apply the runtime deadline to a compiler download', async () => {
    const resultPromise = runCode({ code: 'int main(){return 0;}' });
    const worker = TestWorker.latest;
    await vi.advanceTimersByTimeAsync(4000);
    expect(worker.terminated).toBe(false);
    cancelRun();
    expect((await resultPromise).status).toBe('cancelled');
  });

  it('classifies a compiler download deadline as an environment failure', async () => {
    const resultPromise = runCode({ code: 'int main(){return 0;}' });
    await vi.advanceTimersByTimeAsync(120_001);
    expect((await resultPromise).status).toBe('environment-error');
    expect(TestWorker.latest.terminated).toBe(true);
  });

  it('classifies a Worker startup failure as an environment failure', async () => {
    const resultPromise = runCode({ code: 'int main(){return 0;}' });
    TestWorker.latest.onerror?.({ preventDefault() {}, message: 'Worker blocked' } as ErrorEvent);
    const result = await resultPromise;
    expect(result.status).toBe('environment-error');
    expect(result.stderr).toContain('Worker blocked');
  });

  it('keeps partial output when a user cancels', async () => {
    const onOutput = vi.fn();
    const resultPromise = runCode({ code: 'int main(){return 0;}', onOutput });
    const worker = TestWorker.latest;
    worker.emit({ type: 'output', channel: 'stdout', output: 'started\n' } as Omit<ExecutorMessage, 'id'>);
    cancelRun();
    expect((await resultPromise).stdout).toBe('started\n');
    expect(onOutput).toHaveBeenCalledWith('started\n', 'stdout');
  });

  it('cancels the earlier run when a new run starts', async () => {
    const previous = runCode({ code: 'int main(){while(1){}}' });
    const next = runCode({ code: 'int main(){return 0;}' });
    expect((await previous).status).toBe('cancelled');
    cancelRun();
    expect((await next).status).toBe('cancelled');
  });
});
