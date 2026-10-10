# Web MVP 架构

本次交付按最新要求采用电脑浏览器 Web 应用，原设计的 Electron、GCC 主进程执行和桌面 SQLite 已改为浏览器可部署方案。

```text
React pages + Monaco + Zustand
  ├─ curriculum.ts      静态微课与练习定义
  ├─ executor.ts        执行生命周期/超时/取消
  │    └─ Worker → Clang → LLD → WASI 程序
  ├─ database.ts        SQL.js SQLite → IndexedDB 字节持久化
  ├─ learning.ts        纯函数能力模型/难度规则
  └─ tutor.ts           本地规则或可选 HTTP 代理
                              └─ server/index.mjs → AI Provider
```

界面只依赖领域服务的类型接口。代码在 Worker 内执行，WASI 只接触虚拟文件系统，没有 shell 或主机文件权限。主线程管理运行超时，Worker 可终止，因此学生的无限循环不会冻结界面。

SQLite 负责学习状态；IndexedDB 存储的是完整 SQLite 数据库文件。数据写入顺序通过队列串行化，持久化失败回滚内存快照并向 UI 报错。课程内容与用户状态分离。

学习规则不由 LLM 直接修改。无证据的知识点保持未知；成绩结合提示成本估算掌握度，重复源码提交按 SHA-256 指纹去重。首版仅使用样例测试证据，迁移评分未提供。

提示策略在客户端和可选服务端校验；学生代码作为引用数据进入模型上下文。AI Provider URL 和密钥由服务端配置，客户端无法指定任意上游，模型输出作为普通文本和代码块渲染。

五阶段落地：项目骨架 → 完整 UI → 编辑/执行 → SQLite 记录 → 导师策略及 Provider 适配。后续可通过替换 executor/database 接口添加 Electron 主进程实现，不需要重写课程或页面。
