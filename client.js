window.__ModuleLoader__.load({
  id: "dsh-web-search-9router",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { useMemo } = React;
    const { SettingsForm, SettingsValueField, SettingsSecretField, SettingsFormModel, settingsTextField, settingsNumberField } = primitives;
    const jsx = React.createElement;

    const NAMESPACE = "web-search-9router";
    const DEFAULT_API_KEY_REF = "NINE_ROUTER_API_KEY";

    const LOCALE = {
      zh: {
        title: "9router 网页搜索",
        description: "配置 9router 搜索与网页抓取提供方。",
        apiKey: "API Key",
        apiKeyHint: "密钥保存在本机。留空表示保持当前密钥。",
        configured: "已配置",
        notConfigured: "未配置",
        apiKeyEnv: "API Key 变量",
        apiKeyEnvHint: "凭据服务中的引用名。",
        baseURL: "基础地址",
        baseURLHint: "9router 兼容 API 的基础地址。",
        searchModel: "搜索模型",
        searchModelHint: "搜索端点使用的模型名。",
        fetchModel: "抓取模型",
        fetchModelHint: "抓取端点使用的模型名。",
        searchType: "搜索类型",
        searchTypeHint: "发送到搜索端点的 search_type。",
        maxResults: "最大结果数",
        maxResultsHint: "每次搜索返回的最大来源数。",
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
        overridden: "已覆盖",
        reset: "恢复默认",
        readOnly: "本部署的设置为只读。",
        unavailable: "该插件当前未加载，暂时无法配置。",
        save: "保存",
        saving: "保存中…",
        saveFailed: "本部署没有接受这些值，已保留供你修改。",
        invalidNumber: "请输入数字，或留空以使用默认值。"
      },
      en: {
        title: "9router web search",
        description: "Configure the 9router search and web-fetch provider.",
        apiKey: "API key",
        apiKeyHint: "The key is stored on this machine. Leave blank to keep the current key.",
        configured: "Configured",
        notConfigured: "Not configured",
        apiKeyEnv: "API key env",
        apiKeyEnvHint: "Reference name in the credentials service.",
        baseURL: "Base URL",
        baseURLHint: "Base address of your 9router-compatible API.",
        searchModel: "Search model",
        searchModelHint: "Model name for the search endpoint.",
        fetchModel: "Fetch model",
        fetchModelHint: "Model name for the fetch endpoint.",
        searchType: "Search type",
        searchTypeHint: "search_type sent to the search endpoint.",
        maxResults: "Max results",
        maxResultsHint: "Maximum sources returned per search.",
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
        overridden: "Overridden",
        reset: "Reset to default",
        readOnly: "This deployment stores settings read-only.",
        unavailable: "This plugin is not loaded, so it cannot be configured right now.",
        save: "Save",
        saving: "Saving…",
        saveFailed: "The deployment did not accept these values; they were left for you to correct.",
        invalidNumber: "Enter a number, or leave blank to use the default."
      }
    };

    class NineRouterCardController {
      constructor(scope, credentials) {
        const specs = [
          settingsTextField("apiKeyEnv"),
          settingsTextField("baseURL"),
          settingsTextField("searchModel"),
          settingsTextField("fetchModel"),
          settingsTextField("searchType"),
          settingsNumberField("maxResults"),
          settingsNumberField("timeoutMs"),
          settingsNumberField("searchTimeoutMs"),
          settingsNumberField("fetchTimeoutMs"),
          settingsTextField("fetchFormat"),
          settingsNumberField("maxCharacters")
        ];
        const secrets = [{
          field: "apiKey",
          write: async (text) => {
            const trimmed = text.trim();
            if (!trimmed) return true;
            const result = await credentials.set(DEFAULT_API_KEY_REF, trimmed);
            return result.ok;
          }
        }];
        this.form = new SettingsFormModel(scope, specs, secrets);
        this.apiKeyConfigured = false;
        this.store = this.form.bind(() => this.projection());
      }
      projection() {
        return {
          ...this.form.shell(),
          apiKeyConfigured: this.apiKeyConfigured,
          apiKey: this.form.field("apiKey"),
          apiKeyEnv: this.form.field("apiKeyEnv"),
          baseURL: this.form.field("baseURL"),
          searchModel: this.form.field("searchModel"),
          fetchModel: this.form.field("fetchModel"),
          searchType: this.form.field("searchType"),
          maxResults: this.form.field("maxResults"),
          timeoutMs: this.form.field("timeoutMs"),
          searchTimeoutMs: this.form.field("searchTimeoutMs"),
          fetchTimeoutMs: this.form.field("fetchTimeoutMs"),
          fetchFormat: this.form.field("fetchFormat"),
          maxCharacters: this.form.field("maxCharacters")
        };
      }
      inject() {
        return {
          hooks: { nineRouterCard: this.store },
          ...this.form.actions()
        };
      }
      dispose() {
        this.form.dispose();
      }
    }

    function formLabels(t) {
      return {
        readOnly: t("readOnly"),
        unavailable: t("unavailable"),
        dirty: t("overridden"),
        saving: t("saving"),
        save: t("save"),
        saveFailed: t("saveFailed")
      };
    }

    function fieldProps(t, state, name, id) {
      const f = state[name];
      return {
        id,
        label: t(name),
        hint: t(name + "Hint"),
        text: f.text,
        overridden: f.overridden,
        overriddenLabel: t("overridden"),
        resetLabel: t("reset"),
        invalid: f.invalid,
        invalidLabel: t("invalidNumber"),
        disabled: f.disabled,
        onEdit: (text) => undefined,
        onReset: () => undefined
      };
    }

    function NineRouterCard(props) {
      const { t } = props;
      const state = props.useNineRouterCard((s) => s);
      if (props.view === "summary") return t("description");
      return jsx(SettingsForm, {
        labels: formLabels(t),
        state,
        onSave: props.save,
        onDiscard: props.discard,
        children: [
          jsx(SettingsSecretField, {
            id: "dsh9-apiKey",
            label: t("apiKey"),
            hint: t("apiKeyHint"),
            text: state.apiKey.text,
            configured: state.apiKeyConfigured,
            stateLabel: state.apiKeyConfigured ? t("configured") : t("notConfigured"),
            disabled: !state.writable,
            onEdit: (text) => props.edit("apiKey", text)
          }),
          jsx(SettingsValueField, {
            id: "dsh9-apiKeyEnv",
            label: t("apiKeyEnv"),
            hint: t("apiKeyEnvHint"),
            text: state.apiKeyEnv.text,
            overridden: state.apiKeyEnv.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.apiKeyEnv.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.apiKeyEnv.disabled,
            onEdit: (text) => props.edit("apiKeyEnv", text),
            onReset: () => props.resetField("apiKeyEnv")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-baseURL",
            label: t("baseURL"),
            hint: t("baseURLHint"),
            text: state.baseURL.text,
            overridden: state.baseURL.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.baseURL.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.baseURL.disabled,
            onEdit: (text) => props.edit("baseURL", text),
            onReset: () => props.resetField("baseURL")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-searchModel",
            label: t("searchModel"),
            hint: t("searchModelHint"),
            text: state.searchModel.text,
            overridden: state.searchModel.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.searchModel.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.searchModel.disabled,
            onEdit: (text) => props.edit("searchModel", text),
            onReset: () => props.resetField("searchModel")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-fetchModel",
            label: t("fetchModel"),
            hint: t("fetchModelHint"),
            text: state.fetchModel.text,
            overridden: state.fetchModel.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.fetchModel.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.fetchModel.disabled,
            onEdit: (text) => props.edit("fetchModel", text),
            onReset: () => props.resetField("fetchModel")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-searchType",
            label: t("searchType"),
            hint: t("searchTypeHint"),
            text: state.searchType.text,
            overridden: state.searchType.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.searchType.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.searchType.disabled,
            onEdit: (text) => props.edit("searchType", text),
            onReset: () => props.resetField("searchType")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-maxResults",
            label: t("maxResults"),
            hint: t("maxResultsHint"),
            text: state.maxResults.text,
            overridden: state.maxResults.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.maxResults.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.maxResults.disabled,
            onEdit: (text) => props.edit("maxResults", text),
            onReset: () => props.resetField("maxResults")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-timeoutMs",
            label: t("timeoutMs"),
            hint: t("timeoutMsHint"),
            text: state.timeoutMs.text,
            overridden: state.timeoutMs.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.timeoutMs.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.timeoutMs.disabled,
            onEdit: (text) => props.edit("timeoutMs", text),
            onReset: () => props.resetField("timeoutMs")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-searchTimeoutMs",
            label: t("searchTimeoutMs"),
            hint: t("searchTimeoutMsHint"),
            text: state.searchTimeoutMs.text,
            overridden: state.searchTimeoutMs.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.searchTimeoutMs.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.searchTimeoutMs.disabled,
            onEdit: (text) => props.edit("searchTimeoutMs", text),
            onReset: () => props.resetField("searchTimeoutMs")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-fetchTimeoutMs",
            label: t("fetchTimeoutMs"),
            hint: t("fetchTimeoutMsHint"),
            text: state.fetchTimeoutMs.text,
            overridden: state.fetchTimeoutMs.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.fetchTimeoutMs.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.fetchTimeoutMs.disabled,
            onEdit: (text) => props.edit("fetchTimeoutMs", text),
            onReset: () => props.resetField("fetchTimeoutMs")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-fetchFormat",
            label: t("fetchFormat"),
            hint: t("fetchFormatHint"),
            text: state.fetchFormat.text,
            overridden: state.fetchFormat.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.fetchFormat.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.fetchFormat.disabled,
            onEdit: (text) => props.edit("fetchFormat", text),
            onReset: () => props.resetField("fetchFormat")
          }),
          jsx(SettingsValueField, {
            id: "dsh9-maxCharacters",
            label: t("maxCharacters"),
            hint: t("maxCharactersHint"),
            text: state.maxCharacters.text,
            overridden: state.maxCharacters.overridden,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalid: state.maxCharacters.invalid,
            invalidLabel: t("invalidNumber"),
            disabled: state.maxCharacters.disabled,
            onEdit: (text) => props.edit("maxCharacters", text),
            onReset: () => props.resetField("maxCharacters")
          })
        ]
      });
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NAMESPACE);
      ctx.effect(() => ctx.locale.register(NAMESPACE, LOCALE), "dsh-web-search-9router: dictionaries");
      const card = new NineRouterCardController(ctx.configForms.get(NAMESPACE), ctx.remote?.credentials);
      ctx.effect(() => () => { card.dispose(); }, "dsh-web-search-9router: form subscription");
      ctx.effect(() => ctx.configForms.whileServed([NAMESPACE], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
        name: "plugins.item",
        id: "9router",
        order: 50,
        label: () => t("title"),
        locale: NAMESPACE,
        inject: () => card.inject()
      }, NineRouterCard))), "dsh-web-search-9router: page");
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "configForms", "remote"];
    return exports;
  }
});
