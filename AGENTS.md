# dsh-web-search-9router

## 项目概述

- **描述**：为 DeepSeek Harness（DSH）提供 9router 背书的网页搜索与抓取 provider，接入 `ctx.web`。把原生 `web_search` / `web_fetch` 工具接到 9router 的 `/v1/search` 与 `/v1/web/fetch` 端点。
- **技术栈**：Node.js（ESM）、cordis 插件、`@deepseek-ai/dsh-web` web seam、schemastery 配置。
- **运行时**：Node 20+（与 DSH 要求一致）。
- **仓库地址**：internal（本地 profile 以 `link:` 依赖引入）。

## 目录结构

```text
dsh-web-search-9router/
├── src/index.js       # 插件入口：search + fetch provider
├── test/              # 测试（node --test）
├── package.json       # ESM 插件清单
├── AGENTS.md
├── .gitignore
└── README.md
```

## 环境与依赖

- 包管理器：pnpm
- 环境变量：`NINE_ROUTER_API_KEY`（9router API 密钥，可选，经 credentials 服务解析）、`NINE_ROUTER_BASE_URL`（可选，覆盖默认端点）
- 安装命令：`pnpm install`
- 本地启动：由 DSH profile 加载，无需独立启动

## 接入方式

1. 在 DSH profile 的 `package.json` dependencies 中加入本包：`"dsh-web-search-9router": "link:/home/rebron1900/workspace/projects/active/dsh-web-search-9router"`。
2. 在 profile 的 `dsh.profile.bundles` 中加入 `"dsh-web-search-9router"`。
3. 插件的 `cordis.patch.yml` 已把 `web` 的 `searchProvider` 和 `fetchProvider` 固定为 `9router`，无需手动接入；也不需要禁用 `web-search-deepseek`。
4. 如果你的 9router 实例需要密钥，在 `~/.dsh/.credentials.yaml` 中存 `NINE_ROUTER_API_KEY`；或在本插件 settings 段设置字面 `apiKey`。密钥可选，无密钥实例开箱即用。
5. 重启 `dsh web` 后生效。禁用 `web-search-deepseek` 会按设计隐藏它的设置卡片。

## 代码规范

- 纯 ESM，`type: module`，无构建步骤。
- 插件导出 `name` / `inject` / `Config` / `apply`。
- provider 通过 `ctx.web.registerSearchProvider` / `ctx.web.registerFetchProvider` 注册。
- 错误统一用 `@deepseek-ai/dsh-web` 的 `WebError`，机器可路由 code。
- 不提交密钥、token 或本地环境文件。

## 命名约定

- 插件 id：`9router`；cordis 插件名：`web-search-9router`。
- 配置键、变量、函数：小驼峰。

## Git 规范

- 默认分支：`main`
- 分支命名：`feature/<name>`、`fix/<name>`
- Commit：Conventional Commits（feat/fix/chore/docs/test）
- 提交前执行：`pnpm test`

## 测试

- 测试框架：node:test
- 执行命令：`pnpm test`
- 覆盖范围：`mapSearchResponse` / `mapFetchResponse` 的响应解析与容错、重试与可选认证行为、设置卡片。

## CodeGraph

- 状态：未使用

## 常用命令

```bash
pnpm install
pnpm test
```

## 发布与目录收录

- GitHub 仓库是唯一分发源，不发布 npm 包；每次版本提交并推送到 `main` 后，由 Agent 检查 GitHub 仓库和版本，再向 `rebron1900/awesome-dsh-plugin` fork 推送同步分支，并向 `awesome-dsh-plugin/awesome-dsh-plugin` 创建或更新目录 PR。
- 稳定版本可通过匹配的 `v<version>` tag 创建 GitHub Release；目录收录不以 npm 发布为前置条件。
- 目录 PR 只修改 `data/plugins/rebron1900__dsh-web-search-9router.yml` 及上游要求的生成文件；README 不手工编辑。
- 创建目录 PR 前检查仓库提交、`dsh-plugin` topic、`dsh.bundle` 和 GitHub 版本；使用本机已登录的 GitHub CLI 凭据，不把 GitHub token 写入仓库。

## 其他规则
- 禁止反向测试和反向注释,不做的事情不用说出来
