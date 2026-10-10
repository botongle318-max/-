# CodeGrow

> 不替你写代码，而是培养你成为程序员。

CodeGrow 是面向编程零基础大学生的开源编程学习工作台。这个 MVP 是可以在电脑浏览器中打开的 **Web 应用**：React、TypeScript、Monaco、真实 C 编译运行、本地 SQLite 学习记录与分级教学提示。

项目位于本仓库的 `codegrow/`，原有个人网站继续保留。部署工作流把本应用发布到 GitHub Pages 的 `/codegrow/` 子目录。

![CodeGrow 学习首页](docs/dashboard.png)

![CodeGrow 三栏编程教室](docs/lab.png)

## 已实现

- 深色 Dashboard：今日计划、真实练习统计、学习路线、课程搜索。
- 11 个 C 语言模块的课程树，9 节可完成的微课与练习。指针、结构体、文件操作标记为后续内容。
- 本地打包的 Monaco Editor：C 语法高亮、草稿保存、`Ctrl + Enter` 运行。
- Clang + LLD + WASI 的真实浏览器编译执行：标准输入、输出、语法错误、取消、运行超时和样例测试。执行器也预留了 C++ 接口；完整 C++ 课程尚未提供。
- SQL.js SQLite 数据库，数据库字节通过 IndexedDB 保存；支持刷新恢复、导出 `.sqlite` 和二次确认重置。
- 学习档案：掌握度估算、独立完成率、提示记录、错误记录、难度建议。同源码与输入的重复运行按指纹去重。
- 引导、陪练、挑战、纠错四种策略，以及 L1–L4 提示。
- **默认是明确标注的本地规则导师**。可选 Node 服务支持 OpenAI 兼容模型 API；没有配置密钥时不会假装已连接真实 AI。

## 在 Windows / macOS / Linux 开发

需要 Node.js 24 LTS、npm 和 curl。Windows 10/11 自带 curl；不需要安装 Electron 或本地 GCC。

```bash
cd codegrow
npm ci
npm run prepare:compiler
npm run dev
```

终端会显示本地开发地址，默认端口为 5174。电脑浏览器打开它即可。

`prepare:compiler` 首次通过 HTTPS 下载约 58 MiB 的编译工具并校验固定 SHA-256；再次运行只验证已存在的资源。编译工具不提交进 Git。准备完成后，开发和生产都默认使用同源的 `compiler/` 资源。没有准备时，开发版使用固定 CDN 回退。

## 构建网页

```bash
npm run build:site
npm run preview
```

将 `dist/` 整个目录部署到静态服务器，必须保留 `compiler/` 和 `sql-wasm.wasm`。使用相对资源地址与 Hash 路由，可部署到域名子目录。发布版的核心编辑、课程与执行不依赖外部 AI 服务；首次打开仍需下载站点资源，MVP 暂未实现离线启动的 Service Worker。

## 测试

```bash
npm test
npm run test:server
npx playwright install chromium
npm run build:site
npm run test:e2e
npm run test:database
```

Linux CI 可用 `npx playwright install --with-deps chromium` 安装浏览器依赖。已有 Chromium 时可设置 `CODEGROW_CHROMIUM_PATH`。

生产浏览器测试在独立浏览器上下文与 `/codegrow/` 子目录执行，覆盖真实 C 编译、提示等级、SQLite 重启恢复、数据导出、错误/超时、自定义输入不计分、重复提交去重、搜索及 1024px 布局。测试不会操作用户已有学习数据。

## 接入真实 AI

参见 [AI 服务配置](docs/AI.md)。将密钥保存在服务端环境变量，启动 `npm run ai:server`，在页面「偏好设置」填写代理地址。前端不会收集 API 密钥。

GitHub Pages 只能托管静态网页，不能运行 Node 服务。在线使用真实 AI 需要单独部署代理并配置精确的 CORS 来源。没有代理时，本地规则导师、课程、编译和档案仍可使用。

## 项目结构

```text
src/
  components/        Monaco 与可复用 UI
  data/              版本化课程内容
  pages/             课程、实验室、学习档案、设置
  services/          执行器、SQLite、学习规则、导师适配层
  stores/            Zustand 导航与会话状态
server/              可选 AI 代理，密钥仅存在服务端
scripts/             本地资源准备
tests/               单元、服务端与浏览器测试
resources/licenses/  第三方许可文本
```

## MVP 的边界

本版使用 C11 / Clang 8.0.1 浏览器工具链，不能调用电脑上的 GCC，也不能访问本机文件。编译/链接各限制 90 秒，程序运行默认 3 秒，WASM 内存上限 64 MiB，输出上限 64 KB。该历史工具链适合基础教学，不承诺现代完整 C++ 标准支持。

练习按课程样例输出检查，通过样例不等于覆盖全部边界，也不证明学生已完全掌握知识。自定义输入、停止与工具环境故障不进入课程评分。掌握度是依据练习和提示计算的可解释估算；迁移练习、项目模式和完整 C++ 路线留待下一版本。

学习数据属于当前网站地址和浏览器；无痕模式、清除网站数据或浏览器存储回收可能删除记录，建议定期导出。学习时长按 15 秒周期估算活跃时间。

## 开源与发布

CodeGrow 自写源码使用 [MIT](LICENSE)。第三方依赖和编译资源保留各自许可证，见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。此许可证不改变仓库中原有个人网站的许可状态。

推送到 `master` 后，仓库的 `Deploy to GitHub Pages` 工作流测试、构建并发布原网站与 CodeGrow。`build` 与 `deploy` 独立：测试通过的网页产物保存在 Actions 的 `github-pages` artifact，部署失败不会丢失产物。

首次发布需仓库管理员打开 [Settings → Pages](https://github.com/botongle318-max/-/settings/pages)，在 **Build and deployment → Source** 选择 **GitHub Actions**，然后在 Actions 重跑失败的部署任务。工作流的默认 `GITHUB_TOKEN` 不能自动首次启用 Pages，不需要为此添加高权限密钥。成功后，CodeGrow 地址为 `https://botongle318-max.github.io/-/codegrow/`；未启用前该地址会返回 404。

若仓库为私有，请在 GitHub 设置中调整为公开，才能公开访问源码；添加许可证本身不会改变仓库可见性。
