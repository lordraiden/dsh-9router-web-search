# 🌐 dsh-web-search-9router

> **为 DeepSeek Harness 提供由 9router 背书的网页搜索与抓取。**
> 将原生 `web_search` 与 `web_fetch` 工具接入 9router 的 `/v1/search` 与 `/v1/web/fetch` 端点 —— 无需服务端搜索工具。

[![Version](https://img.shields.io/badge/version-0.1.1-green)](https://github.com/lordraiden/dsh-web-search-9router/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![ESM](https://img.shields.io/badge/module-ESM-8e44ad)](https://nodejs.org/api/esm.html)
[![GitHub stars](https://img.shields.io/github/stars/lordraiden/dsh-web-search-9router?style=social)](https://github.com/lordraiden/dsh-web-search-9router)

[🇺🇸 English](./README.md) · 🇨🇳 **简体中文**

---

## ✨ 功能

- 🔎 **搜索 provider** — 将 DSH 原生 `web_search` 路由到 9router 的 `/v1/search`，返回去重后的 `WebSource` 结果（标题、摘要、发布日期）。
- 📄 **抓取 provider** — 将 DSH 原生 `web_fetch` 路由到 9router 的 `/v1/web/fetch`，返回干净的文本/Markdown 正文。
- 🎛️ **设置卡片** — 原生 DSH 设置面板，用于配置 API 密钥、基础地址、模型与限额。
- 🔐 **凭据感知** — 从 DSH 凭据服务（`NINE_ROUTER_API_KEY`）或字面配置值解析 API 密钥；绝不提交到仓库。
- 🧱 **零构建** — 纯 ESM，纯 JavaScript，无需打包器。

## 🧭 为什么需要它

DSH 默认的 `web_search` 使用 `web-search-deepseek` provider，它要求上游实现 Anthropic 的 `web_search_20250305` **服务端**搜索工具并返回 `web_search_tool_result` 块。

9router 是一个 **OpenAI 兼容网关**：它把该工具定义当作普通函数交给模型，*而不在服务端执行搜索* —— 因此它本身无法提供原生搜索。

| | `web-search-deepseek`（默认） | **9router（本插件）** |
|---|---|---|
| 依赖 | Anthropic `web_search_20250305` 服务端工具 | 任意 9router 兼容网关 |
| 支持 9router | ❌ | ✅ |
| 搜索端点 | 由模型提供 | `POST /v1/search` |
| 抓取端点 | 由模型提供 | `POST /v1/web/fetch` |

本插件直接调用 9router 自有的端点，并将其响应映射为 DSH web seam 所期望的 `WebSource` 与 `WebFetchBody` 类型。

## ⚙️ 工作原理

```text
 web_search / web_fetch（原生 DSH 工具）
            │
            ▼
        ctx.web seam
            │  provider = "9router"
            ▼
  dsh-web-search-9router
   ├── search  → POST {baseURL}/search      → WebSource[]
   └── fetch   → POST {baseURL}/web/fetch   → WebFetchBody
            │
            ▼
      9router gateway (9router)
```

错误会以机器可路由的 `WebError` 代码（`WEB_PROVIDER_ERROR`、`WEB_PROVIDER_CREDENTIAL_MISSING`、`WEB_ABORTED`）呈现，非 2xx 的抓取响应会作为结果返回 —— 绝不静默抛出。

## 🚀 快速开始

**1. 安装插件**

```bash
npx @deepseek-ai/dsh plugin --profile web add github:lordraiden/dsh-web-search-9router
```

**2. 接入配置**

- 在 profile 的 `cordis.patch.yml` 中，将 `searchProvider` 与 `fetchProvider` 设为 `9router`。
- 在 `~/.dsh/.credentials.yaml` 中保存 `NINE_ROUTER_API_KEY`，或在插件设置中设置字面 `apiKey`。

**3. 重启并刷新**

重启 Harness，然后强制刷新浏览器。web 设置卡片中会出现 `9router` 选项。

> 🔒 **可复现安装** — 追加 commit SHA 以锁定精确版本：
>
> ```bash
> npx @deepseek-ai/dsh plugin --profile web add github:lordraiden/dsh-web-search-9router#44d1936
> ```

## 🛠️ 配置

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `baseURL` | string | 9router 默认端点 | 你的 9router 兼容 API 的基础地址（同时支持 `NINE_ROUTER_BASE_URL` 环境变量） |
| `searchModel` | string | `search-combo` | 搜索端点使用的模型名 |
| `fetchModel` | string | `fetch-combo` | 抓取端点使用的模型名 |
| `searchType` | string | `web` | 发送到搜索端点的 `search_type` |
| `maxResults` | number | `8` | 每次搜索的最大来源数 |
| `timeoutMs` | number | `30000` | 每请求超时时间 |
| `apiKey` | secret | — | 字面 API 密钥（可选） |
| `apiKeyEnv` | credential-ref | `NINE_ROUTER_API_KEY` | 凭据服务的键名 |

## 🧪 开发

```bash
pnpm install   # 安装依赖
pnpm test      # 运行测试套件（node:test）
```

**仓库结构**

```text
dsh-web-search-9router/
├── src/index.js       # 插件入口：search + fetch provider
├── client.js          # 设置卡片
├── cordis.patch.yml   # 注册插件的 bundle patch
├── test/              # node --test 测试套件
└── package.json       # ESM 插件清单
```

## 🌱 生态与发布

- 📦 **分发** — GitHub 仓库是唯一的分发来源；稳定版本以 `v<version>` GitHub Releases 发布。
- 📚 **目录** — 已收录于 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
- 🐛 **问题与需求** — 请提交 [issue](https://github.com/lordraiden/dsh-web-search-9router/issues)。

## 📄 许可证

[MIT](./LICENSE)

## 🙏 致谢

本项目 fork 自 [rebron1900/dsh-web-search-9router](https://github.com/rebron1900/dsh-web-search-9router) —— 感谢原作者为 DeepSeek Harness（DSH）提供 9router 背书的网页搜索与抓取 provider。
