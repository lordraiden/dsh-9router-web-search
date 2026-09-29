# 🌐 dsh-web-search-9router

> **Web search & fetch for DeepSeek Harness, powered by 9router.**
> Wires the native `web_search` and `web_fetch` tools into 9router's `/v1/search` and `/v1/web/fetch` endpoints — no server-side search tool required.

[![Version](https://img.shields.io/badge/version-0.2.3-green)](https://github.com/lordraiden/dsh-web-search-9router/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![ESM](https://img.shields.io/badge/module-ESM-8e44ad)](https://nodejs.org/api/esm.html)
[![GitHub stars](https://img.shields.io/github/stars/lordraiden/dsh-web-search-9router?style=social)](https://github.com/lordraiden/dsh-web-search-9router)

🇺🇸 **English** · [🇨🇳 简体中文](./README.zh-CN.md)

---

## ✨ What it does

- 🔎 **Search provider** — routes DSH's native `web_search` through 9router's `/v1/search`, returning deduplicated `WebSource` results (title, snippet, published date).
- 📄 **Fetch provider** — routes DSH's native `web_fetch` through 9router's `/v1/web/fetch`, returning clean text/markdown bodies.
- 🎛️ **Settings card** — a native DSH settings panel for the API key, base URL, models, timeouts, and limits.
- 🧩 **Zero-config wiring** — the bundle patch pins the web seam's search and fetch to `9router`; no manual provider configuration.
- 🔐 **Credentials-aware, key-optional** — resolves the API key from DSH's credentials service (`NINE_ROUTER_API_KEY`) or a literal config value; keyless local 9router instances work out of the box; never committed to the repo.
- 🧱 **Zero build** — pure ESM, plain JavaScript, no bundler required.

## 🧭 Why this plugin

DSH's default `web_search` uses the `web-search-deepseek` provider, which requires the upstream service to implement Anthropic's `web_search_20250305` **server-side** search tool and return `web_search_tool_result` blocks.

9router is an **OpenAI-compatible gateway**: it passes that tool definition to the model as a regular function *instead of executing searches server-side* — so it cannot provide native search by itself.

| | `web-search-deepseek` (default) | **9router (this plugin)** |
|---|---|---|
| Requires | Anthropic `web_search_20250305` server-side tool | Any 9router-compatible gateway |
| Works with 9router | ❌ | ✅ |
| Search endpoint | model-provided | `POST /v1/search` |
| Fetch endpoint | model-provided | `POST /v1/web/fetch` |

This plugin calls 9router's own endpoints directly and maps their responses to the `WebSource` and `WebFetchBody` types expected by the DSH web seam.

## ⚙️ How it works

```text
 web_search / web_fetch (native DSH tools)
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

Errors surface as machine-routable `WebError` codes (`WEB_PROVIDER_ERROR`, `WEB_ABORTED`); transient network and 5xx failures are retried with backoff; non-2xx fetch responses come back as results — never silent throws.

## 🚀 Quick start

**1. Install the plugin**

```bash
npx @deepseek-ai/dsh plugin --profile web add github:lordraiden/dsh-web-search-9router
```

**2. Wire it up**

- The plugin's bundle patch already pins `web.searchProvider` and `web.fetchProvider` to `9router` — no manual wiring needed (a profile's own `cordis.patch.yml` can override the row).
- Set a `baseURL` in the settings card (or a `NINE_ROUTER_BASE_URL` environment value) pointing at your 9router gateway — there is no implicit fallback endpoint; without a configured endpoint the provider reports itself unavailable.
- If your 9router instance requires a key, store it in `~/.dsh/.credentials.yaml` as `NINE_ROUTER_API_KEY`, or set a literal `apiKey` in the plugin settings. Keyless instances work without any credential.

**3. Restart & refresh**

Restart Harness, then hard-refresh the browser. The `9router` options appear in the web settings card.

> 🔒 **Reproducible installs** — append a commit SHA to pin an exact version:
>
> ```bash
> npx @deepseek-ai/dsh plugin --profile web add github:lordraiden/dsh-web-search-9router#44d1936
> ```

## 🛠️ Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `baseURL` | string | — | Base URL of your 9router-compatible API (http/https only); resolved as explicit setting → `NINE_ROUTER_BASE_URL` env → absent (provider unavailable) |
| `searchModel` | string | `search-combo` | Model name for the search endpoint |
| `fetchModel` | string | `fetch-combo` | Model name for the fetch endpoint |
| `searchType` | string | `web` | `search_type` sent to the search endpoint |
| `defaultMaxResults` | number | `8` | Source cap used only when a search request does not specify `maxResults` (the DSH seam enforces the per-operation limit) |
| `timeoutMs` | number | `30000` | Shared per-request timeout (per-capability defaults) |
| `searchTimeoutMs` | number | `30000` | Search-only timeout; blank follows `timeoutMs` |
| `fetchTimeoutMs` | number | `30000` | Fetch-only timeout; blank follows `timeoutMs` |
| `fetchFormat` | string | `markdown` | Body format requested from the fetch endpoint (`markdown`, `text`, `html`) |
| `maxCharacters` | number | `50000` | Character cap for fetched bodies; sent to the gateway and enforced locally |
| `apiKey` | secret | — | Literal API key (optional; no key = no `Authorization` header) |
| `apiKeyEnv` | credential-ref | `NINE_ROUTER_API_KEY` | Credentials-service key name |

Self-hosted 9router picks its search and fetch backends from its own provider configuration and ignores `searchModel`/`fetchModel`; keep those fields set for cloud gateways that route by model.

**Endpoint precedence** — an explicit `baseURL` setting wins over the `NINE_ROUTER_BASE_URL` environment value; with neither set, no endpoint exists and the providers report themselves unavailable. There is no silent fallback to a repository-chosen remote. The schema rejects non-http(s) URLs, empty model/format strings, and non-positive numeric limits before any request is made.

## 🧪 Development

```bash
pnpm install   # install dependencies
pnpm test      # run the test suite (node:test)
```

**Repository layout**

```text
dsh-web-search-9router/
├── src/index.js       # plugin entry: search + fetch providers
├── client.js          # settings card
├── cordis.patch.yml   # bundle patch registering the plugin
├── test/              # node --test suite
└── package.json       # ESM plugin manifest
```

## 🌱 Ecosystem & releases

- 📦 **Distribution** — the GitHub repository is the only distribution source; stable versions ship as `v<version>` GitHub Releases.
- 📚 **Directory** — listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
- 🐛 **Issues & requests** — open an [issue](https://github.com/lordraiden/dsh-web-search-9router/issues).

## 📄 License

[MIT](./LICENSE)

## 🙏 Acknowledgments

This project is a fork of [rebron1900/dsh-web-search-9router](https://github.com/rebron1900/dsh-web-search-9router) — thank you for the original 9router-backed web search and fetch provider for DeepSeek Harness.
