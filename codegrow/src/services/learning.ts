export type HintLevel = 1 | 2 | 3 | 4

export interface LearningSession {
  id: string
  startedAt: string
  endedAt?: string
  durationSeconds: number
}

export interface ExerciseAttempt {
  id: string
  exerciseId: string
  conceptId: string
  createdAt: string
  passed: boolean
  /** Test score, between 0 and 100. */
  score: number
  independent: boolean
  hintLevel: 0 | HintLevel
  errorType?: string
  /** SHA-256 of source and input, used to deduplicate runs across restarts. */
  fingerprint?: string
}

export interface HintEvent {
  id: string
  exerciseId: string
  createdAt: string
  level: HintLevel
}

export interface LearningSnapshot {
  version: 1
  sessions: LearningSession[]
  attempts: ExerciseAttempt[]
  hints: HintEvent[]
  completedIds: string[]
  drafts: Record<string, string>
}

export interface ConceptMastery {
  conceptId: string
  mastery: number | null
  confidence: number
  evidenceCount: number
  independence: number | null
  lastPracticedAt?: string
}

export interface LearningStats {
  studyMinutes: number
  attempts: number
  completedLessons: number
  averageAccuracy: number
  independentRate: number
  hintCount: number
  streakDays: number
  masteredConcepts: number
  concepts: ConceptMastery[]
}

export const CONCEPTS = [
  { id: 'syntax', name: '基础语法' },
  { id: 'variables', name: '变量' },
  { id: 'types', name: '数据类型' },
  { id: 'io', name: '输入输出' },
  { id: 'conditions', name: '条件判断' },
  { id: 'loops', name: '循环' },
  { id: 'arrays', name: '数组' },
  { id: 'functions', name: '函数' },
  { id: 'pointers', name: '指针' },
  { id: 'structs', name: '结构体' },
  { id: 'files', name: '文件操作' },
] as const

const HINT_COST = [0, 0.1, 0.3, 0.6, 1] as const
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

function uniqueId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createEmptySnapshot(): LearningSnapshot {
  return { version: 1, sessions: [], attempts: [], hints: [], completedIds: [], drafts: {} }
}

export function isLearningSnapshot(value: unknown): value is LearningSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<LearningSnapshot>
  return snapshot.version === 1 &&
    Array.isArray(snapshot.sessions) && snapshot.sessions.every(session =>
      session && typeof session.id === 'string' && typeof session.startedAt === 'string' &&
      Number.isFinite(session.durationSeconds) && session.durationSeconds >= 0 &&
      (session.endedAt === undefined || typeof session.endedAt === 'string')) &&
    Array.isArray(snapshot.attempts) && snapshot.attempts.every(attempt =>
      attempt && typeof attempt.id === 'string' && typeof attempt.exerciseId === 'string' &&
      typeof attempt.conceptId === 'string' && typeof attempt.createdAt === 'string' &&
      typeof attempt.passed === 'boolean' && Number.isFinite(attempt.score) &&
      attempt.score >= 0 && attempt.score <= 100 && typeof attempt.independent === 'boolean' &&
      Number.isInteger(attempt.hintLevel) && attempt.hintLevel >= 0 && attempt.hintLevel <= 4 &&
      (attempt.errorType === undefined || typeof attempt.errorType === 'string') &&
      (attempt.fingerprint === undefined || (typeof attempt.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(attempt.fingerprint)))) &&
    Array.isArray(snapshot.hints) && snapshot.hints.every(hint =>
      hint && typeof hint.id === 'string' && typeof hint.exerciseId === 'string' &&
      typeof hint.createdAt === 'string' && Number.isInteger(hint.level) && hint.level >= 1 && hint.level <= 4) &&
    Array.isArray(snapshot.completedIds) && snapshot.completedIds.every(id => typeof id === 'string') &&
    !!snapshot.drafts && typeof snapshot.drafts === 'object' && !Array.isArray(snapshot.drafts) &&
    Object.values(snapshot.drafts).every(draft => typeof draft === 'string')
}

export function recordAttempt(
  snapshot: LearningSnapshot,
  input: Omit<ExerciseAttempt, 'id' | 'createdAt'>,
): LearningSnapshot {
  if (input.fingerprint !== undefined) {
    if (!/^[a-f0-9]{64}$/i.test(input.fingerprint)) throw new Error('练习标识格式无效。')
    if (snapshot.attempts.some(attempt => attempt.exerciseId === input.exerciseId && attempt.fingerprint === input.fingerprint)) return snapshot
  }
  const hintLevel = clamp(Math.round(input.hintLevel), 0, 4) as ExerciseAttempt['hintLevel']
  const attempt: ExerciseAttempt = {
    ...input,
    id: uniqueId(),
    createdAt: new Date().toISOString(),
    score: clamp(Number.isFinite(input.score) ? input.score : 0, 0, 100),
    hintLevel,
    independent: input.independent && hintLevel === 0,
  }
  return { ...snapshot, attempts: [...snapshot.attempts, attempt] }
}

export function recordHint(
  snapshot: LearningSnapshot,
  input: Omit<HintEvent, 'id' | 'createdAt'>,
): LearningSnapshot {
  return {
    ...snapshot,
    hints: [...snapshot.hints, { ...input, id: uniqueId(), createdAt: new Date().toISOString() }],
  }
}

export function getConceptMastery(snapshot: LearningSnapshot, conceptId: string): ConceptMastery {
  const attempts = snapshot.attempts
    .filter(attempt => attempt.conceptId === conceptId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  if (!attempts.length) {
    return { conceptId, mastery: null, confidence: 0, evidenceCount: 0, independence: null }
  }
  let mastery: number | null = null
  for (const attempt of attempts) {
    // A run provides no separate reflection evidence yet; reserve its 20% for a later transfer exercise.
    const evidence = (attempt.score / 100) * (0.45 + 0.35 * (1 - HINT_COST[attempt.hintLevel])) * 100
    mastery = mastery === null ? evidence : 0.75 * mastery + 0.25 * evidence
  }
  const recent = attempts.slice(-10)
  return {
    conceptId,
    mastery: Math.round(mastery ?? 0),
    confidence: Math.round(Math.min(1, attempts.length / 5) * 100),
    evidenceCount: attempts.length,
    independence: Math.round(recent.filter(attempt => attempt.independent).length / recent.length * 100),
    lastPracticedAt: attempts.at(-1)?.createdAt,
  }
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function getStreakDays(snapshot: LearningSnapshot): number {
  const activeDays = new Set([
    ...snapshot.sessions.filter(session => session.durationSeconds > 0).map(session => session.startedAt),
    ...snapshot.attempts.map(attempt => attempt.createdAt),
  ].map(value => localDay(new Date(value))))
  const cursor = new Date()
  // Keep yesterday's streak visible before today's first exercise.
  if (!activeDays.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (activeDays.has(localDay(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function getLearningStats(snapshot: LearningSnapshot): LearningStats {
  const concepts = CONCEPTS.map(concept => getConceptMastery(snapshot, concept.id))
  const attempts = snapshot.attempts.length
  return {
    studyMinutes: Math.floor(snapshot.sessions.reduce((total, session) => total + session.durationSeconds, 0) / 60),
    attempts,
    completedLessons: new Set(snapshot.completedIds).size,
    averageAccuracy: attempts ? Math.round(snapshot.attempts.reduce((total, attempt) => total + attempt.score, 0) / attempts) : 0,
    independentRate: attempts ? Math.round(snapshot.attempts.filter(attempt => attempt.independent).length / attempts * 100) : 0,
    hintCount: snapshot.hints.length,
    streakDays: getStreakDays(snapshot),
    masteredConcepts: concepts.filter(concept => (concept.mastery ?? 0) >= 80 && concept.evidenceCount >= 3).length,
    concepts,
  }
}

export interface DifficultyRecommendation {
  difficulty: number
  mode: 'guide' | 'practice' | 'challenge' | 'debug'
  reason: string
}

export function recommendDifficulty(
  snapshot: LearningSnapshot,
  conceptId: string,
  baseDifficulty = 2,
): DifficultyRecommendation {
  const attempts = snapshot.attempts.filter(attempt => attempt.conceptId === conceptId)
  const mastery = getConceptMastery(snapshot, conceptId)
  const recent = attempts.slice(-5)
  let consecutiveFailures = 0
  for (let index = attempts.length - 1; index >= 0 && !attempts[index].passed; index -= 1) {
    consecutiveFailures += 1
  }
  const base = clamp(Math.round(baseDifficulty), 1, 5)
  if (consecutiveFailures >= 3) {
    return { difficulty: Math.max(1, base - 1), mode: 'debug', reason: '连续三次未通过，先降低一级并补充知识讲解。' }
  }
  if (consecutiveFailures >= 2) {
    return { difficulty: base, mode: 'debug', reason: '连续两次未通过，先定位同类错误并完成补救练习。' }
  }
  const recentScore = recent.reduce((sum, attempt) => sum + attempt.score, 0) / (recent.length || 1)
  const recentHints = recent.reduce((sum, attempt) => sum + attempt.hintLevel, 0) / (recent.length || 1)
  if (recent.length === 5 && recentScore > 85 && recentHints <= 1 && recent.every(attempt => attempt.passed)) {
    return { difficulty: Math.min(5, base + 1), mode: 'challenge', reason: '最近五次成绩超过 85%，且平均提示不超过一级，可以尝试进阶任务。' }
  }
  if (mastery.mastery === null || mastery.mastery < 40) {
    return { difficulty: base, mode: 'guide', reason: '先用短任务建立基础，并通过独立尝试积累学习证据。' }
  }
  return { difficulty: base, mode: 'practice', reason: '保持当前难度，练习独立完成并巩固相关知识。' }
}
