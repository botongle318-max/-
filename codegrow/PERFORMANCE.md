# CodeGrow v0.3 性能与缓存验证

## 修改前基线

基线提交：`1a36c46887e2295ed704e608d1dd88b3c682bb76`。2026-10-11，在 Linux Chromium 154.0.8037.57、隔离空浏览器上下文、1440×1000、无网络限速、本机 HTTP `/codegrow/` 生产构建测量。服务端未启用 gzip；下列 gzip 是 Node zlib 的离线体积，不是实际传输量。这不是中国大陆或 Windows RTX 5070 的测速。构建保留在临时目录，测量脚本以 `PERF_DIST` 切换前后构建。

| 阶段 | 修改前单次样本 |
| --- | ---: |
| 首页可用（含 SQLite 启动和首次保存） | 630 ms |
| 点击实验室到编辑器可用 | 542 ms |
| 首次真实 C 编译运行 | 886 ms |
| 同页重复运行三次 | 102 / 124 / 130 ms |
| 刷新到编辑器可用 | 865 ms |
| 刷新后持久缓存编译运行 | 840 ms |
| 编译器首次 / 刷新后网络请求 | 3 / 0 |

| 生产 JS | 修改前 raw / gzip（字节） |
| --- | ---: |
| 首页 index | 344887 / 112638 |
| Editor | 3639619 / 919782 |
| editor.worker | 280421 / 85965 |
| 主线程 WebLLM lib | 6038373 / 2139568 |
| tutor.worker WebLLM | 6025487 / 2136971 |

原实现并非无缓存：Editor 是 React.lazy，C/C++ 基础语言已单独引入；编译器 Cache Storage 在刷新后确实没有再下载 3 个大文件；同页成功运行已复用 WASM Module 和 sysroot。实际缺口是 cpp.contribution 间接引入广泛编辑器贡献依赖、两个不同 URL 的 WebLLM 大包重复加载、Clang/LLD 串行 WASM 编译、缓存异常处理不完整，以及 UI 无法区分缓存读取、校验、初始化和下载。取消／超时会安全终止 Worker，因此下次仍需从持久缓存重新初始化，这不是重新下载。

环境限制：`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium` 的 CDN 下载被云代理返回 HTTP 403 `Domain forbidden`，安装命令未通过。所有浏览器测试改用环境已有的系统 Chromium，未绕过网络或 TLS 策略。

原生产浏览器测试 50 项、SQLite 浏览器检查 13 项、单元测试 114 项、服务测试 17 项均通过。原有缓存已有工作，不能把新缓存功能当成从零提速。

## 最终结果（2026-10-13）

完整原始数据保存在 [performance-results.json](docs/performance-results.json)。同一 Chromium、相同测量脚本，对冻结的旧生产构建和最终构建分别做三个全新上下文测量；下面是中位数（热运行是九次中位数）。这些点击到可见完成的耗时包含 Playwright 等待／轮询与 UI，不是纯 CPU 编译时间。

| 未限速 localhost | 修改前 | 修改后 |
| --- | ---: | ---: |
| 首页可用（含数据库与保存） | 592 ms | 618 ms |
| 实验室编辑器可用 | 549 ms | 549 ms |
| 首次 C 运行 | 873 ms | 883 ms |
| 同页热运行 | 129 ms | 130 ms |
| 刷新到编辑器可用 | 858 ms | 900 ms |
| 刷新后持久缓存运行 | 838 ms | 866 ms |
| 首次 / 刷新后编译器网络请求 | 3 / 0 | 3 / 0 |

没有证据证明未限速本机的 CPU／整体启动显著变快，部分样本略慢。新的诊断和 UI 也有小幅成本；不能把体积减少翻译成实际下载提速百分比。初始 index JS 从 344887 增至 357463 字节，新增轻量诊断／状态代码，但首页仍不加载 Monaco 或大型 AI 运行时。

| 资源 | 修改前 raw / Node gzip 字节 | 修改后 raw / Node gzip 字节 |
| --- | ---: | ---: |
| Editor JS | 3639619 / 919782 | 2866794 / 724928 |
| Editor CSS | 145983 / 22686 | 93020 / 14691 |
| editor.worker | 280421 / 85965 | 280421 / 85965 |
| 主线程 WebLLM | 6038373 / 2139568 | 移除 |
| tutor.worker | 6025487 / 2136971 | 6024503 / 2137893 |

另做一次**明确的合成限速实验**：Chrome CDP 页面网络延迟 100 ms、下载／上传各 1048576 bytes/s，本机服务未 gzip，不编译 C／不加载模型。进入实验室到编辑器可用为 **4440 → 3373 ms**；这是人工限速单次样本，不是中国大陆真实网速或实际 Pages gzip 传输，不能外推百分比。

### 加载链路与计时边界

- 首页：index JS/CSS → SQL.js 本地 WASM + IndexedDB 读取 → 展示课程。没有 editor/model/compiler 后台预取。
- 编辑器：用户进入实验室 → Editor JS/CSS → 直接注册 C 词法／配置 → Monaco 挂载；只保留编辑器 Worker，不加载 TS/JSON/HTML/CSS 语言 Worker。`cpp.contribution` 的全贡献依赖与额外语法 chunk 请求已去除。
- C：用户运行／提前准备 → executor Worker → 并行缓存读取或下载 → 每个资源 SHA-256 → Clang/LLD 并行 WASM 编译 + sysroot 展开 → 独立 FS 复制 → 编译 → 链接 → 学生程序 WASM 编译 → 实例化与执行。成功后复用内存，失败／取消／超时终止 Worker，已持久化资源保留。
- AI：主动启动 → GPU 检查 → 一份 Worker JS → HF 配置、tokenizer 与 raw GitHub 推理库 → 权重缓存或下载 → 缓存读盘／显存上传 → shader 初始化 → 就绪后推理。下载、缓存上传和 shader 的百分比独立重置，不显示伪造的整体 100%。

Network Resource Timing 记录网络请求耗时；10-11 首份原始记录保留了浏览器产生的无效负 Worker timing；10-13 测量脚本将此类值标为 null，不用于耗时结论。CDP ScriptDuration 只反映主线程执行，不能精确隔离 JavaScript 解析，也不包含 AI Worker。旧版没有内部阶段计时，不能给它补造 SHA/WASM/GPU 数字。新版编译诊断区单独记录缓存读写、SHA、WASM、tar、FS、编译、链接、程序执行与主线程观测，重叠阶段不能相加。例如一个缓存样本资源准备 192 ms、C 编译与实例化 190 ms、链接 26 ms、Worker 总计 423 ms；不将这些当作旧版比较或硬件保证。

### 缓存安全与日常体验

`codegrow-compiler-v1` 保持原 Cache Storage 名称和 URL；同版本每次从持久缓存读取仍做 SHA-256，损坏条目只安全重取一次，新的坏网络响应不缓存、不执行。缓存权限、读取、删除异常可降级到验证后的网络内容；quota 写入失败明确提醒，当前页可运行，刷新可能再下载。故障后销毁 Worker，避免失败下载与马上重试并行重复下载。标准库每次运行仍隔离复制，未以共享可变文件换速度。

WebLLM 仍使用原生 `cache` 后端和原模型 URL。权重、配置、运行库缓存继续由 WebLLM 管理；官方／镜像来源按 URL 隔离。只读检查仅证明权重索引和分片键存在，不证明完整性、辅助资源齐全或离线 GPU 可用。“释放显存”与“取消加载”不删缓存。用户可查看网站存储配额并主动申请持久存储，浏览器可拒绝，未承诺永久保留。未改 IndexedDB 名称、版本、SQLite 格式或学习数据迁移。

### 测试结果与部署

`npm ci`、`prepare:compiler`、`npm test`（173）、`test:server`（17）、`build:site`、`test:e2e`（50 原流程 + 35 编译缓存 + 14 AI 生命周期，共 99）、`test:database`（13）均通过。生产资产检查验证 lazy Monaco 和单一大型 WebLLM Worker。AI 单元测试使用明确引擎夹具；AI 浏览器检查使用真实打包 Worker/WebLLM JS、假主线程适配器和微型缓存夹具，只证明取消／错误／缓存 URL 行为，不证明真实 GPU 推理或真实模型下载成功。无限循环终止、标准输入、真实 C 错误、数据导出、旧 version-1 学习快照和多轮对话保留均验证。

现有 `.github/workflows/deploy.yml` 未修改，仍在 master 发布到原网址；新增 `codegrow-checks.yml` 仅为开发分支／PR 验证 CodeGrow，不改根个人网站、不部署预览分支。合并后原 master 部署流程会继续执行，`base: './'`、同源 compiler 和 `/codegrow/` 路径不变。性能数据没有在中国大陆／Windows RTX 5070 实测；GPU、权重来源、运行库可达性和刷新后的真实模型缓存复用仍需按下节手动验证。

### 修改文件清单

- 编辑器与 UI：`src/components/Editor.tsx`、`editorSetup.ts`、`monaco-cpp.d.ts`、`EditorLoadBoundary.tsx`、`CompilerDiagnostics.tsx`、`src/pages/Lab.tsx`、`src/App.tsx`、`src/styles.css`、`src/tutor.css`。
- 执行器：`src/services/executor.ts`、`executorAssets.ts`、`executor.worker.ts`（原 SHA 清单未改）。
- 导师：`src/components/ModelLauncher.tsx`、`src/services/localTutor.ts`、`localTutorClient.ts`、`localTutorProtocol.ts`、`localTutorProgress.ts`、`localTutorWorker.ts`、`tutor.worker.ts`、`tutorError.ts`、`tutor.ts`（只拆共享错误类型，远程逻辑不变）。
- 构建／回归：`vite.config.ts`、`package.json`、`package-lock.json`、`tests/editor.test.ts`、`executor.test.ts`、`executorAssets.test.ts`、`localTutor.test.ts`、`localTutorWorker.test.ts`、`web.e2e.mjs`、`build-assets.mjs`、`compiler-cache.browser.mjs`、`local-ai.browser.mjs`、`performance.browser.mjs`、`../.github/workflows/codegrow-checks.yml`。
- 文档：`README.md`、`docs/LOCAL_AI.md`、本报告与 `docs/performance-results.json`。课程、学习服务、数据库及根个人网站源码未修改。

## 可复现命令

```sh
cd codegrow
npm ci
npm run prepare:compiler
npm test
npm run test:server
npm run build:site
npx playwright install chromium
npm run test:e2e
npm run test:database
node tests/performance.browser.mjs
PERF_THROTTLE=1 PERF_EDITOR_ONLY=1 PERF_LABEL=throttled npm run test:performance
```

可用 `CODEGROW_CHROMIUM_PATH` 指定已安装 Chromium；本环境实际使用 `/usr/bin/chromium`。性能脚本产出 `test-results/performance-current.json`，每次都创建全新上下文，真实编译同一段 Hello World，不加载 AI 模型。`PERF_LABEL=before|after` 区分产物，`PERF_DIST=/绝对路径/dist` 指定冻结构建。单次样本有噪声，应同机器重复、对比中位数；不要将 localhost 耗时推广为国内提速百分比。

## Windows / 中国大陆手动验证

1. 在原网址打开 DevTools Network，关闭“Disable cache”，保留日志，记录首页、进入实验室、首次运行、重复运行和刷新后运行。勿在日常学习浏览器“清除所有站点数据”；冷启动用独立测试配置文件。
2. Application → Cache Storage 查看 `codegrow-compiler-v1`。同版本原 URL 的 clang、lld、sysroot.tar 应复用。性能诊断中的缓存读取、SHA-256、WASM 初始化不应被解释为网络下载。取消／死循环后 Worker 重建可再次读取缓存。
3. 手动启动 1.5B 模型。分别观察权重域名（Hugging Face 或主动选定 HF Mirror）与推理库域名 raw.githubusercontent.com。镜像只替换权重域名，不能解决运行库请求。
4. 完成下载后刷新，再主动启动同一模型／同一来源：权重缓存与 GPU 就绪是两回事。显存上传和 shader 编译仍需耗时，已有缓存也可能因浏览器空间策略被回收。记录模型阶段、请求域名、错误原文、浏览器／驱动版本。
5. 验证 RTX 5070 硬件加速、`chrome://gpu` 或 `edge://gpu` 的 WebGPU、FP16 检测、显存竞争、生成速度；此云端无该显卡，无法实测模型下载或推理速度。

不添加 Service Worker 或后台模型预缓存。现有 HTTP 静态资源缓存、编译器 Cache Storage 和 WebLLM 缓存继续独立使用，不接管 IndexedDB，不改变 SQLite 数据格式或清理学习数据。未来 PWA 必须采用版本化 shell 与显式更新，不将模型放入自动预缓存。
