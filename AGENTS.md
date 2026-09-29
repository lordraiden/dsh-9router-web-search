# AGENTS.md

## Project

**Repository:** `lordraiden/dsh-web-search-9router`

**Purpose:** DSH plugin that registers 9router-backed web search and web fetch providers with the `ctx.web` seam. The plugin maps DSH's native web operations to 9router's `/v1/search` and `/v1/web/fetch` endpoints.

### Key entry points

- `src/index.js` — server-side Cordis plugin, configuration, credential resolution, and web providers.
- `client.js` — DSH web client entry point for the plugin settings UI.
- `cordis.patch.yml` — bundle patch that loads the plugin and supplies its bundle-level configuration.
- `scripts/sync-storefront.mjs` — automation for syncing the plugin into the DSH storefront repository.
- `test/` — Node.js test suite when present.

The GitHub repository is the canonical source and distribution point. Do not use machine-specific filesystem paths as installation or dependency examples.

## Runtime and package management

- Node.js: `>=20`, as declared by `package.json`.
- Package manager: pnpm.
- Module system: native ESM (`"type": "module"`).
- The plugin is intentionally JavaScript-first and currently has no build step.
- Keep the lockfile committed and update it together with dependency changes.
- Use `pnpm install --frozen-lockfile` for reproducible CI/release installs.

Useful commands:

```bash
pnpm install
pnpm test
```

Run the relevant tests after every behavioral change. Do not claim compatibility with a DSH version that has not been verified.

## DSH integration

### Server-side provider

The plugin follows the DSH Cordis plugin shape:

- exports `name`, `inject`, `Config`, and `apply`;
- registers both providers through `ctx.web.registerSearchProvider()` and `ctx.web.registerFetchProvider()`;
- uses provider id `9router`;
- resolves credentials through the DSH credentials service and the DSH launch-environment seam;
- `available()` must remain local and must not perform network requests.

Preserve the contracts of `@deepseek-ai/dsh-web` rather than inventing a parallel abstraction. In particular:

- search provider failures should surface as `WebError` failures;
- fetch non-2xx responses are results, not provider exceptions;
- `truncated` must mean that content or sources were actually truncated;
- aborts and timeouts must remain distinguishable from ordinary provider failures where the DSH API permits it.

Prefer the current DSH APIs and patterns documented by the installed DSH version. Do not introduce new dependencies on legacy APIs such as `settingsScope` when implementing or refactoring the settings UI.

### Client-side settings

Use DSH's native settings architecture and primitives whenever they provide the required behavior. Prefer `ctx.configForms`, `SettingsFormModel`, `SettingsForm`, `SettingsValueField`, and the corresponding field specifications over maintaining a private settings framework.

Secrets are write-only configuration values. API keys must remain in the DSH credentials flow and must never be exposed in ordinary settings snapshots, logs, diagnostics, or documentation.

Avoid duplicating DSH behavior for staging, dirty state, persistence, inheritance, validation, reset, or conflict handling unless the platform does not provide the required capability.

## Configuration

Configuration behavior must be explicit and testable.

Current configuration concepts include:

- `apiKey`
- `apiKeyEnv`
- `baseURL`
- `searchModel`
- `fetchModel`
- `searchType`
- `defaultMaxResults`
- `timeoutMs`
- `searchTimeoutMs`
- `fetchTimeoutMs`
- `fetchFormat`
- `maxCharacters`

When adding or changing configuration:

1. Define the schema and runtime behavior together.
2. Keep precedence rules unambiguous between explicit configuration and environment values.
3. Validate URLs, numeric limits, and user-provided strings at the configuration boundary where practical.
4. Do not silently route user queries or credentials to an unconfigured third-party endpoint.
5. Keep per-operation DSH limits distinct from plugin-level defaults.

## HTTP and provider boundaries

Keep the plugin thin. 9router owns provider/model combinations, upstream routing, and its server-side web-fetch security boundary.

Within this repository:

- use the standard `fetch` API and DSH's `ctx.web` contracts;
- centralize genuinely shared HTTP behavior instead of maintaining divergent search/fetch implementations;
- use `redirect: "error"` unless the provider contract explicitly requires redirects;
- never log API keys or include them in thrown error messages;
- do not add local SSRF policy, provider fallback chains, retries, or caching unless a concrete DSH/9router contract requires them.

Do not broaden a peer dependency range merely to make package installation succeed. A supported DSH range must correspond to APIs the plugin actually works with.

## Security

Treat all credentials, authorization headers, and user-provided URLs as sensitive.

- Never commit secrets, tokens, credentials files, local environment files, or private infrastructure details.
- Error messages and diagnostics must not echo API keys.
- Do not add example commands containing real credentials.
- Keep the 9router endpoint configurable rather than embedding an opaque private service dependency.
- For 9router security issues, prefer upgrading/configuring 9router over duplicating its server-side security controls in the plugin.

## Code style and changes

- Keep the implementation small and direct.
- Prefer existing DSH/Cordis primitives over custom framework-like abstractions.
- Preserve public behavior unless a change is explicitly required by an issue or compatibility fix.
- Keep comments focused on intent, invariants, compatibility constraints, or non-obvious edge cases; do not narrate straightforward code.
- Use clear camelCase names for JavaScript variables, functions, and configuration keys.
- Keep provider ids, namespaces, and bundle identifiers stable unless a migration explicitly requires changing them.
- Avoid unrelated formatting churn and speculative refactors.

When changing behavior, update the implementation, tests, and user-facing documentation that describe that behavior as part of the same change when practical.

## Testing

The test suite uses Node's built-in `node:test` runner.

Prioritize contract tests over implementation-detail tests. Provider tests should cover, as applicable:

- request method, endpoint, headers, and JSON payload;
- credentials resolution and missing credentials;
- successful and malformed responses;
- non-2xx behavior;
- abort and timeout behavior;
- response normalization and deduplication;
- truncation semantics and configured limits;
- configuration precedence and validation.

HTTP tests must not require a live 9router service. Stub or inject the network boundary.

Compatibility testing is part of the support contract: declare only DSH versions that have been exercised against the APIs used by the plugin, including the client settings integration.

## Git workflow

- Default branch: `main`.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Before committing, run the relevant tests; for release-related changes, run the full test suite and packaging checks.
- Keep commits focused and self-contained.
- Do not rewrite shared history unless explicitly requested by the repository owner.
- Direct commits to `main` are acceptable when explicitly requested by the repository owner; otherwise use the normal branch/PR workflow.

## Storefront and release

- The plugin is distributed from this GitHub repository; stable versions are represented by matching `v<version>` GitHub release tags.
- Storefront synchronization is automated through `scripts/sync-storefront.mjs`.
- Do not hand-edit generated storefront README files.
- Keep storefront automation derived from the canonical repository identity (`lordraiden/dsh-web-search-9router`) while preserving its documented environment-variable overrides.
- Storefront work must not place GitHub tokens, credentials, or private paths in committed files.
- Release automation must test the same source that it packages and must keep the release tag aligned with `package.json`.

## Documentation

Documentation must describe the behavior that actually exists in the repository.

When changing configuration, compatibility, installation, provider behavior, or security assumptions, update the relevant README and other project documentation accordingly. Keep English and Chinese README content functionally aligned when both describe the same public behavior.

Do not document local workstation paths, unpublished assumptions, or compatibility claims that are not backed by code and tests.
