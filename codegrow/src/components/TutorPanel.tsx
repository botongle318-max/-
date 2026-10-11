import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { ArrowUpRight, LoaderCircle, MessageSquarePlus, Send, Sparkles, Square, X } from 'lucide-react'
import { clearTutorChat, getTutorMessages, recordTutorExchange, type ChatMessage, type LearningSnapshot } from '../services/learning'
import { getTutorProvider, getTutorReply, hasTutorEndpoint } from '../services/tutor'
import { getLocalTutorState, subscribeLocalTutor } from '../services/localTutor'
import { useUI } from '../stores/ui'
import ModelLauncher from './ModelLauncher'
import '../tutor.css'

const CHAT_ID = 'private-mentor'

export default function TutorPanel({ lessonTitle, code, lastError, output, snapshot, onUpdate, visible, onClose }: {
  lessonTitle: string; code: string; lastError?: string; output?: string; snapshot: LearningSnapshot
  onUpdate: Dispatch<SetStateAction<LearningSnapshot>>; visible: boolean; onClose: () => void
}) {
  const modelState = useSyncExternalStore(subscribeLocalTutor, getLocalTutorState, getLocalTutorState)
  const [provider, setProvider] = useState(getTutorProvider)
  const [remoteConfigured, setRemoteConfigured] = useState(hasTutorEndpoint)
  const [remoteConnected, setRemoteConnected] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<{ user: ChatMessage; reply: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const mounted = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const setPage = useUI(state => state.setPage)
  const messages = getTutorMessages(snapshot, CHAT_ID)
  const ready = provider === 'local' ? modelState.status === 'ready' : remoteConfigured
  const localActive = modelState.status === 'ready' || modelState.status === 'generating'

  useEffect(() => {
    mounted.current = true
    const changed = () => { setProvider(getTutorProvider()); setRemoteConfigured(hasTutorEndpoint()); setRemoteConnected(false) }
    window.addEventListener('codegrow-settings-changed', changed)
    return () => { mounted.current = false; abort.current?.abort(); window.removeEventListener('codegrow-settings-changed', changed) }
  }, [])
  useEffect(() => {
    const element = scroll.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, pending?.reply, pending?.user.id])

  async function send() {
    const question = input.trim()
    if (!question || pending || !ready || abort.current) return
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question, createdAt: new Date().toISOString() }
    const controller = new AbortController()
    abort.current = controller
    setPending({ user, reply: '' }); setInput(''); setNotice(''); setConfirmClear(false)
    try {
      const reply = await getTutorReply({ message: question, code, lessonTitle,
        history: messages.map(({ role, content }) => ({ role, content })),
        ...(lastError ? { lastError: lastError.slice(0, 4000) } : {}), ...(output ? { output: output.slice(0, 4000) } : {}),
      }, controller.signal, content => { if (mounted.current && !controller.signal.aborted) setPending({ user, reply: content }) })
      if (!mounted.current || controller.signal.aborted) return
      const assistant: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply.content, source: reply.source, createdAt: new Date().toISOString() }
      onUpdate(current => recordTutorExchange(current, CHAT_ID, user, assistant))
      if (reply.source === 'ai') setRemoteConnected(true)
    } catch (caught) {
      if (mounted.current) {
        setInput(question)
        setNotice(controller.signal.aborted ? '已停止本次回复。未完成的对话不会保存，可以修改问题后重新发送。' : `导师暂未回复：${caught instanceof Error ? caught.message : '请检查配置后重试。'}`)
      }
    } finally {
      if (mounted.current) setPending(null)
      if (abort.current === controller) abort.current = null
    }
  }

  const status = provider === 'local' ? (localActive ? (pending ? '本地 AI 正在回答' : '本地 AI 已就绪') : '本地模型未启动') : (remoteConnected ? '云端 AI 已连接' : '云端AI待连接')
  return <section className={`tutor-panel conversational-tutor panel ${visible ? 'mobile-visible' : ''}`}>
    <div className="tutor-header"><span className="tutor-avatar"><Sparkles size={19} /></span><div><strong>CodeGrow · AI 私人导师</strong><small><span className={`status-dot ${!localActive && provider === 'local' ? 'inactive-dot' : ''}`} />{status}</small></div><button className="icon-button tutor-close" aria-label="关闭导师窗口" onClick={onClose}><X size={16} /></button></div>
    <div className="tutor-context"><span>正在学习 · {lessonTitle}</span><button className="icon-button" aria-label="开始新对话" title="开始新对话" disabled={!messages.length || !!pending} onClick={() => setConfirmClear(true)}><MessageSquarePlus size={16} /></button></div>
    {confirmClear && <div className="chat-clear-confirm"><p>清除已保存的导师对话，开始新对话？课程和练习记录会保留。</p><button className="secondary-button" onClick={() => setConfirmClear(false)}>取消</button><button className="secondary-button" onClick={() => { onUpdate(current => clearTutorChat(current, CHAT_ID)); setConfirmClear(false); setNotice('') }}>确认清除对话</button></div>}
    <div className="chat-messages" ref={scroll}>
      {!messages.length && <div className="tutor-welcome"><span><Sparkles size={23} /></span><h3>你的问题，就是我们的起点。</h3><p>可以问概念、聊思路，或者一起看代码。导师会先回答你的问题，再给出建议，陪你一步一步往前走。</p><small>不是固定提示卡片。真实回复需要先启动模型或连接代理。</small></div>}
      {provider === 'local' && !localActive && <ModelLauncher />}
      {provider === 'remote' && !remoteConfigured && <div className="tutor-connect"><p>填写你自己的 AI 代理地址后即可对话。没有模型服务？在设置中选择免费的本地 AI。</p><button className="secondary-button" onClick={() => setPage('settings')}>设置导师 <ArrowUpRight size={14} /></button></div>}
      {messages.map(message => <Message key={message.id} message={message} />)}
      {pending && <><Message message={pending.user} />{pending.reply ? <Message message={{ id: 'streaming', role: 'assistant', source: provider === 'local' ? 'local-model' : 'ai', content: pending.reply, createdAt: '' }} /> : <div className="chat-thinking" role="status"><LoaderCircle size={14} className="spin" />导师正在思考你的问题…</div>}</>}
    </div>
    <div className="tutor-controls">
      {notice && <p className="tutor-error" role="alert">{notice}</p>}
      <div className="question-starters">{['解释我的代码', '分析运行问题', '下一步学什么'].map(text => <button key={text} disabled={!!pending} onClick={() => { setInput(text); setNotice('') }}>{text}</button>)}</div>
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send() }}>
        <textarea aria-label="向导师提问" value={input} maxLength={4000} onChange={event => setInput(event.target.value)} placeholder="问你想问的，我们一步一步来…" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
        <div><span>Enter 发送 · Shift Enter 换行</span>{pending ? <button type="button" aria-label="停止导师回复" onClick={() => abort.current?.abort()}><Square size={15} /></button> : <button type="submit" aria-label="发送消息" disabled={!input.trim() || !ready}><Send size={15} /></button>}</div>
      </form>
      <p className="context-note">{provider === 'local' ? '本机推理 · 当前代码和近期对话不上传' : '发送时会将代码、近期对话及运行结果传给代理'}</p>
      {provider === 'local' && localActive && <button className="tutor-settings-link" onClick={() => setPage('settings')}>管理模型与显存</button>}
    </div>
  </section>
}

function Message({ message }: { message: ChatMessage }) {
  return <article className={`chat-message ${message.role === 'assistant' ? 'tutor' : 'user'}`}>
    {message.role === 'assistant' && <span className="message-label"><Sparkles size={12} />{message.source === 'local-model' ? '本地 AI 私人导师' : 'AI 私人导师'}</span>}
    {message.content.split(/(```[\s\S]*?```)/g).filter(Boolean).map((part, index) => part.startsWith('```') ? <pre key={index} className="chat-code"><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre> : <p key={index}>{part}</p>)}
  </article>
}
