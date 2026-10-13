import type { ExecutionPreparation } from '../services/executor'

const stageNames: Record<string, string> = {
  loadingMs: '主线程观测：环境准备', compilingMs: '主线程观测：编译', linkingMs: '主线程观测：链接', runningMs: '主线程观测：运行',
  assetsTotalMs: '资源准备（并行总耗时）', fsCloneMs: '隔离文件系统复制', compileMs: 'C 编译与编译器实例化',
  linkMs: '链接与链接器实例化', programCompileMs: '程序 WASM 编译', runMs: '程序实例化与执行',
  workerMs: 'Worker 总耗时', preparationWaitMs: '等待已有准备任务',
}

function stageName(key: string): string {
  if (stageNames[key]) return stageNames[key]
  const match = /^(clang|lld|sysroot\.tar)\.(cacheRead|verifyCache|download|verifyNetwork|cacheWrite|wasm|extract)Ms$/.exec(key)
  const labels: Record<string, string> = { cacheRead: '缓存读取', verifyCache: '缓存 SHA-256', download: '网络下载与读取', verifyNetwork: '下载 SHA-256', cacheWrite: '缓存写入', wasm: 'WASM 编译初始化', extract: '标准库展开' }
  return match ? `${match[1]} · ${labels[match[2]]}` : key
}

export default function CompilerDiagnostics({ events, timings }: { events: ExecutionPreparation[]; timings?: Record<string, number> }) {
  if (!events.length && !timings) return null
  const warnings = [...new Set(events.flatMap(event => event.warning ? [event.warning] : []))]
  return <details className="compiler-diagnostics">
    <summary>本次编译环境与性能诊断{warnings.length > 0 ? ` · ${warnings.length} 项缓存提醒` : ''}</summary>
    {warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}
    <ul>{events.map((event, index) => <li key={index}>{event.message}{event.durationMs !== undefined && <small> · {Math.round(event.durationMs)} ms</small>}</li>)}</ul>
    {timings && <dl>{Object.entries(timings).map(([stage, time]) => <div key={stage}><dt>{stageName(stage)}</dt><dd>{Math.round(time)} ms</dd></div>)}</dl>}
    <p>资源与 Worker 子阶段为内部计时，主线程另记录消息观测耗时；并行阶段与总耗时有重叠，不能相加。缓存读取后仍需校验与 WASM 初始化；取消或超时会销毁 Worker，下次从浏览器缓存恢复。不会删除学习数据库。</p>
  </details>
}
