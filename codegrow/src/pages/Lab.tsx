import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowRight, BookOpen, Check, ChevronDown, CircleAlert, Clock3, Code2, Copy, CornerDownLeft, Lightbulb, LoaderCircle, Play, RotateCcw, Send, Sparkles, Square, Terminal, X } from 'lucide-react'
import { lessons } from '../data/curriculum'
import { recordAttempt, recordHint, recommendDifficulty, type HintLevel, type LearningSnapshot } from '../services/learning'
import { runCode, cancelRun, type RunResult } from '../services/executor'
import { getTutorReply, wantsReference, type TutorMode } from '../services/tutor'

const Editor = lazy(() => import('../components/Editor'))
const modeNames: Record<TutorMode, string> = { guide: '引导模式', practice: '陪练模式', challenge: '挑战模式', debug: '纠错模式' }
const conceptMap: Record<string, string> = { basics: 'syntax', variables: 'variables', 'data-types': 'types', 'input-output': 'io', conditions: 'conditions', loops: 'loops', arrays: 'arrays', functions: 'functions' }
const normalize = (value: string) => value.replace(/\r\n/g, '\n').trimEnd()
type Message = { id: string; role: 'user' | 'tutor'; content: string; source?: 'local' | 'ai' }

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
  const [phase, setPhase] = useState('正在准备编译工具')
  const [tab, setTab] = useState<'output' | 'errors' | 'tests'>('output')
  const [hintLevel, setHintLevel] = useState<0 | HintLevel>(0)
  const [mode, setMode] = useState<TutorMode>(recommendation.mode)
  const [messages, setMessages] = useState<Message[]>([{ id: 'welcome', role: 'tutor', source: 'local', content: `欢迎来到「${lesson.title}」。\n\n${lesson.description}\n\n先用自己的话想一想要怎么做，再写代码。我会一步一步引导你。\n\n当前使用本地引导导师；在设置中接入服务后可使用真实 AI。` }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [dialog, setDialog] = useState<'reference' | 'reset' | null>(null)
  const [showTask, setShowTask] = useState(true)
  const [notice, setNotice] = useState('')
  const [lastSource, setLastSource] = useState<'local' | 'ai'>('local')
  const [chatVisible, setChatVisible] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const chatEnd = useRef<HTMLDivElement>(null)
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
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('keydown', activity); window.removeEventListener('pointerdown', activity); cancelRun(); abort.current?.abort() }
  }, [onUpdate])

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, sending])

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
      const usedHintLevel = hintLevel
      const output = await runCode({ code: executedCode, stdin: executedInput, onPhase: (current) => {
        if (mounted.current) setPhase(({ loading: '正在加载编译工具…', compiling: '正在编译 C 代码…', linking: '正在链接程序…', running: '正在运行程序…' })[current])
      } })
      if (!mounted.current) return
      setResult(output); setResultInput(executedInput); setTab(output.status === 'compile-error' || output.status === 'runtime-error' || output.status === 'environment-error' ? 'errors' : 'output')
      if (output.status === 'cancelled') { setNotice('运行已停止。'); return }
      if (output.status === 'environment-error') { setNotice('编译工具暂不可用，请检查网络后重试。本次不会计入学习评估。'); return }
      const passed = output.status === 'success' && normalize(output.stdout) === normalize(lesson.expectedOutput) && executedInput === lesson.stdin
      if (executedInput === lesson.stdin) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${executedCode}\u0000${executedInput}`))
        const fingerprint = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        onUpdate((current) => {
          const next = recordAttempt(current, { exerciseId: lesson.id, conceptId, passed, score: passed ? 100 : 0, independent: usedHintLevel === 0, hintLevel: usedHintLevel, fingerprint,
            errorType: output.status === 'success' ? (passed ? undefined : '输出未通过') : output.status === 'compile-error' ? '编译错误' : output.status === 'timeout' ? '运行超时' : '运行错误' })
          return passed ? { ...next, completedIds: [...new Set([...next.completedIds, lesson.id])] } : next
        })
      }
      setNotice(executedInput !== lesson.stdin ? '自定义输入已运行，本次不计入课程样例评分。' : passed ? (usedHintLevel === 4 ? '参考辅助完成！尝试不看提示再做一次，巩固理解。' : '练习通过！你又向独立编程迈进了一步。') : output.status === 'success' ? '程序运行完成。切换「测试」对照题目要求。' : '遇到问题了吗？先读第一个错误，也可以让导师给一个提示。')
    } catch (error) {
      if (mounted.current) setNotice(`编译工具加载失败：${error instanceof Error ? error.message : '请检查网络后重试'}。学习课程和编辑代码仍然可用。`)
    } finally { if (mounted.current) setRunning(false) }
  }

  const send = async (text: string, requestedLevel = Math.max(1, hintLevel), permitReference = false) => {
    if (!text.trim() || sending) return
    const directReference = wantsReference(text)
    const level = (directReference || permitReference ? 4 : requestedLevel) as HintLevel
    setInput(''); setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: text }]); setSending(true)
    abort.current = new AbortController()
    try {
      const reply = await getTutorReply({ message: text, code, lessonTitle: lesson.title, hintLevel: level, mode, hints: lesson.hints, lastError: result?.stderr || (result?.status === 'timeout' ? '运行超时' : undefined), permitReference: permitReference || directReference }, abort.current.signal)
      if (mounted.current) {
        setHintLevel(Math.max(hintLevel, level) as HintLevel)
        onUpdate((current) => recordHint(current, { exerciseId: lesson.id, level }))
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'tutor', content: reply.content, source: reply.source }]); setLastSource(reply.source)
      }
    } catch (error) {
      if (mounted.current) setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'tutor', source: 'local', content: error instanceof DOMException && error.name === 'AbortError' ? '已停止本次回复。你可以重新提问。' : `导师回复失败：${error instanceof Error ? error.message : '请稍后重试'}` }])
    } finally { if (mounted.current) setSending(false) }
  }

  const requestHint = () => {
    if (hintLevel >= 3) setDialog('reference')
    else void send(`请给我 L${hintLevel + 1} 提示，帮助我独立思考下一步。`, hintLevel + 1)
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
        <div className="stdin-panel"><label htmlFor="stdin">标准输入 <small>STDIN</small></label><textarea id="stdin" aria-label="标准输入" placeholder="程序需要输入时，在这里填写…" value={stdin} onChange={(event) => setStdin(event.target.value)} /></div><div className="console-footer"><ShieldCheckSmall />在 WebAssembly 中运行</div></section>
      <section className={`tutor-panel panel ${chatVisible ? 'mobile-visible' : ''}`}><div className="tutor-header"><span className="tutor-avatar"><Sparkles size={19} /></span><div><strong>CodeGrow 导师</strong><small><span className="status-dot" />{lastSource === 'ai' ? 'AI 服务已连接' : '本地引导 · 无需联网'}</small></div><button className="icon-button tutor-close" aria-label="关闭导师窗口" onClick={() => setChatVisible(false)}><X size={16} /></button></div><div className="mode-selector"><label htmlFor="mode">教学模式</label><select id="mode" value={mode} onChange={(event) => setMode(event.target.value as TutorMode)}>{Object.entries(modeNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
        <div className="hint-progress"><span>提示等级</span><div>{[1, 2, 3, 4].map((level) => <span key={level} className={hintLevel >= level ? 'active' : ''}>L{level}</span>)}</div><small>{hintLevel === 0 ? '先独立尝试' : ['', '思路提示', '问题范围', '知识解释', '参考辅助'][hintLevel]}</small></div>
        <div className="chat-messages" aria-live="polite">{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}>{message.role === 'tutor' && <span className="message-label"><Sparkles size={12} />{message.source === 'ai' ? 'AI 私人导师' : '本地练习导师'}</span>}<ChatContent content={message.content} /></article>)}{sending && <div className="chat-thinking"><LoaderCircle size={14} className="spin" />导师正在组织提示…</div>}<div ref={chatEnd} /></div>
        <div className="tutor-controls"><button className="hint-button" disabled={sending} onClick={requestHint}><Lightbulb size={15} />{hintLevel >= 3 ? '请求参考片段' : '给我下一级提示'}<ArrowRight size={14} /></button><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(input) }}><textarea aria-label="向导师提问" value={input} onChange={(event) => setInput(event.target.value)} placeholder="说说你的思路，或问一个问题…" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input) } }} /><div><span>Enter 发送 · Shift Enter 换行</span>{sending ? <button type="button" aria-label="停止导师回复" onClick={() => abort.current?.abort()}><Square size={15} /></button> : <button type="submit" aria-label="发送消息" disabled={!input.trim()}><Send size={15} /></button>}</div></form><p className="context-note">{localStorage.getItem('codegrow-ai-endpoint') ? '发送时包含当前代码、题目和编译错误。' : '本地模式：代码不会发送到任何 AI 服务。'}</p></div></section>
    </div>{notice && <div className="lab-notice" role="status"><CircleAlert size={14} /><span>{notice}</span></div>}
    {dialog && <div className="modal-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal"><span className="modal-icon">{dialog === 'reference' ? <Lightbulb size={25} /> : <RotateCcw size={25} />}</span><h2 id="dialog-title">{dialog === 'reference' ? '准备好看参考片段了吗？' : '重置当前练习代码？'}</h2><p>{dialog === 'reference' ? '参考片段可以帮助你理解原理。这次练习会标记为辅助完成；建议之后关掉提示，独立再写一次。' : '当前草稿将恢复为课时初始代码。学习和错误记录会保留。'}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>再想一想</button><button className="primary-button" onClick={() => { if (dialog === 'reference') void send('我想主动查看 L4 参考代码，并理解它的原理。', 4, true); else edit(lesson.starterCode); setDialog(null) }}>{dialog === 'reference' ? '查看参考片段' : '确认重置'}<ArrowRight size={15} /></button></div></div></div>}
  </div>
}

function ChatContent({ content }: { content: string }) {
  return <>{content.split(/(```[\s\S]*?```)/g).filter(Boolean).map((part, index) => part.startsWith('```') ? <pre key={index} className="chat-code"><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre> : <p key={index}>{part}</p>)}</>
}
function TargetIcon() { return <Code2 size={22} /> }
function ShieldCheckSmall() { return <Check size={12} /> }
