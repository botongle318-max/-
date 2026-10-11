import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowRight, BookOpen, Check, ChevronDown, CircleAlert, Code2, Copy, LoaderCircle, Play, RotateCcw, Sparkles, Square, Terminal } from 'lucide-react'
import { lessons } from '../data/curriculum'
import { recordAttempt, recommendDifficulty, type LearningSnapshot } from '../services/learning'
import { runCode, cancelRun, type RunResult } from '../services/executor'
import TutorPanel from '../components/TutorPanel'

const Editor = lazy(() => import('../components/Editor'))
const conceptMap: Record<string, string> = { basics: 'syntax', variables: 'variables', 'data-types': 'types', 'input-output': 'io', conditions: 'conditions', loops: 'loops', arrays: 'arrays', functions: 'functions' }
const normalize = (value: string) => value.replace(/\r\n/g, '\n').trimEnd()

export default function Lab({ lessonId, snapshot, onUpdate, saved }: {
  lessonId: string; snapshot: LearningSnapshot; onUpdate: Dispatch<SetStateAction<LearningSnapshot>>; saved: boolean
}) {
  const lesson = lessons.find((item) => item.id === lessonId) || lessons[0]
  const conceptId = conceptMap[lesson.module] || lesson.module
  const recommendation = recommendDifficulty(snapshot, conceptId, lesson.difficulty)
  const [code, setCode] = useState(snapshot.drafts[lesson.id] ?? lesson.starterCode)
  const [stdin, setStdin] = useState(lesson.stdin)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [resultInput, setResultInput] = useState('')
  const [resultCode, setResultCode] = useState('')
  const [phase, setPhase] = useState('正在准备编译工具')
  const [tab, setTab] = useState<'output' | 'errors' | 'tests'>('output')
  const [independent, setIndependent] = useState(true)
  const [dialog, setDialog] = useState<'reset' | null>(null)
  const [showTask, setShowTask] = useState(true)
  const [notice, setNotice] = useState('')
  const [chatVisible, setChatVisible] = useState(false)
  const mounted = useRef(true)
  const activeAt = useRef(Date.now())
  const sessionId = useRef(crypto.randomUUID())

  useEffect(() => {
    mounted.current = true
    const id = sessionId.current
    onUpdate((current) => current.sessions.some((session) => session.id === id) ? current : {
      ...current, sessions: [...current.sessions, { id, startedAt: new Date().toISOString(), durationSeconds: 0 }],
    })
    const activity = () => { activeAt.current = Date.now() }
    window.addEventListener('keydown', activity)
    window.addEventListener('pointerdown', activity)
    const timer = setInterval(() => {
      if (!document.hidden && Date.now() - activeAt.current < 60000) {
        onUpdate((current) => ({ ...current, sessions: current.sessions.map((session) => session.id === id ? { ...session, durationSeconds: session.durationSeconds + 15 } : session) }))
      }
    }, 15000)
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('keydown', activity); window.removeEventListener('pointerdown', activity); cancelRun() }
  }, [onUpdate])

  const edit = (value: string) => {
    setCode(value); activeAt.current = Date.now()
    onUpdate((current) => ({ ...current, drafts: { ...current.drafts, [lesson.id]: value } }))
  }

  const run = async () => {
    if (running) return
    setRunning(true); setNotice('首次运行会下载约 58 MB 的编译工具，之后会使用浏览器缓存。'); activeAt.current = Date.now()
    try {
      const executedCode = code
      const executedInput = stdin
      const executedIndependent = independent
      const output = await runCode({ code: executedCode, stdin: executedInput, onPhase: (current) => {
        if (mounted.current) setPhase(({ loading: '正在加载编译工具…', compiling: '正在编译 C 代码…', linking: '正在链接程序…', running: '正在运行程序…' })[current])
      } })
      if (!mounted.current) return
      setResult(output); setResultInput(executedInput); setResultCode(executedCode); setTab(output.status === 'compile-error' || output.status === 'runtime-error' || output.status === 'environment-error' ? 'errors' : 'output')
      if (output.status === 'cancelled') { setNotice('运行已停止。'); return }
      if (output.status === 'environment-error') { setNotice('编译工具暂不可用，请检查网络后重试。本次不会计入学习评估。'); return }
      const passed = output.status === 'success' && normalize(output.stdout) === normalize(lesson.expectedOutput) && executedInput === lesson.stdin
      if (executedInput === lesson.stdin) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${executedCode}\u0000${executedInput}`))
        const fingerprint = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        onUpdate((current) => {
          const next = recordAttempt(current, { exerciseId: lesson.id, conceptId, passed, score: passed ? 100 : 0, independent: executedIndependent, hintLevel: 0, fingerprint,
            errorType: output.status === 'success' ? (passed ? undefined : '输出未通过') : output.status === 'compile-error' ? '编译错误' : output.status === 'timeout' ? '运行超时' : '运行错误' })
          return passed ? { ...next, completedIds: [...new Set([...next.completedIds, lesson.id])] } : next
        })
      }
      setNotice(executedInput !== lesson.stdin ? '自定义输入已运行，本次不计入课程样例评分。' : passed ? '练习通过！结果已记录，可以继续优化或向导师自由提问。' : output.status === 'success' ? '程序运行完成。切换「测试」对照题目要求，也可以直接询问导师。' : '遇到问题了吗？先读第一个错误，也可以把你的疑问直接告诉导师。')
    } catch (error) {
      if (mounted.current) setNotice(`编译工具加载失败：${error instanceof Error ? error.message : '请检查网络后重试'}。学习课程和编辑代码仍然可用。`)
    } finally { if (mounted.current) setRunning(false) }
  }

  const copyOutput = async () => {
    try { await navigator.clipboard.writeText(result?.stdout || ''); setNotice('程序输出已复制。') }
    catch { setNotice('浏览器不允许复制，可在输出区域选择文字复制。') }
  }
  const testPassed = result?.status === 'success' && normalize(result.stdout) === normalize(lesson.expectedOutput) && resultInput === lesson.stdin
  return <div className="lab-page"><div className="lab-heading"><div><div className="eyebrow"><BookOpen size={13} />C 语言 · {lesson.title}</div><h1>代码实验室 <span>在尝试中，找到答案</span></h1></div><div className="lab-heading-actions"><span className="tag">难度 {recommendation.difficulty}/5</span><button className="secondary-button tutor-toggle" onClick={() => setChatVisible(!chatVisible)}><Sparkles size={15} />导师</button><button className="text-button" onClick={() => setShowTask(!showTask)}>{showTask ? '收起任务' : '查看任务'}<ChevronDown size={14} /></button></div></div>
    {showTask && <div className="lab-task"><span className="task-icon"><TargetIcon /></span><div><strong>{lesson.description}</strong><p>{lesson.objectives.join(' · ')}</p></div><span className="tag tag-green">{snapshot.completedIds.includes(lesson.id) ? '已完成 · 可复练' : '亲手实践'}</span></div>}
    <div className="lab-workbench"><section className="editor-panel panel"><div className="editor-toolbar"><span><Code2 size={16} />main.c <small>C</small></span><div><button className="icon-button" title="重置代码" aria-label="重置代码" onClick={() => setDialog('reset')}><RotateCcw size={15} /></button>{running ? <button className="stop-button" onClick={() => cancelRun()}><Square size={13} />停止</button> : <button className="run-button" onClick={() => void run()}><Play size={13} fill="currentColor" />运行 <kbd>Ctrl ↵</kbd></button>}</div></div>
      <div className="editor-body"><Suspense fallback={<div className="editor-loading">正在加载编辑器…</div>}><Editor code={code} onChange={edit} onRun={() => void run()} /></Suspense></div><div className="editor-bottom"><span><span className="status-dot" />{saved ? '草稿已保存' : '保存中'}</span><span>C11 · UTF-8 · WASI</span></div></section>
      <section className="console-panel panel"><div className="console-header"><Terminal size={16} /><strong>运行与测试</strong><button className="icon-button" aria-label="复制程序输出" onClick={() => void copyOutput()}><Copy size={14} /></button></div><div className="console-tabs" role="tablist">{(['output', 'errors', 'tests'] as const).map((key) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{{ output: '输出', errors: '问题', tests: '测试' }[key]}{key === 'errors' && result?.stderr && <span className="error-dot" />}</button>)}</div>
        <div className="console-output" role="tabpanel">{running ? <div className="console-empty"><LoaderCircle size={26} className="spin" /><strong>{phase}</strong><p>首次加载工具需要一些时间。<br />后续运行会使用已缓存的资源。</p></div> : !result ? <div className="console-empty"><Terminal size={28} /><strong>让你的代码说话</strong><p>点击「运行」或按 Ctrl + Enter，<br />在这里查看程序输出。</p><span className="console-shortcut">Ctrl + Enter</span></div> : tab === 'output' ? <><span className={`run-state ${result.status === 'success' ? 'green' : 'warning'}`}>{result.status === 'success' ? <Check size={14} /> : <CircleAlert size={14} />}{({ success: '运行完成', 'compile-error': '编译失败', 'runtime-error': '运行失败', 'environment-error': '工具加载失败', timeout: '运行超时', cancelled: '已停止' })[result.status]}<small>{Math.round(result.durationMs)} ms</small></span><pre>{result.stdout || '（暂无标准输出）'}</pre></> : tab === 'errors' ? <><span className="console-section-label">编译器 / 标准错误</span><pre className={result.stderr ? 'error-output' : 'muted'}>{result.stderr || '没有编译或运行错误。'}</pre></> : <div className="test-result"><span className={`test-status ${testPassed ? 'green' : 'warning'}`}>{testPassed ? <Check size={19} /> : <CircleAlert size={19} />}{testPassed ? '样例测试通过 · 1/1' : resultInput !== lesson.stdin ? '自定义输入 · 未判定' : '样例测试未通过 · 0/1'}</span><p className="muted">MVP 使用样例输出检查；通过样例不代表覆盖全部边界情况。</p><label>预期输出</label><pre>{lesson.expectedOutput}</pre><label>实际输出</label><pre>{result.stdout || '（空）'}</pre>{resultInput !== lesson.stdin && <button className="secondary-button" onClick={() => setStdin(lesson.stdin)}>恢复样例输入</button>}</div>}</div>
        <div className="stdin-panel"><label htmlFor="stdin">标准输入 <small>STDIN</small></label><textarea id="stdin" aria-label="标准输入" placeholder="程序需要输入时，在这里填写…" value={stdin} onChange={(event) => setStdin(event.target.value)} /><label className="independent-check"><span><input type="checkbox" checked={independent} onChange={(event) => setIndependent(event.target.checked)} /> 本次练习由我独立完成</span><small>由你标记</small></label></div><div className="console-footer"><ShieldCheckSmall />在 WebAssembly 中运行</div></section>
      <TutorPanel lessonTitle={lesson.title} code={code} lastError={code === resultCode ? result?.stderr || (result?.status === 'timeout' ? '运行超时' : undefined) : undefined} output={code === resultCode ? result?.stdout : undefined} snapshot={snapshot} onUpdate={onUpdate} visible={chatVisible} onClose={() => setChatVisible(false)} />
    </div>{notice && <div className="lab-notice" role="status"><CircleAlert size={14} /><span>{notice}</span></div>}
    {dialog && <div className="modal-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal"><span className="modal-icon"><RotateCcw size={25} /></span><h2 id="dialog-title">重置当前练习代码？</h2><p>当前草稿将恢复为课时初始代码。学习和错误记录会保留。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>再想一想</button><button className="primary-button" onClick={() => { edit(lesson.starterCode); setDialog(null) }}>确认重置<ArrowRight size={15} /></button></div></div></div>}
  </div>
}

function TargetIcon() { return <Code2 size={22} /> }
function ShieldCheckSmall() { return <Check size={12} /> }
