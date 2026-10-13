import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { conf as cConfiguration, language as cTokens } from 'monaco-editor/esm/vs/basic-languages/cpp/cpp.js'

type MonacoApi = typeof Monaco

export const cLanguageExtension = {
  id: 'c',
  extensions: ['.c', '.h'],
  aliases: ['C', 'c'],
}

export function configureCLanguage(monaco: MonacoApi) {
  monaco.languages.register(cLanguageExtension)
  monaco.languages.setMonarchTokensProvider(cLanguageExtension.id, cTokens)
  monaco.languages.setLanguageConfiguration(cLanguageExtension.id, cConfiguration)
}

export function createRunAction(monaco: Pick<MonacoApi, 'KeyCode' | 'KeyMod'>, onRun: () => void): Monaco.editor.IActionDescriptor {
  return {
    id: 'codegrow-run',
    label: '运行代码',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => onRun(),
  }
}
