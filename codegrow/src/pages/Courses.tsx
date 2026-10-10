import { useState } from 'react'
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, Clock3, Code2, Flag, LockKeyhole, Sparkles } from 'lucide-react'
import { lessons, modules } from '../data/curriculum'

interface CoursesProps {
  onStart: (lessonId: string) => void
  completed: string[]
}

export default function Courses({ onStart, completed }: CoursesProps) {
  const initialLesson = lessons.find((lesson) => !completed.includes(lesson.id)) ?? lessons[0]
  const [selectedId, setSelectedId] = useState(initialLesson.id)
  const [selectedModule, setSelectedModule] = useState(initialLesson.module)
  const [expanded, setExpanded] = useState<string[]>([initialLesson.module])
  const selected = lessons.find((lesson) => lesson.id === selectedId)
  const currentModule = modules.find((module) => module.id === selectedModule)
  const currentLessons = lessons.filter((lesson) => lesson.module === selectedModule)
  const progress = lessons.filter((lesson) => completed.includes(lesson.id)).length
  const isUpcoming = currentLessons.length === 0

  function selectModule(moduleId: string) {
    setSelectedModule(moduleId)
    const first = lessons.find((lesson) => lesson.module === moduleId)
    if (first) setSelectedId(first.id)
    setExpanded((previous) => previous.includes(moduleId) ? previous.filter((id) => id !== moduleId) : [...previous, moduleId])
  }

  return (
    <div className="courses-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">LEARNING PATH</span>
          <h1>每一小步，都算数<span className="accent-text">。</span></h1>
          <p className="muted">从第一行代码出发，把知识变成真正属于你的能力。</p>
        </div>
        <div className="course-header-badge"><BookOpen size={16} /><span>C 语言成长路线</span></div>
      </header>

      <section className="course-overview panel" aria-label="课程进度">
        <div className="course-overview-icon"><Code2 size={25} /></div>
        <div className="course-overview-copy">
          <span className="eyebrow">BUILD YOUR FOUNDATION</span>
          <h2>先理解，再动手。</h2>
          <p className="muted">9 节微课 · 真实编译练习 · 由你掌握学习节奏</p>
        </div>
        <div className="course-overview-progress">
          <div><span>已完成</span><strong>{progress}<span> / {lessons.length}</span></strong></div>
          <progress value={progress} max={lessons.length} aria-label="课程完成度" />
          <span className="muted">{progress === lessons.length ? '基础路线已完成，继续练习巩固知识。' : '完成练习后，进度会自动保存。'}</span>
        </div>
      </section>

      <div className="courses-layout">
        <aside className="course-tree panel" aria-label="C 语言课程目录">
          <div className="course-tree-heading"><h2>课程目录</h2><span className="muted">11 个模块</span></div>
          <div className="course-tree-list">
            {modules.map((module, index) => {
              const children = lessons.filter((lesson) => lesson.module === module.id)
              const isExpanded = expanded.includes(module.id)
              const isDone = children.length > 0 && children.every((lesson) => completed.includes(lesson.id))
              return (
                <div className="course-module" key={module.id}>
                  <button className={`course-module-button ${selectedModule === module.id ? 'active' : ''}`} onClick={() => selectModule(module.id)} aria-expanded={isExpanded && children.length > 0}>
                    <span className={`course-module-number ${isDone ? 'done' : ''}`}>{isDone ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span>
                    <span>{module.title}</span>
                    {children.length > 0 ? (isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className="course-soon-label">后续</span>}
                  </button>
                  {isExpanded && children.length > 0 && <div className="course-lesson-list">
                    {children.map((lesson) => <button key={lesson.id} onClick={() => { setSelectedId(lesson.id); setSelectedModule(lesson.module) }} className={`course-lesson-button ${selectedId === lesson.id && selectedModule === lesson.module ? 'active' : ''}`} aria-current={selectedId === lesson.id && selectedModule === lesson.module ? 'true' : undefined}>
                      {completed.includes(lesson.id) ? <Check size={13} /> : <span className="course-lesson-dot" />}
                      <span>{lesson.title}</span>
                    </button>)}
                  </div>}
                </div>
              )
            })}
          </div>
          <div className="course-tree-note"><Sparkles size={16} /><p>不必一口气学完。理解一个概念，独立解决一个问题，就是进步。</p></div>
        </aside>

        {isUpcoming ? (
          <section className="course-detail panel course-upcoming">
            <div className="course-upcoming-icon"><LockKeyhole size={30} /></div>
            <span className="eyebrow">NEXT CHAPTER</span>
            <h2>{currentModule?.title}</h2>
            <p className="muted">{currentModule?.description}。这个进阶模块将在后续版本加入。</p>
            <p className="muted">先完成基础微课，掌握循环、数组与函数，为这段旅程打好基础。</p>
            <button className="primary-button" onClick={() => { setSelectedModule('basics'); setSelectedId('hello-world'); setExpanded((ids) => ids.includes('basics') ? ids : [...ids, 'basics']) }}>返回基础课程 <ArrowRight size={16} /></button>
          </section>
        ) : selected && (
          <article className="course-detail panel">
            <div className="course-detail-topline"><span className="course-tag">{currentModule?.title}</span>{completed.includes(selected.id) && <span className="course-completed-label"><Check size={14} />已完成</span>}</div>
            <h2>{selected.title}</h2>
            <p className="course-description muted">{selected.description}</p>
            <div className="course-metadata"><span><Clock3 size={14} />约 {selected.duration} 分钟</span><span><Flag size={14} />{selected.difficulty === 1 ? '入门' : selected.difficulty === 2 ? '基础' : '进阶基础'}</span><span><Code2 size={14} />{selected.concept}</span></div>

            <section className="course-objectives"><h3>这一节，你会学到</h3><div>{selected.objectives.map((objective) => <p key={objective}><span className="course-objective-check"><Check size={12} /></span>{objective}</p>)}</div></section>

            <section className="course-explanation"><h3><BookOpen size={16} />先花几分钟理解</h3>{selected.explanation.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>

            <div className="course-example"><div><span>看一个小例子</span><span>C</span></div><pre><code>{selected.example}</code></pre></div>

            <div className="course-practice-callout"><div><span className="course-practice-icon"><Code2 size={18} /></span><div><h3>轮到你动手了</h3><p className="muted">带着理解进入实验室，让一次尝试成为你的学习证据。</p></div></div><button className="primary-button" onClick={() => onStart(selected.id)}>{completed.includes(selected.id) ? '再练习一次' : '开始练习'}<ArrowRight size={16} /></button></div>
          </article>
        )}
      </div>
    </div>
  )
}
