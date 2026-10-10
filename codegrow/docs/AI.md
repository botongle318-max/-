# CodeGrow 导师接入

网页默认使用**本地规则导师**，它不调用大模型，不需要密钥，也不会向外发送代码。回复明确标记“本地练习导师”。它能够提供四种教学模式和四级提示，适合体验教学流程，但不能替代真正的代码语义分析。

## 可选 AI 服务

`server/index.mjs` 是无需额外依赖的 Node.js 服务，要求 Node.js 22 或更新版本。密钥只保存在服务端环境变量中。服务调用 OpenAI 兼容的 `chat/completions` 接口，网页不直接调用模型。

在 `codegrow` 目录中复制 `server/.env.example` 为 `server/.env`，填入自己的服务配置。不要提交 `server/.env`，也不要把密钥写进任何 `VITE_*` 环境变量。

```sh
node --env-file=server/.env server/index.mjs
```

服务默认绑定本机 `127.0.0.1:8787`，健康检查为 `http://127.0.0.1:8787/health`。前端 `npm run dev` 默认运行在 `http://localhost:5174`，已在默认 CORS 白名单内。在网页设置中配置导师服务地址 `http://127.0.0.1:8787`。地址也可以是自行部署的 HTTPS 服务，例如 `https://tutor.example.com`；系统会请求其 `/v1/tutor` 路径。

网页将地址保存在 `localStorage` 的 `codegrow-ai-endpoint` 项下。HTTPS 网页访问本机 HTTP 服务时，浏览器可能要求授予本地网络访问权限；若浏览器阻止该请求，可使用本地开发网页，或为导师服务配置 HTTPS。

### 服务端配置

| 变量 | 说明 |
| --- | --- |
| `AI_API_KEY` | 模型服务端密钥，未配置时返回 503，网页使用本地引导 |
| `AI_BASE_URL` | OpenAI 兼容 API 基础路径，默认 `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称，默认 `gpt-4o-mini`，需使用供应商实际支持的名称 |
| `HOST` / `PORT` | 监听地址及端口，默认 `127.0.0.1` / `8787` |
| `CODEGROW_ALLOWED_ORIGINS` | 允许访问的网页 Origin，用英文逗号分隔，不接受通配符 |

模型 API 基础地址只从服务端配置读取，学生请求不能指定上游 URL、模型或密钥。默认保留 TLS 校验，不跟随重定向；HTTP 仅允许本机模型服务。公开部署时，需要在自己的网关上添加认证、用户配额与 HTTPS；CORS 来源限制不能代替认证。不要将没有认证的服务直接暴露到公网。

## 接口

`POST /v1/tutor`，`Content-Type: application/json`：

```json
{
  "message": "循环为什么没有结束？",
  "code": "int i = 0; while (i < 3) { printf(\"%d\", i); }",
  "lessonTitle": "while 循环",
  "hintLevel": 2,
  "mode": "debug",
  "lastError": "运行超时",
  "hints": ["追踪变量的变化", "检查循环变量的更新"],
  "permitReference": false
}
```

成功回复：

```json
{ "content": "检查每轮循环结束后 i 是否发生变化……", "source": "ai" }
```

模式为 `guide`、`practice`、`challenge`、`debug`。提示等级为 1–4；L4 必须有 `permitReference: true` 或学生明确请求参考代码，否则服务与前端都会降为 L3。L1–L3 的模型回复如果包含代码块或完整 C 程序，会被拒绝并回退至本地引导。服务不执行代码、不修改编辑器、不宣称更新学习掌握度。

请求体上限 64 KB，代码上限 20,000 字符，问题上限 2,000 字符，同一来源地址每分钟最多 30 次请求，上游超时 30 秒。常见错误使用结构化 `error.code` 返回：`INVALID_REQUEST`、`ORIGIN_NOT_ALLOWED`、`AI_NOT_CONFIGURED`、`AI_AUTH_FAILED`、`AI_RATE_LIMITED`、`AI_TIMEOUT`、`TEACHING_POLICY`。网页取消请求会停止等待；服务失败时页面明确说明当前使用本地引导。

## 数据与教学边界

启用 AI 后，每次提问会发送当前问题、代码、课程标题、当前等级对应的课程提示，以及最近一次错误。不会发送其他本地学习记录。请勿把密钥或个人敏感信息写进练习代码。聊天内容作为普通文本显示，不自动执行模型建议，也不自动插入参考答案。
