import Monaco, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js'
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/readOnlyMessage/browser/contribution.js'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { useEffect, useRef, useState } from 'react'
import { configureCLanguage, createRunAction } from './editorSetup'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
configureCLanguage(monaco)
monaco.editor.defineTheme('codegrow', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'comment', foreground: '6F829A' }, { token: 'keyword', foreground: 'C398EB' }, { token: 'string', foreground: 'A3D6A2' }],
  colors: {
    'editor.background': '#101621', 'editor.foreground': '#D7E0EF',
    'editorLineNumber.foreground': '#45556C', 'editorLineNumber.activeForeground': '#A3B3C8',
    'editor.lineHighlightBackground': '#151E2D', 'editor.selectionBackground': '#24476A',
  },
})

export default function Editor({ code, onChange, onRun }: {
  code: string; onChange: (value: string) => void; onRun: () => void
}) {
  const run = useRef(onRun)
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null)
  run.current = onRun

  useEffect(() => {
    if (!editor) return
    const action = editor.addAction(createRunAction(monaco, () => run.current()))
    return () => action.dispose()
  }, [editor])

  return <Monaco height="100%" language="c" theme="codegrow" value={code}
    onChange={(value) => onChange(value || '')}
    loading={<div className="editor-loading">正在加载 Monaco 编辑器…</div>}
    onMount={setEditor}
    options={{ fontSize: 14, fontFamily: "'Cascadia Code', Consolas, monospace", minimap: { enabled: false },
      scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 18 }, lineNumbersMinChars: 3,
      renderLineHighlight: 'line', tabSize: 4, wordWrap: 'on', accessibilitySupport: 'auto' }} />
}
