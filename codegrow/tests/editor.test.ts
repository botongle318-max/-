import { describe, expect, it, vi } from 'vitest'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { cLanguageExtension, configureCLanguage, createRunAction } from '../src/components/editorSetup'

describe('Monaco C editor setup', () => {
  it('registers only the C language with its tokenizer and editing configuration', () => {
    const register = vi.fn()
    const setMonarchTokensProvider = vi.fn()
    const setLanguageConfiguration = vi.fn()
    const monaco = {
      languages: { register, setMonarchTokensProvider, setLanguageConfiguration },
    } as unknown as typeof Monaco

    configureCLanguage(monaco)

    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith(cLanguageExtension)
    expect(cLanguageExtension).toEqual({ id: 'c', extensions: ['.c', '.h'], aliases: ['C', 'c'] })

    const tokens = setMonarchTokensProvider.mock.calls[0][1]
    expect(tokens.keywords).toEqual(expect.arrayContaining(['for', 'while', 'int', 'return']))

    const configuration = setLanguageConfiguration.mock.calls[0][1]
    expect(configuration.brackets).toContainEqual(['{', '}'])
    expect(configuration.autoClosingPairs).toContainEqual({ open: '{', close: '}' })
  })

  it('binds Ctrl/Cmd + Enter to the current run callback', async () => {
    const onRun = vi.fn()
    const keyApi = {
      KeyMod: { CtrlCmd: 1 << 11 },
      KeyCode: { Enter: 3 },
    } as Pick<typeof Monaco, 'KeyCode' | 'KeyMod'>

    const action = createRunAction(keyApi, onRun)
    await action.run({} as Monaco.editor.ICodeEditor)

    expect(action.id).toBe('codegrow-run')
    expect(action.keybindings).toEqual([(1 << 11) | 3])
    expect(onRun).toHaveBeenCalledOnce()
  })
})
