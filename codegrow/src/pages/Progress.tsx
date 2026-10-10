import {
  Activity, ArrowUpRight, BookOpen, CheckCircle2, Clock3, Flame,
  Lightbulb, ShieldCheck, Sparkles, Target, TrendingUp,
} from 'lucide-react'
import { CONCEPTS, getLearningStats, recommendDifficulty, type LearningSnapshot } from '../services/learning'

interface ProgressProps {
  snapshot: LearningSnapshot
}

const errorNames: Record<string, string> = {
  compile: '编译错误',
  compilation: '编译错误',
  runtime: '运行错误',
  timeout: '运行超时',
  test: '测试未通过',
  logic: '逻辑错误',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function conceptName(id: string): string {
  return CONCEPTS.find(concept => concept.id === id)?.name ?? id
}

export default function Progress({ snapshot }: ProgressProps) {
  const stats = getLearningStats(snapshot)
  const practiced = stats.concepts.filter(concept => concept.mastery !== null)
  const weakConcepts = practiced.filter(concept => (concept.mastery ?? 0) < 50)
  const recentAttempts = [...snapshot.attempts].reverse().slice(0, 5)
  const errors = [...snapshot.attempts].reverse().filter(attempt => !attempt.passed).slice(0, 4)
  const recommended = weakConcepts[0] ?? practiced[0]
  const recommendation = recommended ? recommendDifficulty(snapshot, recommended.conceptId) : null

  return (
    <div className="page-content progress-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">YOUR LEARNING JOURNEY</span>
          <h1>每一次尝试，都在成长<span className="accent">.</span></h1>
          <p className="muted">这里记录的是你的学习过程，以及逐渐建立起来的独立编程能力。</p>
        </div>
        <span className="tag"><ShieldCheck size={14} /> 数据仅存于此浏览器</span>
      </header>

      <div className="stat-grid">
        <section className="stat-card"><span className="stat-label"><Clock3 size={16} /> 累计学习</span><strong>{stats.studyMinutes}<small> 分钟</small></strong><span className="muted">专注的每一分钟都算数</span></section>
        <section className="stat-card"><span className="stat-label"><Target size={16} /> 独立完成率</span><strong>{stats.attempts ? `${stats.independentRate}%` : '—'}</strong><span className="muted">不使用提示的练习比例</span></section>
        <section className="stat-card"><span className="stat-label"><BookOpen size={16} /> 已完成课程</span><strong>{stats.completedLessons}<small> 节</small></strong><span className="muted">一步一步，建立知识体系</span></section>
        <section className="stat-card"><span className="stat-label"><Flame size={16} /> 连续学习</span><strong>{stats.streakDays}<small> 天</small></strong><span className="muted">保持节奏，比赶进度更重要</span></section>
      </div>

      <div className="growth-layout">
        <section className="panel mastery-panel">
          <div className="panel-header"><h2><TrendingUp size={18} /> 知识掌握度</h2><span className="muted">{practiced.length} / {CONCEPTS.length} 项已开始</span></div>
          <div className="skill-list">
            {stats.concepts.map(concept => (
              <div className="skill-row" key={concept.conceptId}>
                <div className="skill-row-header"><span>{conceptName(concept.conceptId)}</span><span className={concept.mastery === null ? 'muted' : 'accent-text'}>{concept.mastery === null ? '待探索' : `${concept.mastery}%`}</span></div>
                <div className="progress-track" role="progressbar" aria-label={`${conceptName(concept.conceptId)}掌握度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={concept.mastery ?? undefined} aria-valuetext={concept.mastery === null ? '尚无练习证据' : `${concept.mastery}%`}><span style={{ width: `${concept.mastery ?? 0}%` }} /></div>
                {concept.evidenceCount > 0 && <span className="skill-meta muted">{concept.evidenceCount} 次练习 · 证据可信度 {concept.confidence}%</span>}
              </div>
            ))}
          </div>
          <p className="panel-footnote muted">掌握度结合测试成绩和提示使用情况估算；“待探索”表示还没有学习证据。迁移题评分将在后续版本加入。</p>
        </section>

        <div className="growth-side">
          <section className="panel learning-report">
            <div className="panel-header"><h2><Sparkles size={18} /> 学习洞察</h2><span className="tag">规则分析</span></div>
            {stats.attempts ? (
              <>
                <p className="report-heading">你已经迈出了 {stats.attempts} 次勇敢的尝试。</p>
                <p className="muted">练习平均得分 {stats.averageAccuracy}%，使用了 {stats.hintCount} 次提示。完成练习之后，试着用自己的话解释代码为什么能够工作。</p>
                {recommendation && <div className="insight-box"><Lightbulb size={18} /><div><strong>下一步：{conceptName(recommended!.conceptId)}</strong><p>{recommendation.reason}</p></div></div>}
              </>
            ) : (
              <>
                <div className="report-illustration"><TrendingUp size={34} /></div>
                <p className="report-heading">你的成长曲线，从第一行代码开始。</p>
                <p className="muted">完成一次课程练习后，这里会根据实际记录，给出掌握度和下一步学习建议。</p>
              </>
            )}
            <span className="report-footer"><ShieldCheck size={14} /> 建议由本地学习规则生成</span>
          </section>

          <section className="panel">
            <div className="panel-header"><h2><Activity size={18} /> 最近练习</h2><span className="muted">最近 5 次</span></div>
            {recentAttempts.length ? (
              <div className="activity-list">
                {recentAttempts.map(attempt => (
                  <div className="activity-row" key={attempt.id}>
                    <span className={`activity-icon ${attempt.passed ? 'success' : 'warning'}`}>{attempt.passed ? <CheckCircle2 size={16} /> : <Target size={16} />}</span>
                    <div><strong>{conceptName(attempt.conceptId)}练习</strong><span className="muted">{formatDate(attempt.createdAt)} · {attempt.independent ? '独立尝试' : `提示 L${attempt.hintLevel}`}</span></div>
                    <span className={attempt.passed ? 'accent-text' : 'muted'}>{attempt.score}%</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state"><BookOpen size={25} /><p>暂时没有练习记录</p><span className="muted">去代码实验室，完成你的第一个小任务吧。</span></div>}
          </section>
        </div>
      </div>

      <section className="panel error-notebook">
        <div className="panel-header"><h2><Lightbulb size={18} /> 错误也是学习的线索</h2><span className="muted">最近的未通过尝试</span></div>
        {errors.length ? (
          <div className="error-list">
            {errors.map(attempt => (
              <div className="error-row" key={attempt.id}>
                <div><span className="tag warning">{errorNames[attempt.errorType ?? 'test'] ?? attempt.errorType}</span><strong>{conceptName(attempt.conceptId)}</strong></div>
                <p className="muted">回到练习，观察程序行为与题目要求的差别，再用一个更小的输入验证你的想法。</p>
                <span className="muted">{formatDate(attempt.createdAt)} <ArrowUpRight size={14} /></span>
              </div>
            ))}
          </div>
        ) : <div className="empty-state compact"><CheckCircle2 size={22} /><span>{stats.attempts ? '最近的练习都通过了，继续保持独立思考。' : '练习中的错误会保存在这里，帮助你复盘。'}</span></div>}
      </section>
    </div>
  )
}
