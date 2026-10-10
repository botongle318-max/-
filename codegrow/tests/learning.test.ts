import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptySnapshot, getConceptMastery, getLearningStats, isLearningSnapshot,
  recordAttempt, recordHint, recommendDifficulty, type LearningSnapshot,
} from '../src/services/learning'

function attempt(snapshot: LearningSnapshot, overrides = {}) {
  return recordAttempt(snapshot, {
    exerciseId: 'loops-1', conceptId: 'loops', passed: true,
    score: 100, independent: true, hintLevel: 0, ...overrides,
  })
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
})
