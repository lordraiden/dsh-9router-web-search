window.__ModuleLoader__.load({
  id: "dsh-web-search-9router",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require("react");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
    const { useMemo, useSyncExternalStore } = React;

    // The web shell seeds its UI primitives, so the same Tag / chevron the
    // native plugin cards use are reachable from here. Local replicas below
    // keep the card rendering on a shell that does not seed them.
    let primitives;
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch {
      primitives = undefined;
    }

    const NAMESPACE = "web-search-9router";
    const CSS_ATTR = "dsh-web-search-9router";
    const DEFAULT_API_KEY_REF = "NINE_ROUTER_API_KEY";
    const CHEVRON_PATH = "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z";
    const LOCALE = {
      zh: {
        title: "9router 网页搜索",
        description: "配置 9router 搜索与网页抓取提供方。",
        expand: "展开设置",
        collapse: "收起设置",
        unsaved: "未保存",
        overridden: "已覆盖",
        reset: "恢复默认",
        readOnly: "本部署的设置为只读。",
        apiKey: "API Key",
        apiKeyHint: "密钥保存在本机。留空表示保持当前密钥。",
        configured: "已配置",
        notConfigured: "未配置",
        apiKeyEnv: "API Key 凭据引用",
        apiKeyEnvHint: "由 DSH 凭据服务解析的凭据名称。",
        baseURL: "接口地址",
        baseURLHint: "留空则使用提供方默认地址。",
        searchModel: "搜索模型",
        searchModelHint: "网页搜索端点使用的模型。",
        fetchModel: "抓取模型",
        fetchModelHint: "网页抓取端点使用的模型。",
        searchType: "搜索类型",
        searchTypeHint: "9router 使用的搜索模式。",
        maxResults: "最大结果数",
        maxResultsHint: "每次搜索返回的结果数量。",
        timeoutMs: "超时时间（毫秒）",
        timeoutMsHint: "请求超时后终止提供方请求。",
        searchTimeoutMs: "搜索超时（毫秒）",
        searchTimeoutMsHint: "搜索请求超时后终止；留空沿用通用超时。",
        fetchTimeoutMs: "抓取超时（毫秒）",
        fetchTimeoutMsHint: "抓取请求超时后终止；留空沿用通用超时。",
        fetchFormat: "抓取格式",
        fetchFormatHint: "请求 9router 返回的正文格式（markdown、text 或 html）。",
        maxCharacters: "最大字符数",
        maxCharactersHint: "抓取正文的字符上限；0 表示不限制。",
        discard: "放弃修改",
        save: "保存",
        saving: "保存中…",
        saveFailed: "本部署没有接受这些值，已保留供你修改。",
        invalidNumber: "请填数字；留空表示使用默认值。"
      },
      en: {
        title: "9router Web Search",
        description: "Configure the 9router search and fetch provider.",
        expand: "Show settings",
        collapse: "Hide settings",
        unsaved: "Unsaved",
        overridden: "Overridden",
        reset: "Reset to default",
        readOnly: "This deployment stores settings read-only.",
        apiKey: "API key",
        apiKeyHint: "Stored locally. Leave blank to keep the current key.",
        configured: "Configured",
        notConfigured: "Not configured",
        apiKeyEnv: "API key credential reference",
        apiKeyEnvHint: "Credential name resolved by the DSH credentials service.",
        baseURL: "Base URL",
        baseURLHint: "Leave blank to use the provider default.",
        searchModel: "Search model",
        searchModelHint: "Model used by the web search endpoint.",
        fetchModel: "Fetch model",
        fetchModelHint: "Model used by the web fetch endpoint.",
        searchType: "Search type",
        searchTypeHint: "The search mode used by 9router.",
        maxResults: "Maximum results",
        maxResultsHint: "Number of results returned per search.",
        timeoutMs: "Timeout (ms)",
        timeoutMsHint: "Abort the provider request after this timeout.",
        searchTimeoutMs: "Search timeout (ms)",
        searchTimeoutMsHint: "Abort search requests after this timeout. Blank follows the shared timeout.",
        fetchTimeoutMs: "Fetch timeout (ms)",
        fetchTimeoutMsHint: "Abort fetch requests after this timeout. Blank follows the shared timeout.",
        fetchFormat: "Fetch format",
        fetchFormatHint: "Body format requested from 9router (markdown, text, or html).",
        maxCharacters: "Max characters",
        maxCharactersHint: "Character cap for fetched bodies; 0 sends no cap.",
        discard: "Discard",
        save: "Save",
        saving: "Saving…",
        saveFailed: "The deployment did not accept these values; they were left for you to correct.",
        invalidNumber: "Enter a number, or leave blank to use the default."
      }
    };
    // Declarations mirror the native plugin card's own stylesheets so a card
    // registered from this plugin is indistinguishable from a built-in one.
    const css = `.dsh9-card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}.dsh9-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsh9-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.dsh9-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.dsh9-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dsh9-head-text{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.dsh9-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dsh9-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dsh9-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dsh9-chevron-open{transform:rotate(180deg)}.dsh9-pending{flex:none}.dsh9-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.dsh9-read-only{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.dsh9-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.dsh9-field+.dsh9-field{border-top:.5px solid var(--dsw-alias-border-l2)}.dsh9-field-head{align-items:center;gap:8px;display:flex}.dsh9-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.dsh9-badges{align-items:center;gap:8px;display:inline-flex}.dsh9-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.dsh9-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.dsh9-reset:disabled{cursor:default}.dsh9-input{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.dsh9-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.dsh9-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.dsh9-input-invalid{border-color:var(--dsw-alias-label-error)}.dsh9-invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}.dsh9-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.dsh9-footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.dsh9-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}.dsh9-discard,.dsh9-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.dsh9-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.dsh9-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.dsh9-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.dsh9-discard:disabled,.dsh9-save:disabled{opacity:.4;cursor:default}.dsh9-discard:focus-visible,.dsh9-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.dsh9-tag{display:inline-flex;align-items:center;border-radius:999px;corner-shape:round;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap}.dsh9-tag[data-tone=outline]{border:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-tertiary)}.dsh9-tag[data-tone=neutral]{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}.dsh9-tag[data-tone=quiet]{color:var(--dsw-alias-label-tertiary)}`;
    // Replaced rather than kept on reload: a hot-swapped bundle must not leave
    // the superseded declarations standing in the page.
    if (typeof document !== "undefined") {
      document.querySelector(`style[data-plugin-css="${CSS_ATTR}"]`)?.remove();
      const style = document.createElement("style");
      style.dataset.pluginCss = CSS_ATTR;
      style.textContent = css;
      document.head.appendChild(style);
    }

    function cx(...parts) {
      return parts.filter(Boolean).join(" ");
    }

    function Tag({ tone, className, children }) {
      if (primitives?.Tag) return React.createElement(primitives.Tag, { tone, className }, children);
      return React.createElement("span", { className: cx("dsh9-tag", className), "data-tone": tone ?? "outline" }, children);
    }

    function Chevron({ open }) {
      const className = cx("dsh9-chevron", open && "dsh9-chevron-open");
      if (primitives?.IconChevronDownOutline14) return React.createElement(primitives.IconChevronDownOutline14, { className });
      return React.createElement("svg", {
        className, width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg"
      }, React.createElement("path", { d: CHEVRON_PATH, fill: "currentColor" }));
    }

    function ValueField(props) {
      return React.createElement("div", { className: "dsh9-field" },
        React.createElement("div", { className: "dsh9-field-head" },
          React.createElement("label", { className: "dsh9-label", htmlFor: props.id }, props.label),
          props.overridden ? React.createElement("span", { className: "dsh9-badges" },
            React.createElement(Tag, { tone: "neutral" }, props.overriddenLabel),
            React.createElement("button", { type: "button", className: "dsh9-reset", disabled: props.disabled, onClick: props.onReset }, props.resetLabel)
          ) : null
        ),
        React.createElement("input", {
          id: props.id,
          className: props.invalid ? "dsh9-input dsh9-input-invalid" : "dsh9-input",
          type: "text",
          ...(props.numeric === true ? { inputMode: "numeric" } : {}),
          ...(props.invalid ? { "aria-invalid": true } : {}),
          value: props.text,
          disabled: props.disabled,
          onChange: (event) => props.onEdit(event.target.value)
        }),
        React.createElement("p", { className: props.invalid ? "dsh9-invalid" : "dsh9-hint" },
          props.invalid ? props.invalidLabel : props.hint)
      );
    }

    function SecretField(props) {
      return React.createElement("div", { className: "dsh9-field" },
        React.createElement("div", { className: "dsh9-field-head" },
          React.createElement("label", { className: "dsh9-label", htmlFor: props.id }, props.label),
          React.createElement("span", { className: "dsh9-badges" },
            React.createElement(Tag, { tone: props.configured ? "neutral" : "quiet" }, props.stateLabel)
          )
        ),
        React.createElement("input", {
          id: props.id, type: "password", autoComplete: "off", className: "dsh9-input",
          value: props.text, disabled: props.disabled,
          onChange: (event) => props.onEdit(event.target.value)
        }),
        React.createElement("p", { className: "dsh9-hint" }, props.hint)
      );
    }

    function Card(props) {
      const state = props.useNineRouterCard((snapshot) => snapshot);
      const [open, setOpen] = React.useState(false);
      const saveStarted = React.useRef(false);
      const localeSubscribe = useMemo(() => props.locale?.subscribe?.bind(props.locale) ?? (() => () => {}), [props.locale]);
      const localeGetSnapshot = useMemo(() => props.locale?.getSnapshot?.bind(props.locale) ?? (() => undefined), [props.locale]);
      useSyncExternalStore(localeSubscribe, localeGetSnapshot);
      const t = props.t;
      React.useEffect(() => {
        if (state.saving) {
          saveStarted.current = true;
          return;
        }
        if (!saveStarted.current) return;
        saveStarted.current = false;
        if (!state.dirty && !state.failed) setOpen(false);
      }, [state.dirty, state.failed, state.saving]);
      if (!state.available) return null;
      const blocked = !state.dirty || state.invalid || state.saving;
      const field = (key, label, hint, numeric) => React.createElement(ValueField, {
        id: `dsh9-${key}`,
        label: t(label),
        hint: t(hint),
        numeric,
        disabled: !state.writable,
        overriddenLabel: t("overridden"),
        resetLabel: t("reset"),
        invalidLabel: t("invalidNumber"),
        ...state.fields[key],
        onEdit: (text) => props.edit(key, text),
        onReset: () => props.resetField(key)
      });
      return React.createElement("li", { className: cx("dsh9-card", open && "dsh9-card-open") },
        React.createElement("button", {
          type: "button", className: "dsh9-header", "aria-expanded": open,
          "aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
          onClick: () => setOpen(!open)
        },
          React.createElement("span", { className: "dsh9-head-text" },
            React.createElement("span", { className: "dsh9-name" }, t("title")),
            React.createElement("span", { className: "dsh9-description" }, t("description"))
          ),
          state.dirty ? React.createElement(Tag, { tone: "neutral", className: "dsh9-pending" }, t("unsaved")) : null,
          React.createElement(Chevron, { open })
        ),
        open ? React.createElement("div", { className: "dsh9-body" },
          state.writable ? null : React.createElement("p", { className: "dsh9-read-only", role: "status" }, t("readOnly")),
          React.createElement(SecretField, {
            id: "dsh9-api-key",
            label: t("apiKey"),
            hint: t("apiKeyHint"),
            text: state.fields.apiKey.text,
            configured: state.apiKeyConfigured,
            stateLabel: state.apiKeyConfigured ? t("configured") : t("notConfigured"),
            disabled: !state.apiKeyWritable,
            onEdit: (text) => props.edit("apiKey", text)
          }),
          field("apiKeyEnv", "apiKeyEnv", "apiKeyEnvHint"),
          field("baseURL", "baseURL", "baseURLHint"),
          field("searchModel", "searchModel", "searchModelHint"),
          field("fetchModel", "fetchModel", "fetchModelHint"),
          field("searchType", "searchType", "searchTypeHint"),
          field("maxResults", "maxResults", "maxResultsHint", true),
          field("timeoutMs", "timeoutMs", "timeoutMsHint", true),
          field("searchTimeoutMs", "searchTimeoutMs", "searchTimeoutMsHint", true),
          field("fetchTimeoutMs", "fetchTimeoutMs", "fetchTimeoutMsHint", true),
          field("fetchFormat", "fetchFormat", "fetchFormatHint"),
          field("maxCharacters", "maxCharacters", "maxCharactersHint", true),
          React.createElement("div", { className: "dsh9-footer" },
            state.failed ? React.createElement("p", { className: "dsh9-failed", role: "status" }, state.error || t("saveFailed")) : null,
            React.createElement("button", {
              type: "button", className: "dsh9-discard",
              disabled: !state.dirty || state.saving, onClick: props.discard
            }, t("discard")),
            React.createElement("button", {
              type: "button", className: "dsh9-save",
              disabled: blocked, onClick: props.save
            }, t(state.saving ? "saving" : "save"))
          )
        ) : null
      );
    }

    const FIELD_KINDS = {
      apiKeyEnv: "text",
      baseURL: "text",
      searchModel: "text",
      fetchModel: "text",
      searchType: "text",
      maxResults: "number",
      timeoutMs: "number",
      searchTimeoutMs: "number",
      fetchTimeoutMs: "number",
      fetchFormat: "text",
      maxCharacters: "number",
      apiKey: "secret"
    };

    function formatField(kind, value) {
      if (kind === "number") return typeof value === "number" ? String(value) : "";
      return typeof value === "string" ? value : "";
    }

    function parseField(kind, text) {
      const trimmed = text.trim();
      if (kind === "number") {
        if (trimmed === "") return { kind: "clear" };
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? { kind: "set", value: parsed } : undefined;
      }
      return trimmed === "" ? { kind: "clear" } : { kind: "set", value: trimmed };
    }

    class Controller {
      constructor(scope, remote) {
        this.scope = scope;
        this.remote = remote;
        this.staged = new Map();
        this.credential = { ref: "", configured: false, writable: true };
        this.saving = false;
        this.failed = false;
        this.error = "";
        this.store = createSnapshotStore(this.project());
        scope.subscribe(() => { this.publish(); this.refreshCredential(); });
        this.refreshCredential();
      }
      snapshot() { return this.scope.getSnapshot(); }
      value() { return this.snapshot().value ?? {}; }
      user() { return this.snapshot().user; }
      ref() {
        const declared = this.value().apiKeyEnv;
        return typeof declared === "string" && declared.length > 0 ? declared : DEFAULT_API_KEY_REF;
      }
      stored(field) {
        const user = this.user();
        return user !== undefined && user !== null && Object.hasOwn(user, field);
      }
      field(kind, field) {
        const staged = this.staged.get(field);
        if (kind === "secret") return { text: staged?.text ?? "", overridden: false, invalid: false };
        if (staged === undefined) {
          return { text: formatField(kind, this.value()[field]), overridden: this.stored(field), invalid: false };
        }
        const write = staged.clear ? { kind: "clear" } : parseField(kind, staged.text);
        return { text: staged.text, overridden: write?.kind === "set", invalid: write === undefined };
      }
      fields() {
        const fields = {};
        for (const [field, kind] of Object.entries(FIELD_KINDS)) fields[field] = this.field(kind, field);
        return fields;
      }
      plan() {
        const plan = [];
        for (const [field, staged] of this.staged) {
          if (field === "apiKey") {
            const text = staged.text.trim();
            if (text !== "") plan.push({ field, run: () => this.writeCredential(text) });
            continue;
          }
          const kind = FIELD_KINDS[field];
          if (kind === undefined) continue;
          if (staged.clear) {
            if (this.stored(field)) plan.push({ field, run: () => this.clearField(field) });
            continue;
          }
          if (staged.text === formatField(kind, this.value()[field])) continue;
          const write = parseField(kind, staged.text);
          if (write === undefined) plan.push({ field, run: undefined });
          else if (write.kind === "clear") plan.push({ field, run: () => this.clearField(field) });
          else plan.push({ field, run: () => this.writeField(field, write.value) });
        }
        return plan;
      }
      project() {
        const snapshot = this.snapshot();
        const plan = this.plan();
        return {
          available: snapshot.status === "ready",
          writable: snapshot.writable,
          dirty: plan.length > 0,
          invalid: plan.some((item) => item.run === undefined),
          saving: this.saving,
          failed: this.failed,
          error: this.error,
          fields: this.fields(),
          apiKeyConfigured: this.credential.configured,
          apiKeyWritable: this.credential.writable
        };
      }
      publish() { this.store.set(this.project()); }
      async refreshCredential() {
        const ref = this.ref();
        if (!this.remote?.credentials?.describe) return;
        try {
          const response = await this.remote.credentials.describe([ref]);
          if (!response.ok || ref !== this.ref()) return;
          const view = response.value?.[ref];
          const next = { ref, configured: view?.configured ?? false, writable: view?.writable ?? true };
          if (next.ref === this.credential.ref && next.configured === this.credential.configured && next.writable === this.credential.writable) return;
          this.credential = next;
          this.publish();
        } catch {}
      }
      async writeCredential(text) {
        if (!this.remote?.credentials?.set) return false;
        const response = await this.remote.credentials.set(this.ref(), text);
        await this.refreshCredential();
        return response.ok;
      }
      async writeField(field, value) {
        await this.scope.set(field, value);
        return this.user()?.[field] === value;
      }
      async clearField(field) {
        await this.scope.unset(field);
        return !this.stored(field);
      }
      stage(field, draft) {
        this.staged.set(field, draft);
        this.failed = false;
        this.error = "";
        this.publish();
      }
      edit(field, text) { this.stage(field, { text, clear: false }); }
      resetField(field) {
        const kind = FIELD_KINDS[field];
        this.stage(field, { text: formatField(kind, this.snapshot().base?.[field]), clear: true });
      }
      discard() {
        if (this.staged.size === 0 && !this.failed) return;
        this.staged.clear();
        this.failed = false;
        this.error = "";
        this.publish();
      }
      async save() {
        if (this.saving) return;
        const plan = this.plan();
        const writes = plan.flatMap((item) => (item.run === undefined ? [] : [item.run]));
        if (plan.length === 0 || writes.length !== plan.length) return;
        this.saving = true;
        this.failed = false;
        this.error = "";
        this.publish();
        let landed = true;
        for (const write of writes) {
          try {
            landed = (await write()) && landed;
          } catch (error) {
            this.error = String(error?.message ?? error);
            landed = false;
          }
        }
        if (landed) this.staged.clear();
        this.saving = false;
        this.failed = !landed;
        this.publish();
      }
      inject() {
        return {
          hooks: { nineRouterCard: this.store },
          edit: (field, text) => this.edit(field, text),
          resetField: (field) => this.resetField(field),
          save: () => this.save(),
          discard: () => this.discard()
        };
      }
    }

    const inject = ["slots", "locale", "remote", "remote.credentials", "settingsScope"];
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NAMESPACE, LOCALE), "web-search-9router: dictionaries");
      const t = ctx.locale.bind(NAMESPACE);
      const controller = new Controller(ctx.settingsScope.bind({ namespace: NAMESPACE }), ctx.remote);
      ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
        name: "settings.plugin.item",
        key: NAMESPACE,
        locale: NAMESPACE,
        inject: () => ({ ...controller.inject(), t, locale: ctx.locale })
      }, Card));
      ctx.effect(() => () => controller.scope.dispose?.(), "9router settings card");
    }
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
