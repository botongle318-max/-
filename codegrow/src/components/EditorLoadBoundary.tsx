import { Component, type ReactNode } from 'react'

/** A failed lazy chunk must not take down the course, console or saved learning data. */
export default class EditorLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="editor-loading editor-load-error" role="alert">
      <strong>编辑器资源加载失败</strong>
      <p>请检查网络后重新加载网页。此操作不会清除学习记录或已保存的草稿。</p>
      <button className="secondary-button" onClick={() => location.reload()}>重新加载网页</button>
    </div>
  }
}
