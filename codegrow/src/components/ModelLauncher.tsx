import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Cpu, Download, LoaderCircle, Square } from 'lucide-react'
import { LOCAL_TUTOR_MODELS, DEFAULT_LOCAL_MODEL_ID, LOCAL_TUTOR_PHASE_LABELS, checkGpuSupport, checkLocalModelCache, diagnoseModelNetwork, subscribeLocalTutor, getLocalTutorState, loadLocalTutor, cancelLocalTutorLoad, unloadLocalTutor, type ModelNetworkDiagnostic } from '../services/localTutor'
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
  const [inspection, setInspection] = useState<'cache' | 'network' | null>(null)
  const [cached, setCached] = useState<boolean | null>(null)
  const [network, setNetwork] = useState<ModelNetworkDiagnostic[] | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [storage, setStorage] = useState<StorageEstimate | null>(null)
  const [persistent, setPersistent] = useState<string | null>(null)
  const inspectionVersion = useRef(0)
  const loading = state.status === 'checking' || state.status === 'loading'
  const busy = loading || state.status === 'generating'
  const ready = state.status === 'ready' || state.status === 'generating'
  const selected = LOCAL_TUTOR_MODELS.find(item => item.id === model)!

  useEffect(() => {
    let active = true
    checkGpuSupport().then(result => { if (active) setGpu(result) }).catch(() => { if (active) setGpu({ supported: false, reason: '无法检测 GPU。请使用最新版 Chrome / Edge，并开启硬件加速。' }) })
    return () => { active = false; inspectionVersion.current += 1 }
  }, [])

  useEffect(() => {
    inspectionVersion.current += 1; setCached(null); setNetwork(null); setInspection(null)
  }, [model, source])
  useEffect(() => {
    if (!loading) return
    const start = Date.now(); setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [loading])

  async function inspect(kind: 'cache' | 'network') {
    const current = ++inspectionVersion.current
    setInspection(kind); setError('')
    try {
      if (kind === 'cache') {
        const value = await checkLocalModelCache(model, source)
        if (current === inspectionVersion.current) setCached(value)
        const estimate = await navigator.storage?.estimate().catch(() => undefined)
        if (current === inspectionVersion.current && estimate) setStorage(estimate)
      } else {
        const value = await diagnoseModelNetwork(model, source)
        if (current === inspectionVersion.current) setNetwork(value)
      }
    } catch (caught) { if (current === inspectionVersion.current) setError(caught instanceof Error ? caught.message : '检查失败，请重试。') }
    finally { if (current === inspectionVersion.current) setInspection(null) }
  }

  async function requestPersistence() {
    try {
      const granted = await navigator.storage?.persist()
      setPersistent(granted ? '浏览器已允许持久存储，降低自动回收概率；手动清除仍会删除数据。' : '浏览器未授予持久存储；缓存仍可使用，但可能被系统回收。')
    } catch { setPersistent('当前浏览器无法申请持久存储；请定期导出学习档案。') }
  }

  function save(key: string, value: string) {
    try { localStorage.setItem(key, value); setError('') }
    catch { setError('浏览器无法保存模型设置，本次选择仍可使用。') }
  }

  async function load() {
    setError('')
    try { await loadLocalTutor(model, undefined, source) }
    catch (caught) {
      if (!(caught instanceof Error && caught.name === 'AbortError')) setError(getLocalTutorState().error || (caught instanceof Error ? caught.message : '模型启动失败，请检查网络和显存后重试。'))
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
    <p className="model-help">权重：{source === 'mirror' ? 'hf-mirror.com' : 'huggingface.co'}；运行库：raw.githubusercontent.com。切换镜像不会加速运行库；两种权重来源的 URL 缓存相互独立，切换后可能重新下载。</p>
    {gpu && <p className={`model-gpu ${gpu.supported ? '' : 'warning'}`}>{gpu.reason}</p>}
    <div className="model-actions">
      {loading ? <button className="secondary-button" onClick={cancelLocalTutorLoad}><Square size={13} />取消模型加载</button> : <button className="primary-button" disabled={state.status === 'generating' || gpu?.supported === false || inspection !== null} onClick={() => void load()}><Download size={14} />{ready ? '重新加载所选模型' : cached ? '从缓存启动本地 AI' : '下载并启动本地 AI'}</button>}
      {ready && <button className="text-button" disabled={busy} onClick={() => { void unloadLocalTutor().catch(caught => setError(caught instanceof Error ? caught.message : '释放显存失败。')) }}>释放显存</button>}
    </div>
    {loading && <div className="model-progress" role="status"><strong>{state.phase ? LOCAL_TUTOR_PHASE_LABELS[state.phase] : '正在启动模型'} · 已等待 {elapsed} 秒</strong><span><LoaderCircle size={13} className="spin" />{state.text || '正在启动模型…'}</span><progress max={1} value={state.phaseProgress} /><small>{state.phaseProgress !== undefined ? `本阶段 ${Math.round(state.phaseProgress * 100)}%` : '处理中'}</small><span>阶段百分比不是总进度；即使下载完成，仍需要装入显存和编译着色器。</span></div>}
    {ready && <p className="model-ready" role="status">本地 AI 已就绪{state.modelId ? ` · ${LOCAL_TUTOR_MODELS.find(item => item.id === state.modelId)?.name || state.modelId}` : ''}</p>}
    {(error || state.error) && <p className="model-error" role="alert">{error || state.error}</p>}
    <details className="model-diagnostics"><summary>缓存与网络诊断（按需检查）</summary>
      <p className="model-help">检查会按需加载 AI 引擎 JavaScript，但不会下载模型权重或占用显存。网络诊断只请求小配置与运行库 HEAD，不测量真实分片下载速度。</p>
      <div className="model-actions"><button className="secondary-button" disabled={busy || inspection !== null} onClick={() => void inspect('cache')}>检查所选模型缓存</button><button className="secondary-button" disabled={busy || inspection !== null} onClick={() => void inspect('network')}>诊断两个下载来源</button></div>
      {inspection && <p className="model-help" role="status">正在{inspection === 'cache' ? '检查缓存' : '诊断来源'}，请稍候…</p>}
      {cached !== null && <p className="model-help" role="status">{cached ? '所选来源的权重索引与全部分片已缓存。仍需读取配置、分词器、运行库并初始化 GPU；本检查不校验完整性或证明可以离线启动。' : '所选来源的权重未完整缓存；启动时需下载缺少的资源。不会清理已有模型或学习数据。'}</p>}
      {storage && <p className="model-help">此网站存储已用约 {((storage.usage || 0) / 1024 ** 3).toFixed(2)} GB / 浏览器允许约 {((storage.quota || 0) / 1024 ** 3).toFixed(2)} GB（学习数据与资源缓存共享配额；不是显存或真实磁盘剩余空间）。</p>}
      <button className="text-button" onClick={() => void requestPersistence()}>申请保留网站存储（可选）</button>
      {persistent && <p className="model-help" role="status">{persistent}</p>}
      {network?.map(result => <p className={`model-help ${result.ok ? '' : 'warning'}`} key={result.url}>{result.label} · {result.durationMs} ms · {result.detail}</p>)}
      <p className="model-help">若提示存储配额不足，可导出学习档案后，在浏览器设置中检查可用磁盘空间；不要使用“清除全部网站数据”，它也会删除学习记录。缓存属于浏览器管理的可回收存储，不能保证永久保留。</p>
    </details>
    <p className="model-help">需要支持 WebGPU 的 Chrome / Edge。模型由 Qwen 发布，采用 Apache 2.0 许可；回答可能有误，请运行代码验证。</p>
  </div>
}
