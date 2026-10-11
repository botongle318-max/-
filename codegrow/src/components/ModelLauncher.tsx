import { useEffect, useState, useSyncExternalStore } from 'react'
import { Cpu, Download, LoaderCircle, Square } from 'lucide-react'
import { LOCAL_TUTOR_MODELS, DEFAULT_LOCAL_MODEL_ID, checkGpuSupport, subscribeLocalTutor, getLocalTutorState, loadLocalTutor, cancelLocalTutorLoad, unloadLocalTutor } from '../services/localTutor'
import '../tutor.css'

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

/** Loading is always initiated by the learner: mounting this component never downloads weights. */
export default function ModelLauncher() {
  const state = useSyncExternalStore(subscribeLocalTutor, getLocalTutorState, getLocalTutorState)
  const [model, setModel] = useState(() => {
    const saved = stored('codegrow-model-id', DEFAULT_LOCAL_MODEL_ID)
    return LOCAL_TUTOR_MODELS.some(item => item.id === saved) ? saved : DEFAULT_LOCAL_MODEL_ID
  })
  const [source, setSource] = useState<'official' | 'mirror'>(() => stored('codegrow-model-source', 'official') === 'mirror' ? 'mirror' : 'official')
  const [gpu, setGpu] = useState<{ supported: boolean; reason: string } | null>(null)
  const [error, setError] = useState('')
  const loading = state.status === 'checking' || state.status === 'loading'
  const busy = loading || state.status === 'generating'
  const ready = state.status === 'ready' || state.status === 'generating'
  const selected = LOCAL_TUTOR_MODELS.find(item => item.id === model)!

  useEffect(() => {
    let active = true
    checkGpuSupport().then(result => { if (active) setGpu(result) }).catch(() => { if (active) setGpu({ supported: false, reason: '无法检测 GPU。请使用最新版 Chrome / Edge，并开启硬件加速。' }) })
    return () => { active = false }
  }, [])

  function save(key: string, value: string) {
    try { localStorage.setItem(key, value); setError('') }
    catch { setError('浏览器无法保存模型设置，本次选择仍可使用。') }
  }

  async function load() {
    setError('')
    try { await loadLocalTutor(model, undefined, source) }
    catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : '模型启动失败，请检查网络和显存后重试。')
    }
  }

  return <div className="model-launcher">
    <div className="model-intro"><Cpu size={16} /><div><strong>让导师在你的电脑上运行</strong><p>免费开源模型 · 无 API 密钥 · 不上传对话</p></div></div>
    <label className="field-label" htmlFor="local-model">本地 AI 模型</label>
    <select id="local-model" className="model-select" value={model} disabled={busy} onChange={event => { setModel(event.target.value); save('codegrow-model-id', event.target.value) }}>
      {LOCAL_TUTOR_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <p className="model-help">4-bit 量化 · 预计显存需求约 {(selected.vramMB / 1024).toFixed(1)} GB；这是显存占用，不是下载大小。7B 通常回答更完整，1.5B 启动更轻。</p>
    <label className="field-label" htmlFor="model-source">模型下载来源</label>
    <select id="model-source" className="model-select" value={source} disabled={busy} onChange={event => { const value = event.target.value === 'mirror' ? 'mirror' : 'official'; setSource(value); save('codegrow-model-source', value) }}>
      <option value="official">Hugging Face 官方模型仓库</option>
      <option value="mirror">HF Mirror 社区镜像（第三方）</option>
    </select>
    <p className="model-help">首次需下载数百 MB 至数 GB 的模型资源，耗时取决于网络。以后可复用浏览器缓存，刷新后仍需重新加载到显存。{source === 'mirror' && '你选择了第三方镜像，其可用性和文件服务由第三方提供。'}</p>
    {gpu && <p className={`model-gpu ${gpu.supported ? '' : 'warning'}`}>{gpu.reason}</p>}
    <div className="model-actions">
      {loading ? <button className="secondary-button" onClick={cancelLocalTutorLoad}><Square size={13} />取消模型加载</button> : <button className="primary-button" disabled={state.status === 'generating' || gpu?.supported === false} onClick={() => void load()}><Download size={14} />{ready ? '重新加载所选模型' : '下载并启动本地 AI'}</button>}
      {ready && <button className="text-button" disabled={busy} onClick={() => { void unloadLocalTutor().catch(caught => setError(caught instanceof Error ? caught.message : '释放显存失败。')) }}>释放显存</button>}
    </div>
    {loading && <div className="model-progress" role="status"><span><LoaderCircle size={13} className="spin" />{state.text || '正在启动模型…'}</span><progress max={1} value={Math.max(0, Math.min(1, state.progress))} /><small>{Math.round(state.progress * 100)}%</small></div>}
    {ready && <p className="model-ready" role="status">本地 AI 已就绪{state.modelId ? ` · ${LOCAL_TUTOR_MODELS.find(item => item.id === state.modelId)?.name || state.modelId}` : ''}</p>}
    {(error || state.error) && <p className="model-error" role="alert">{error || state.error}</p>}
    <p className="model-help">需要支持 WebGPU 的 Chrome / Edge。模型由 Qwen 发布，采用 Apache 2.0 许可；回答可能有误，请运行代码验证。</p>
  </div>
}
