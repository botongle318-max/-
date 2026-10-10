import Monaco, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { useRef } from 'react'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
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
  run.current = onRun
  return <Monaco height="100%" language="c" theme="codegrow" value={code}
    onChange={(value) => onChange(value || '')}
    loading={<div className="editor-loading">正在加载 Monaco 编辑器…</div>}
    onMount={(editor) => editor.addAction({ id: 'codegrow-run', label: '运行代码', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => run.current() })}
    options={{ fontSize: 14, fontFamily: "'Cascadia Code', Consolas, monospace", minimap: { enabled: false },
      scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 18 }, lineNumbersMinChars: 3,
      renderLineHighlight: 'line', tabSize: 4, wordWrap: 'on', accessibilitySupport: 'auto' }} />
}
