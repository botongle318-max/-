import { describe, expect, it } from 'vitest'
import { lessons, modules } from '../src/data/curriculum'

describe('C learning curriculum', () => {
  it('has unique lesson and module IDs so drafts and learning records cannot collide', () => {
    expect(lessons).toHaveLength(9)
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length)
    expect(new Set(modules.map((module) => module.id)).size).toBe(modules.length)
  })

  it.each(lessons)('$id has a runnable starter, sample test and a real course module', (lesson) => {
    expect(modules.some((module) => module.id === lesson.module)).toBe(true)
    expect(lesson.starterCode).toMatch(/#include\s*<stdio\.h>/)
    expect(lesson.starterCode).toMatch(/int\s+main\s*\(\s*void\s*\)/)
    expect(lesson.expectedOutput.length).toBeGreaterThan(0)
    expect(lesson.expectedOutput.endsWith('\n')).toBe(true)
    expect(typeof lesson.stdin).toBe('string')
    expect(lesson.objectives.length).toBeGreaterThan(0)
    expect(lesson.difficulty).toBeGreaterThanOrEqual(1)
    expect(lesson.difficulty).toBeLessThanOrEqual(5)
    expect(lesson.duration).toBeGreaterThan(0)
  })

  it.each(lessons)('$id reserves reference code for the fourth hint level', (lesson) => {
    expect(lesson.hints).toHaveLength(4)
    expect(lesson.hints.every((hint) => hint.trim().length > 0)).toBe(true)
    const reference = lesson.hints[3].replace(/\s/g, '')
    for (const hint of lesson.hints.slice(0, 3)) {
      expect(hint).not.toMatch(/#include\s*<|int\s+main\s*\(|```/)
      expect(hint.replace(/\s/g, '')).not.toContain(reference)
    }
  })

  it('matches sample output to the mathematical task, including the loop upper boundary', () => {
    const actual = Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson.expectedOutput.trimEnd()]))
    expect(actual).toEqual({
      'hello-world': 'Hello, CodeGrow!',
      variables: String(8 + 5),
      'data-types': (3.14 * 2 * 2).toFixed(2),
      'input-output': String(7 + 5),
      conditions: 76 >= 60 ? 'Pass' : 'Retry',
      'for-loop': String(Array.from({ length: 10 }, (_, index) => index + 1).reduce((sum, value) => sum + value, 0)),
      'while-loop': String(String(2026).length),
      arrays: String([2, 4, 6, 8].reduce((sum, value) => sum + value, 0)),
      functions: String(6 * 6),
    })
    expect(lessons.find((lesson) => lesson.id === 'input-output')?.stdin.trim()).toBe('7 5')
  })

  it('keeps future advanced modules out of the playable exercise list', () => {
    for (const moduleId of ['pointers', 'structs', 'files']) {
      expect(modules.find((module) => module.id === moduleId)?.level).toBe('进阶')
      expect(lessons.some((lesson) => lesson.module === moduleId)).toBe(false)
    }
  })
})
