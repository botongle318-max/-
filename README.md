# React + TypeScript + Vite

## CodeGrow 编程私人导师

本仓库新增独立 Web MVP：[CodeGrow 文档](codegrow/README.md)。包括深色课程工作台、Monaco、浏览器 C 编译运行、SQLite 学习档案与免费本地 AI 私人导师。支持自由提问、多轮交流和逐步教学，模型由用户主动下载后在浏览器 GPU 上运行。

开发：`cd codegrow` → `npm ci` → `npm run prepare:compiler` → `npm run dev`。

GitHub Pages 部署后，CodeGrow 位于原站点的 `/codegrow/` 子目录；原有个人网站继续保留。CodeGrow 源码使用 MIT，详见 [许可证](codegrow/LICENSE)。

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
