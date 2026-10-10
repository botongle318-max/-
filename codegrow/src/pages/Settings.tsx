import { useState } from 'react'
import { Check, Database, Download, ExternalLink, Info, LockKeyhole, Settings2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { exportDatabase } from '../services/database'

export const AI_PROXY_STORAGE_KEY = 'codegrow-ai-endpoint'

interface SettingsProps {
  onReset: () => Promise<void>
}

function savedEndpoint(): string {
  try { return localStorage.getItem(AI_PROXY_STORAGE_KEY) ?? '' } catch { return '' }
}

export default function Settings({ onReset }: SettingsProps) {
  const [endpoint, setEndpoint] = useState(savedEndpoint)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  function saveEndpoint() {
    setStatus('')
    setError('')
    const value = endpoint.trim().replace(/\/+$/, '')
    if (value) {
      try {
        const parsed = new URL(value)
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) ||
          parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error()
      } catch {
        setError('请输入 HTTPS 地址，或本机 localhost HTTP 地址；地址中不要包含密钥、查询参数或密码。')
        return
      }
    }
    try {
      if (value) localStorage.setItem(AI_PROXY_STORAGE_KEY, value)
      else localStorage.removeItem(AI_PROXY_STORAGE_KEY)
      setEndpoint(value)
      window.dispatchEvent(new Event('codegrow-settings-changed'))
      setStatus(value ? '代理地址已保存，下一条导师消息将使用此配置。' : '已启用本地引导导师。')
    } catch {
      setError('浏览器不允许保存设置，请检查存储权限。')
    }
  }

  function downloadDatabase() {
    setStatus('')
    setError('')
    try {
      const bytes = exportDatabase()
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.sqlite3' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `codegrow-learning-${new Date().toISOString().slice(0, 10)}.sqlite`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('数据库已导出。请妥善保存，它包含你的练习代码和学习记录。')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导出失败，请稍后重试。')
    }
  }

  async function reset() {
    setResetting(true)
    setError('')
    setStatus('')
    try {
      await onReset()
      setConfirmReset(false)
      setStatus('学习数据已重置，可以重新开始学习。')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重置失败，请稍后重试。')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="page-content settings-page">
      <header className="page-header">
        <div><span className="eyebrow">MAKE IT YOURS</span><h1>设置<span className="accent">.</span></h1><p className="muted">照顾好你的学习空间，让工具配合你的节奏。</p></div>
        <span className="tag"><Settings2 size={14} /> CodeGrow · MVP</span>
      </header>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="panel settings-card">
            <div className="panel-header"><h2><Sparkles size={18} /> AI 私人导师</h2><span className="tag">可选连接</span></div>
            <p className="muted">默认使用本地引导导师。连接你自己的 AI 代理后，可以获得针对当前代码的模型回复。</p>
            <label className="field-label" htmlFor="ai-endpoint">AI 代理服务地址</label>
            <div className="input-action-row"><input id="ai-endpoint" className="text-input" type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="http://localhost:8787" autoComplete="off" spellCheck={false} /><button className="button button-primary" onClick={saveEndpoint}><Check size={16} /> 保存设置</button></div>
            <p className="field-help muted">填写服务基础地址或完整的 /v1/tutor 地址。留空使用本地导师。API 密钥只配置在代理服务端。</p>
            <div className="notice"><LockKeyhole size={18} /><span>向外部导师发送消息时，会传输当前代码、问题和相关学习上下文。请避免在代码中放入密钥或个人信息。</span></div>
          </section>

          <section className="panel settings-card">
            <div className="panel-header"><h2><Database size={18} /> 学习数据</h2><span className="tag"><ShieldCheck size={13} /> 本地优先</span></div>
            <div className="setting-row"><div><strong>导出学习数据库</strong><p className="muted">下载 SQLite 文件，备份练习代码、提示记录与课程进度。</p></div><button className="button button-secondary" onClick={downloadDatabase}><Download size={16} /> 导出 .sqlite</button></div>
            <div className="setting-row"><div><strong>数据保存位置</strong><p className="muted">SQLite 数据库保存在此浏览器的 IndexedDB 中，刷新和重新打开后自动恢复。</p></div><span className="tag">SQLite + IndexedDB</span></div>
            <div className="notice"><Info size={18} /><span>不同浏览器、设备或网站地址拥有独立数据。清除网站数据、使用无痕窗口或浏览器自动清理存储可能删除学习记录；建议定期导出。</span></div>
            <div className="setting-row danger-row"><div><strong>重新开始学习</strong><p className="muted">删除此浏览器中的课程进度、草稿和练习记录。</p></div><button className="button button-danger" onClick={() => setConfirmReset(true)} disabled={resetting}><Trash2 size={16} /> 重置数据</button></div>
            {confirmReset && <div className="reset-confirmation" role="alert"><strong>确认重置全部学习数据？</strong><p>此操作无法撤销。建议先导出数据库备份。</p><div className="button-row"><button className="button button-secondary" onClick={() => setConfirmReset(false)} disabled={resetting}>取消</button><button className="button button-danger" onClick={() => void reset()} disabled={resetting}>{resetting ? '正在重置…' : '确认重置'}</button></div></div>}
          </section>

          {(status || error) && <div className={`settings-feedback notice ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error ? <Info size={18} /> : <Check size={18} />}<span>{error || status}</span></div>}
        </div>

        <aside className="settings-side">
          <section className="panel about-card"><div className="about-mark">cg<span>.</span></div><h2>CodeGrow</h2><p className="muted">不替你写代码，<br />而是培养你成为程序员。</p><span className="tag">C LANGUAGE · FIRST STEPS</span><div className="about-divider" /><p className="muted">从理解第一行代码开始，在一次次独立尝试中，成长为能够解决问题的人。</p></section>
          <section className="panel privacy-card"><h2><ShieldCheck size={18} /> 关于隐私</h2><p className="muted">无需注册。课程、代码草稿和学习记录默认保存在本机浏览器。使用外部 AI 代理时，仅在你发送消息后传输教学上下文。</p><a className="text-link" href="https://github.com/botongle318-max/-" target="_blank" rel="noreferrer">查看开源项目 <ExternalLink size={14} /></a></section>
        </aside>
      </div>
    </div>
  )
}
