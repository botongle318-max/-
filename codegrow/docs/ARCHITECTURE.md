# CodeGrow Web MVP 架构

CodeGrow 当前是电脑浏览器 Web 应用。原始桌面方案中的 Electron、主进程 GCC/G++ 和桌面 SQLite，已替换为可静态部署、浏览器本地优先的实现。

```text
React pages + Monaco + Zustand
  ├─ curriculum.ts          静态微课与练习定义
  ├─ executor.ts            编译/运行生命周期、输出、超时与取消
  │    └─ Web Worker → Clang → LLD → WASI 程序
  ├─ database.ts            SQL.js SQLite → IndexedDB 字节持久化
  ├─ learning.ts            学习证据、对话记录、能力模型与难度规则
  └─ tutor.ts               统一导师 Provider 接口
       ├─ tutorPrompt.ts     合同校验、固定教学原则、上下文预算
       ├─ localTutor.ts      默认：WebLLM Worker → Qwen2.5-Coder
       └─ HTTP Provider      可选：server/index.mjs → OpenAI-compatible API
```

页面只依赖领域服务和类型接口。默认导师完全在浏览器执行；切换到云端代理不会改变 `TutorPanel` 或学习记录的数据结构。

## 编辑、编译与运行

Monaco 负责 C 代码编辑。Clang、LLD 和 WASI 工具链在 Worker 中运行，学生程序只接触 WASI 虚拟文件系统，没有 shell 或主机文件权限。主线程管理阶段、输出、超时与取消；无限循环时可以终止 Worker，不会长期阻塞页面。

一次运行开始时会捕获代码、标准输入和学生对“本次练习由我独立完成”的选择。只有使用课程样例输入的运行才形成课程评分证据；源码与输入使用 SHA-256 指纹去重。传给导师的错误和输出必须来自与编辑器当前代码完全相同的最近一次运行，避免模型把旧结果误认为当前结果。

## 数据与学习证据

SQL.js 在内存中维护 SQLite，完整数据库字节保存到 IndexedDB。写入通过队列串行化；持久化失败时回滚内存快照并向 UI 报错。课程定义与用户状态分离，设置页可以导出 `.sqlite` 备份。

学习规则不由模型直接修改。普通聊天不会自动创建练习尝试、提示事件或降低独立性；独立性由学生在运行前主动勾选。旧版 `hintLevel` 和 `hints` 字段继续保留，只用于兼容已有 version-1 数据和旧统计，新导师不再产生这些记录。掌握度仍以真实运行结果为主要证据；首版只检查课程样例，不能等同于完整测试覆盖或迁移能力证明。

导师使用全局聊天键 `private-mentor`。SQLite 最多保存最近 20 轮完整的用户/导师问答，且只保存成功完成的消息对；取消或失败时不留下半条记录。页面导航和浏览器刷新后可以恢复对话，用户也可以单独清空导师会话而保留课程与练习记录。

## 默认浏览器本地 AI

默认 Provider 是 WebLLM 驱动的 Qwen2.5-Coder，不需要 API 密钥：

- 推荐 Qwen2.5-Coder 7B `q4f16`，预计约 5.0 GB 显存；
- 轻量选择为 1.5B `q4f16`，预计约 1.6 GB 显存；
- 不支持 `shader-f16` 的 GPU 会使用对应 `q4f32` 兼容模型。

组件挂载不会下载权重。学生必须明确点击“下载并启动本地 AI”，系统才检查 WebGPU、从受支持的固定模型目录下载资源并创建独立推理 Worker。模型文件可复用浏览器缓存；刷新后仍需重新加载到显存。加载和生成均可取消，取消或超时会终止 Worker 并释放当前引擎资源。具体要求见[本地 AI 使用与排障](LOCAL_AI.md)。

本地模型上下文窗口固定为 4096 tokens，回复最多 512 tokens。`tutorPrompt.ts` 使用保守的 UTF-8 字节预算：保留学生当前问题，只选取近期对话，并依次压缩较长的错误、输出和代码。被截断的代码会在上下文中标记；本地问题超过 2,000 字符或整体仍超预算时，明确要求学生拆成多个问题，不静默截断当前问题。

系统提示要求模型先回答学生真正提出的问题，结合前文和“没听懂”等反馈调整解释，需要时可以给 C 代码示例，并在末尾提供一个可执行的下一步。不再存在教学模式、L1–L4 提示门槛或 canned fallback。回复仅作为文本或代码块渲染，绝不自动写入 Monaco。

## 可选云端 Provider

`server/index.mjs` 保留为可选 OpenAI-compatible 代理。它不随静态网站托管，也不是本地 AI 的依赖。浏览器只知道代理地址，不接触供应商 API 密钥；学生不能通过请求指定上游 URL、模型或密钥。

浏览器发送的合同为：

```ts
interface TutorRequest {
  message: string                    // 非空，最多 4,000 字符
  code: string                       // 最多 20,000 字符
  lessonTitle: string                // 最多 200 字符
  history?: Array<{
    role: 'user' | 'assistant'
    content: string                  // 每条最多 6,000 字符
  }>                                 // 最多 12 条，总计最多 24,000 字符
  lastError?: string                 // 最多 4,000 字符
  output?: string                    // 最多 4,000 字符
}
```

未知字段会被拒绝，请求体最多 192 KiB。客户端超时为 35 秒，代理到上游的超时为 30 秒，上游响应体限制为 64 KiB。代理只接受固定合同，将历史作为真实的 `user` / `assistant` 消息放在固定 system prompt 与最新问题上下文之间；历史、学生代码、错误和输出仍明确标记为不可信资料。成功响应必须是 `{ content: string, source: 'ai' }`，否则前端显示错误，不会降级成伪造的本地回答。

上游基础 URL 必须是 HTTPS，只有 loopback 可使用 HTTP；禁止 URL 凭据、查询参数、片段和重定向。CORS 使用精确 Origin 白名单，供应商密钥只存在服务端。若部署到公网，还必须另行提供托管、入口 HTTPS、用户认证、额度/并发限制和日志脱敏；CORS 不是认证机制。

## 验证与已知边界

自动测试分三层：纯函数单元测试验证请求合同、上下文预算、学习规则和对话裁剪；WebLLM mock 验证模型选择、流式输出、取消、超时和 Worker 清理；浏览器 fixture 验证编辑器不被模型回复改写、会话跨导航/刷新恢复，以及 SQLite 中保存的真实问答与独立性证据。可选代理另有 CORS、TLS URL、请求限额、上游错误和超时测试。

这些自动测试没有证明云开发环境中完成过真实 Qwen2.5-Coder 7B 推理。模型权重下载、WebGPU 驱动兼容、实际显存峰值和生成速度都依赖用户设备与网络，仍需在目标 Chrome / Edge、7B/1.5B 和不同 GPU 上做人工验收。模型回答也可能有误，学生应通过编译、运行和测试验证建议。

后续仍可通过替换 executor、database 或 tutor Provider 接口增加 Electron 主进程、本地原生编译器或受认证的远程服务，而无需重写课程页面和核心学习数据模型。
