import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, BookOpen, Check, ChevronRight, Code2, Compass, Flame, GraduationCap, LayoutDashboard, Leaf, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Sprout, Target, Terminal, Trophy, WifiOff, X } from 'lucide-react'
import { useUI, type Page } from './stores/ui'
import { lessons } from './data/curriculum'
import { createEmptySnapshot, getLearningStats, type LearningSnapshot } from './services/learning'
import { initDatabase, readSnapshot, resetDatabase, saveSnapshot } from './services/database'
import Courses from './pages/Courses'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import Lab from './pages/Lab'

const navigation = [
  { id: 'dashboard' as Page, icon: LayoutDashboard, label: '学习首页' },
  { id: 'courses' as Page, icon: BookOpen, label: '课程中心' },
  { id: 'lab' as Page, icon: Terminal, label: '代码实验室' },
  { id: 'progress' as Page, icon: GraduationCap, label: '学习档案' },
  { id: 'settings' as Page, icon: SettingsIcon, label: '偏好设置' },
]

export default function App() {
  const { page, setPage, startLesson, lessonId } = useUI()
  const [snapshot, setSnapshot] = useState<LearningSnapshot>(createEmptySnapshot)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [saved, setSaved] = useState(true)
  const [query, setQuery] = useState('')
  const [notifications, setNotifications] = useState(false)
  const saveGeneration = useRef(0)
  const stats = getLearningStats(snapshot)
  const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  useEffect(() => {
    let mounted = true
    initDatabase().then(readSnapshot).then((data) => {
      if (mounted) { if (data) setSnapshot(data); setReady(true) }
    }).catch(() => { if (mounted) setStorageError('学习数据库加载失败。请检查浏览器是否允许本地存储，刷新后重试。') })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!ready) return
    const generation = ++saveGeneration.current
    setSaved(false)
    const timer = setTimeout(() => {
      saveSnapshot(snapshot).then(() => { if (generation === saveGeneration.current) { setSaved(true); setStorageError('') } })
        .catch(() => setStorageError('学习记录保存失败，请导出已有数据库并检查存储空间。'))
    }, 350)
    return () => clearTimeout(timer)
  }, [snapshot, ready])

  const reset = async () => {
    ++saveGeneration.current
    await resetDatabase()
    setSnapshot(createEmptySnapshot())
  }

  const currentNavigation = navigation.find((item) => item.id === page)!
  const searchResults = query.trim() ? lessons.filter((item) => `${item.title}${item.module}${item.description}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : []

  return <div className={`app-shell ${page === 'lab' ? 'lab-shell' : ''}`}>
    <a className="skip-link" href="#main-content">跳到主内容</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('dashboard')} aria-label="CodeGrow 首页"><span className="brand-icon"><Code2 size={24} /></span><span>Code<span className="green">Grow</span><small>YOUR CODING JOURNEY</small></span></button>
      <div className="nav-section-label">学习工作台</div>
      <nav aria-label="主导航">{navigation.map(({ id, icon: Icon, label }) => <button key={id} title={label} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><Icon size={19} /><span>{label}</span>{page === id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="growth-note"><Sprout size={23} /><strong>每天一点，成长可见</strong><p>你的下一行代码，<br />就是一个新的开始。</p><button onClick={() => setPage('progress')}>查看我的成长 <ArrowRight size={14} /></button></div>
      <div className="profile"><span className="avatar">C</span><div><strong>编程新学员</strong><small>Lv. {Math.floor(stats.completedLessons / 3) + 1} · {stats.completedLessons ? '持续成长中' : '探索者'}</small></div><Leaf size={17} className="green" /></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><Compass size={17} /><span>工作台</span><ChevronRight size={14} /><strong>{currentNavigation.label}</strong></div>
      <div className="topbar-actions"><div className="search-box"><Search size={16} /><input aria-label="搜索课程" placeholder="搜索课程、知识点…" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button aria-label="关闭搜索" onClick={() => setQuery('')}><X size={14} /></button> : <kbd>/</kbd>}
        {query && <div className="search-results">{searchResults.length ? searchResults.map((item) => <button key={item.id} onClick={() => { startLesson(item.id); setQuery('') }}><BookOpen size={15} /><span>{item.title}</span><ArrowRight size={14} /></button>) : <p>暂无匹配课程，试试“循环”或“变量”。</p>}</div>}</div>
        <span className="local-status"><span className="status-dot" />本地优先</span><button className="icon-button notification-button" aria-label="学习提醒" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={18} /></button><span className="avatar avatar-small">C</span>
      </div>{notifications && <div className="notification-popover"><strong>学习提醒</strong><p>今天花 20 分钟，完成一节微课和一次独立练习。</p><p className="muted">{stats.completedLessons ? `你已经完成 ${stats.completedLessons} 节课程，继续保持。` : '第一步：运行你的 Hello World。'}</p><button className="secondary-button" onClick={() => { setPage('courses'); setNotifications(false) }}>选择课程 <ArrowRight size={14} /></button></div>}</header>
      {storageError && <div role="alert" className="storage-banner"><WifiOff size={17} />{storageError}<button onClick={() => location.reload()}>重新加载</button></div>}
      <main id="main-content" className={`main-content ${page === 'lab' ? 'lab-main' : ''}`}>
        {!ready && !storageError ? <div className="loading-screen"><Sprout size={35} /><p>正在准备你的学习工作台…</p></div> : <>
          {page === 'dashboard' && <Dashboard snapshot={snapshot} today={today} onStart={startLesson} setPage={setPage} />}
          {page === 'courses' && <Courses completed={snapshot.completedIds} onStart={startLesson} />}
          {page === 'lab' && <Lab key={lessonId} lessonId={lessonId} snapshot={snapshot} onUpdate={setSnapshot} saved={saved} />}
          {page === 'progress' && <Progress snapshot={snapshot} />}
          {page === 'settings' && <Settings onReset={reset} />}
        </>}
      </main><footer className="statusbar"><span><ShieldCheck size={13} />学习记录保存在此浏览器</span><span>{saved ? <Check size={13} /> : <span className="status-dot" />}{saved ? '已保存到本地 SQLite' : '正在保存…'}<span className="status-divider">|</span>CodeGrow v0.1</span></footer>
    </div>
  </div>
}

function Dashboard({ snapshot, today, onStart, setPage }: { snapshot: LearningSnapshot; today: string; onStart: (id: string) => void; setPage: (page: Page) => void }) {
  const stats = getLearningStats(snapshot)
  const next = lessons.find((lesson) => !snapshot.completedIds.includes(lesson.id)) || lessons[0]
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index))
    const attempts = snapshot.attempts.filter((item) => new Date(item.createdAt).toDateString() === date.toDateString()).length
    return { label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()], attempts }
  })
  return <div className="dashboard page-enter"><div className="page-header"><div><div className="eyebrow"><span className="status-dot" />{today}</div><h1>你好，未来的开发者 <span className="wave">✦</span></h1><p className="muted">每一小步，都在让你更接近独立写代码。</p></div><span className="streak-badge"><Flame size={16} />连续学习 {stats.streakDays} 天</span></div>
    <section className="hero-card"><div className="hero-copy"><span className="hero-label"><Sparkles size={14} /> YOUR PERSONAL CODING MENTOR</span><h2>把好奇心，<br />写成<span>第一行代码。</span></h2><p>CodeGrow，不替你写代码，<br className="mobile-break" />而是培养你成为程序员。</p><button className="primary-button" onClick={() => onStart(next.id)}>开始今日学习 <ArrowRight size={17} /></button><span className="hero-meta">从零开始 · 循序渐进 · 每天 20 分钟</span></div>
      <div className="hero-visual" aria-hidden="true"><div className="code-window"><div className="code-window-title"><span /><span /><span /><small>hello_growth.c</small><Code2 size={14} /></div><pre><span className="syntax-purple">#include</span> <span className="syntax-green">&lt;stdio.h&gt;</span>{'\n\n'}<span className="syntax-blue">int</span> main() {'{'}{'\n'}  <span className="syntax-muted">// 从你的第一行代码开始</span>{'\n'}  <span className="syntax-yellow">printf</span>(<span className="syntax-green">"Hello, future me!"</span>);{'\n'}  <span className="syntax-purple">return</span> <span className="syntax-orange">0</span>;{'\n'}{'}'}</pre><div className="code-window-output"><Check size={14} /><span>Hello, future me!</span><small>exit 0</small></div></div><div className="growth-pill"><span><Sprout size={22} /></span><div><strong>一次尝试，一点成长</strong><small>你的故事，从这里开始</small></div></div><span className="visual-plus">+</span><span className="visual-star">✧</span></div>
    </section>
    <div className="stat-grid dashboard-stats"><Stat icon={<Target size={21} />} label="已完成课程" value={`${stats.completedLessons}`} suffix="节" note={`共 ${lessons.length} 节基础微课`} /><Stat icon={<Terminal size={21} />} label="代码练习" value={`${stats.attempts}`} suffix="次" note="每次运行都留下成长证据" /><Stat icon={<Trophy size={21} />} label="独立完成率" value={stats.attempts ? `${stats.independentRate}` : '—'} suffix={stats.attempts ? '%' : ''} note="不使用提示的练习比例" /><Stat icon={<Flame size={21} />} label="学习时间" value={`${stats.studyMinutes}`} suffix="分钟" note="只统计活跃练习时间" /></div>
    <div className="dashboard-grid"><section className="panel today-panel"><div className="panel-header"><div><h2>今日学习计划</h2><p className="muted">从一个小目标，开始今天的成长</p></div><span className="tag">约 20 分钟</span></div><div className="task-highlight"><span className="task-icon"><BookOpen size={24} /></span><div><span className="eyebrow">当前推荐 · C 语言入门</span><h3>{next.title}</h3><p>{next.description}</p></div><span className="tag tag-green">进行中</span></div>
        <div className="task-list"><button onClick={() => setPage('courses')}><span className="task-number">01</span><div><strong>理解一个新概念</strong><small>阅读微课，回答思考问题</small></div><span className="task-duration">5 分钟</span><ChevronRight size={16} /></button><button onClick={() => onStart(next.id)}><span className="task-number">02</span><div><strong>亲手写一段代码</strong><small>先独立尝试，再向导师提问</small></div><span className="task-duration">10 分钟</span><ChevronRight size={16} /></button><button onClick={() => setPage('progress')}><span className="task-number">03</span><div><strong>回顾今天的成长</strong><small>看看练习记录与知识薄弱点</small></div><span className="task-duration">5 分钟</span><ChevronRight size={16} /></button></div>
        <div className="mentor-tip"><Sparkles size={17} /><p><strong>导师的小建议</strong>遇到错误是学习的一部分。先读懂错误，再试着改一处。</p></div></section>
      <section className="panel activity-panel"><div className="panel-header"><div><h2>一点点，走得更远</h2><p className="muted">最近 7 天的练习记录</p></div><Flame size={20} className="green" /></div><div className="activity-chart">{week.map((day, index) => <div key={index}><span className="bar-value">{day.attempts || ''}</span><div className={`activity-bar ${day.attempts ? 'has-activity' : ''}`} style={{ height: `${Math.max(8, Math.min(110, day.attempts * 22))}px` }} title={`${day.attempts} 次练习`} /><span className={index === 6 ? 'green' : ''}>{day.label}</span></div>)}</div><div className="activity-summary"><span><span className="status-dot" />真实运行记录</span><strong>{stats.attempts ? '继续保持你的节奏' : '今天，就是最好的开始'}</strong></div><div className="independence-note"><ShieldCheck size={18} /><div><strong>学会思考，比获得答案更重要</strong><p>导师提供分级提示，你来完成最后一步。</p></div></div></section></div>
    <section className="learning-path"><div className="section-heading"><div><h2>你的成长路线</h2><p className="muted">从第一行代码，到第一个真实项目</p></div><button className="text-button" onClick={() => setPage('courses')}>探索全部课程 <ArrowRight size={15} /></button></div><div className="path-grid">{[{ name: '编程起步', desc: '变量 · 数据类型 · 输入输出', icon: Code2, number: '01', id: 'hello-world', color: 'green' }, { name: '让程序做决定', desc: '条件判断 · for / while 循环', icon: Target, number: '02', id: 'conditions', color: 'blue' }, { name: '组织你的代码', desc: '数组 · 函数 · 模块化思考', icon: BookOpen, number: '03', id: 'arrays', color: 'purple' }].map(({ name, desc, icon: Icon, number, id, color }) => <button className="path-card" key={id} onClick={() => onStart(id)}><span className={`path-icon ${color}`}><Icon size={23} /></span><span className="path-step">STEP {number}</span><h3>{name}</h3><p>{desc}</p><span className="path-link">进入学习 <ArrowRight size={14} /></span></button>)}</div></section>
  </div>
}

function Stat({ icon, label, value, suffix, note }: { icon: React.ReactNode; label: string; value: string; suffix: string; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}<small>{suffix}</small></div><p>{note}</p></div>
}
