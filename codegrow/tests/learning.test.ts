import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptySnapshot, getConceptMastery, getLearningStats, isLearningSnapshot,
  recordAttempt, recordHint, recommendDifficulty, recordTutorExchange, getTutorMessages,
  clearTutorChat, MAX_TUTOR_MESSAGES, type ChatMessage, type LearningSnapshot,
} from '../src/services/learning'

function attempt(snapshot: LearningSnapshot, overrides = {}) {
  return recordAttempt(snapshot, {
    exerciseId: 'loops-1', conceptId: 'loops', passed: true,
    score: 100, independent: true, hintLevel: 0, ...overrides,
  })
}

function exchange(index = 0, content = '请解释循环') : [ChatMessage, ChatMessage] {
  return [
    { id: `user-${index}`, role: 'user', content, createdAt: new Date(2026, 9, 11, 10, 0, index).toISOString() },
    { id: `assistant-${index}`, role: 'assistant', content: `我们一起分析：${content}`, createdAt: new Date(2026, 9, 11, 10, 0, index + 1).toISOString(), source: 'local-model' },
  ]
}

afterEach(() => { vi.useRealTimers() })

describe('learning evidence', () => {
  it('keeps unpracticed concepts unknown instead of inventing zero mastery', () => {
    const snapshot = createEmptySnapshot()
    expect(isLearningSnapshot(snapshot)).toBe(true)
    expect(getConceptMastery(snapshot, 'loops')).toEqual({
      conceptId: 'loops', mastery: null, confidence: 0, evidenceCount: 0, independence: null,
    })
    expect(getLearningStats(snapshot)).toMatchObject({ attempts: 0, completedLessons: 0, masteredConcepts: 0 })
  })

  it('records attempts immutably and never counts a hinted attempt as independent', () => {
    const original = createEmptySnapshot()
    const updated = attempt(original, { hintLevel: 2, score: 120 })
    expect(original.attempts).toHaveLength(0)
    expect(updated.attempts).toHaveLength(1)
    expect(updated.attempts[0]).toMatchObject({ score: 100, independent: false, hintLevel: 2 })
    expect(updated.attempts[0].id).toBeTruthy()
    expect(updated.attempts[0].createdAt).toBeTruthy()
  })

  it('credits reference-code completion less than independent problem solving', () => {
    const independent = attempt(createEmptySnapshot())
    const referenceAssisted = attempt(createEmptySnapshot(), { hintLevel: 4 })
    expect(getConceptMastery(independent, 'loops').mastery).toBe(80)
    expect(getConceptMastery(referenceAssisted, 'loops').mastery).toBe(45)
  })

  it('requires three pieces of strong evidence before reporting a mastered concept', () => {
    let snapshot = attempt(createEmptySnapshot())
    expect(getLearningStats(snapshot).masteredConcepts).toBe(0)
    snapshot = attempt(attempt(snapshot))
    expect(getConceptMastery(snapshot, 'loops')).toMatchObject({ mastery: 80, confidence: 60, evidenceCount: 3 })
    expect(getLearningStats(snapshot).masteredConcepts).toBe(1)
  })

  it('records hint events without changing previous snapshots', () => {
    const original = createEmptySnapshot()
    const updated = recordHint(original, { exerciseId: 'loops-1', level: 1 })
    expect(original.hints).toEqual([])
    expect(updated.hints[0]).toMatchObject({ exerciseId: 'loops-1', level: 1 })
    expect(getLearningStats(updated).hintCount).toBe(1)
  })

  it('calculates actual session time and does not double-count completed lesson IDs', () => {
    let snapshot = attempt(createEmptySnapshot())
    snapshot = attempt(snapshot, { passed: false, score: 40, hintLevel: 2 })
    snapshot.sessions = [{ id: 'session-1', startedAt: new Date().toISOString(), durationSeconds: 125 }]
    snapshot.completedIds = ['loops', 'loops', 'variables']
    expect(getLearningStats(snapshot)).toMatchObject({
      studyMinutes: 2, averageAccuracy: 70, independentRate: 50, completedLessons: 2,
    })
  })

  it('preserves yesterday’s streak before today’s first practice', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 12))
    const snapshot = createEmptySnapshot()
    snapshot.sessions = [
      { id: 'a', startedAt: new Date(2026, 9, 8, 12).toISOString(), durationSeconds: 60 },
      { id: 'b', startedAt: new Date(2026, 9, 9, 12).toISOString(), durationSeconds: 60 },
    ]
    expect(getLearningStats(snapshot).streakDays).toBe(2)
  })

  it('rejects malformed persisted data instead of calculating misleading statistics', () => {
    const snapshot = attempt(createEmptySnapshot())
    expect(isLearningSnapshot({ ...snapshot, version: 2 })).toBe(false)
    expect(isLearningSnapshot({ ...snapshot, drafts: { exercise: 42 } })).toBe(false)
    expect(isLearningSnapshot({ ...snapshot, attempts: [{ ...snapshot.attempts[0], score: -1 }] })).toBe(false)
    expect(isLearningSnapshot({ ...snapshot, attempts: [{ ...snapshot.attempts[0], fingerprint: 'invalid' }] })).toBe(false)
  })

  it('deduplicates identical source and input after a persisted snapshot is restored', () => {
    const original = attempt(createEmptySnapshot(), { fingerprint: 'a'.repeat(64) })
    const restored = JSON.parse(JSON.stringify(original)) as LearningSnapshot
    const duplicate = attempt(restored, { fingerprint: 'a'.repeat(64), hintLevel: 4 })
    expect(duplicate).toBe(restored)
    expect(duplicate.attempts).toHaveLength(1)
    expect(duplicate.attempts[0].independent).toBe(true)
    expect(attempt(restored, { fingerprint: 'b'.repeat(64) }).attempts).toHaveLength(2)
    expect(attempt(restored, { exerciseId: 'another-exercise', fingerprint: 'a'.repeat(64) }).attempts).toHaveLength(2)
  })

  it('records explicit independent assessment and credits acknowledged assistance honestly', () => {
    const independent = attempt(createEmptySnapshot())
    const assisted = attempt(createEmptySnapshot(), { independent: false })
    expect(independent.attempts[0].selfReportedIndependent).toBe(true)
    expect(assisted.attempts[0]).toMatchObject({ independent: false, selfReportedIndependent: false, hintLevel: 0 })
    expect(getConceptMastery(assisted, 'loops').mastery).toBe(59)
    expect(isLearningSnapshot({ ...assisted, attempts: [{ ...assisted.attempts[0], selfReportedIndependent: 'yes' }] })).toBe(false)
  })
})

describe('persisted tutor conversations', () => {
  it('reads version-1 snapshots without conversation or self-assessment fields', () => {
    const old = attempt(createEmptySnapshot())
    delete old.attempts[0].selfReportedIndependent
    expect(isLearningSnapshot(JSON.parse(JSON.stringify(old)))).toBe(true)
    expect(getTutorMessages(old, 'loops-1')).toEqual([])
    expect(getLearningStats(old).tutorMessageCount).toBe(0)
  })

  it('saves successful exchanges separately per lesson without penalizing ordinary questions', () => {
    const original = attempt(createEmptySnapshot())
    const updated = recordTutorExchange(original, 'loops-1', ...exchange())
    expect(original.tutorChats).toBeUndefined()
    expect(getTutorMessages(updated, 'loops-1')).toEqual(exchange())
    expect(getTutorMessages(updated, 'variables')).toEqual([])
    expect(updated.hints).toEqual(original.hints)
    expect(updated.attempts).toBe(original.attempts)
    expect(getLearningStats(updated)).toMatchObject({ independentRate: 100, hintCount: 0, tutorMessageCount: 2 })
    expect(isLearningSnapshot(updated)).toBe(true)
    const messages = getTutorMessages(updated, 'loops-1')
    messages[0].content = 'mutated copy'
    expect(getTutorMessages(updated, 'loops-1')[0].content).toBe('请解释循环')
  })

  it('does not persist duplicate exchanges and rejects reused IDs with different contents', () => {
    const messages = exchange()
    const snapshot = recordTutorExchange(createEmptySnapshot(), 'loops-1', ...messages)
    expect(recordTutorExchange(snapshot, 'loops-1', ...messages)).toBe(snapshot)
    expect(() => recordTutorExchange(snapshot, 'loops-1', { ...messages[0], content: 'different' }, messages[1])).toThrow(/重复/)
    expect(() => recordTutorExchange(snapshot, 'another-lesson', ...messages)).toThrow(/重复/)
  })

  it('rejects incomplete, invalid, or fake-status exchanges', () => {
    const [user, assistant] = exchange()
    const empty = createEmptySnapshot()
    expect(() => recordTutorExchange(empty, 'loops-1', user, { ...assistant, role: 'user' })).toThrow(/格式/)
    expect(() => recordTutorExchange(empty, 'loops-1', user, { ...assistant, content: '' })).toThrow(/格式/)
    expect(() => recordTutorExchange(empty, 'loops-1', user, { ...assistant, content: 'x'.repeat(12_001) })).toThrow(/格式/)
    expect(() => recordTutorExchange(empty, 'loops-1', user, { ...assistant, source: 'local' as 'ai' })).toThrow(/格式/)
    expect(() => recordTutorExchange(empty, '__proto__', user, assistant)).toThrow(/格式/)
    expect(isLearningSnapshot({ ...empty, tutorChats: { 'loops-1': [user] } })).toBe(false)
    expect(isLearningSnapshot({ ...empty, tutorChats: { 'loops-1': [user, { ...assistant, role: 'system' }] } })).toBe(false)
    expect(isLearningSnapshot({ ...empty, tutorChats: { 'loops-1': [user, { ...assistant, id: user.id }] } })).toBe(false)
  })

  it('keeps the latest 20 whole exchanges and never leaves a dangling user message', () => {
    let snapshot = createEmptySnapshot()
    for (let index = 0; index < 25; index += 1) snapshot = recordTutorExchange(snapshot, 'loops-1', ...exchange(index))
    const messages = getTutorMessages(snapshot, 'loops-1')
    expect(messages).toHaveLength(MAX_TUTOR_MESSAGES)
    expect(messages[0]).toMatchObject({ id: 'user-5', role: 'user' })
    expect(messages.at(-1)).toMatchObject({ id: 'assistant-24', role: 'assistant' })
    expect(isLearningSnapshot(snapshot)).toBe(true)
  })

  it('limits total conversation size while retaining recent complete exchanges', () => {
    let snapshot = createEmptySnapshot()
    for (let index = 0; index < 12; index += 1) {
      const [user, assistant] = exchange(index)
      snapshot = recordTutorExchange(snapshot, `lesson-${index}`, { ...user, content: 'x'.repeat(12_000) }, { ...assistant, content: 'y'.repeat(12_000) })
    }
    const chats = Object.values(snapshot.tutorChats ?? {})
    expect(chats.flat().reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(200_000)
    expect(chats.every(messages => messages.length % 2 === 0)).toBe(true)
    expect(getTutorMessages(snapshot, 'lesson-11')).toHaveLength(2)
    expect(isLearningSnapshot(snapshot)).toBe(true)
  })

  it('bounds the number of retained lesson chats and evicts the oldest inactive lesson', () => {
    let snapshot = createEmptySnapshot()
    for (let index = 0; index < 41; index += 1) snapshot = recordTutorExchange(snapshot, `lesson-${index}`, ...exchange(index))
    expect(Object.keys(snapshot.tutorChats ?? {})).toHaveLength(40)
    expect(getTutorMessages(snapshot, 'lesson-0')).toEqual([])
    expect(getTutorMessages(snapshot, 'lesson-40')).toHaveLength(2)
    expect(isLearningSnapshot(snapshot)).toBe(true)
  })

  it('clears only the selected lesson and leaves learning evidence intact', () => {
    let snapshot = attempt(createEmptySnapshot())
    snapshot = recordTutorExchange(snapshot, 'loops-1', ...exchange())
    snapshot = recordTutorExchange(snapshot, 'variables', ...exchange(1))
    const cleared = clearTutorChat(snapshot, 'loops-1')
    expect(getTutorMessages(cleared, 'loops-1')).toEqual([])
    expect(getTutorMessages(cleared, 'variables')).toEqual(exchange(1))
    expect(getTutorMessages(snapshot, 'loops-1')).toHaveLength(2)
    expect(cleared.attempts).toBe(snapshot.attempts)
    expect(clearTutorChat(cleared, 'missing')).toBe(cleared)
  })
})

describe('adaptive difficulty', () => {
  it('starts a new student in guide mode without raising the base difficulty', () => {
    expect(recommendDifficulty(createEmptySnapshot(), 'loops', 2)).toMatchObject({ difficulty: 2, mode: 'guide' })
  })

  it('offers a challenge only after five passing attempts above 85% with low hint use', () => {
    let snapshot = createEmptySnapshot()
    for (let index = 0; index < 4; index += 1) snapshot = attempt(snapshot, { score: 90, hintLevel: 1 })
    expect(recommendDifficulty(snapshot, 'loops', 2).mode).not.toBe('challenge')
    snapshot = attempt(snapshot, { score: 90, hintLevel: 1 })
    expect(recommendDifficulty(snapshot, 'loops', 2)).toMatchObject({ difficulty: 3, mode: 'challenge' })
    let heavilyAssisted = createEmptySnapshot()
    for (let index = 0; index < 5; index += 1) heavilyAssisted = attempt(heavilyAssisted, { hintLevel: 3 })
    expect(recommendDifficulty(heavilyAssisted, 'loops', 2).mode).not.toBe('challenge')
  })

  it('adds remediation after two failures and lowers difficulty after three', () => {
    let snapshot = attempt(createEmptySnapshot(), { passed: false, score: 20 })
    snapshot = attempt(snapshot, { passed: false, score: 40 })
    expect(recommendDifficulty(snapshot, 'loops', 3)).toMatchObject({ difficulty: 3, mode: 'debug' })
    snapshot = attempt(snapshot, { passed: false, score: 50 })
    expect(recommendDifficulty(snapshot, 'loops', 3)).toMatchObject({ difficulty: 2, mode: 'debug' })
    expect(recommendDifficulty(snapshot, 'loops', 1).difficulty).toBe(1)
  })

  it('does not automatically raise difficulty for self-reported assisted completions', () => {
    let snapshot = createEmptySnapshot()
    for (let index = 0; index < 5; index += 1) snapshot = attempt(snapshot, { independent: false })
    expect(recommendDifficulty(snapshot, 'loops', 2).mode).not.toBe('challenge')
  })
})
