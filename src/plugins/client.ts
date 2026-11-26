import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import catalogJson from "./catalog.json";
import {
  validatePluginInstallPreview,
  validatePluginRegistry,
  type PluginConfigField,
  type PluginConfigValue,
  type PluginInstallPreview,
  type PluginRegistry,
  type PluginUpdate,
  type PluginView,
} from "./types";

const EVENT = "notes-plugins";
const BROWSER_STATE = "cybernote.plugins.v1";
const native = isTauri();
export const pluginInstallSupported = native;

type CatalogField = {
  key: string;
  type: "boolean" | "select";
  title: string;
  description?: string;
  default: PluginConfigValue;
  options?: { value: string; label: string }[];
};
type CatalogPlugin = {
  id: string;
  name: string;
  description: string;
  version: string;
  builtin: boolean;
  defaultEnabled: boolean;
  platforms: string[];
  permissions?: string[];
  contributes: {
    commands?: string[];
    panels?: string[];
    themes?: string[];
    devices?: string[];
  };
  config?: CatalogField[];
};
const catalog = catalogJson as {
  version: number;
  apiVersion: string;
  plugins: CatalogPlugin[];
};

type BrowserPluginState = {
  enabled?: boolean;
  config?: Record<string, PluginConfigValue>;
};
type BrowserState = {
  version: 1;
  plugins: Record<string, BrowserPluginState>;
};

let browserRevision = 1;

function browserPlatform() {
  if (/Android/i.test(navigator.platform)) return "android";
  if (/Mac/i.test(navigator.platform)) return "macos";
  return "web";
}

function defaultConfig(field: PluginConfigField) {
  return field.default;
}

function validValue(field: PluginConfigField, value: PluginConfigValue) {
  return field.type === "boolean"
    ? typeof value === "boolean"
    : typeof value === "string" && field.options.some(option => option.value === value);
}

function browserFields(plugin: CatalogPlugin): PluginConfigField[] {
  return (plugin.config ?? []).map(field => ({
    key: field.key,
    type: field.type,
    title: field.title,
    description: field.description ?? "",
    default: field.default,
    options: field.options ?? [],
  }));
}

function parseBrowserState(value: unknown): BrowserState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("插件状态无法读取");
  const state = value as Record<string, unknown>;
  if (state.version !== 1) throw Error("插件状态版本不受支持");
  const plugins = state.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins))
    throw Error("插件状态无法读取");
  const parsed: Record<string, BrowserPluginState> = {};
  for (const [id, raw] of Object.entries(plugins as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw Error("插件状态无法读取");
    const entry = raw as Record<string, unknown>;
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean")
      throw Error("插件状态无法读取");
    let config: Record<string, PluginConfigValue> | undefined;
    if (entry.config !== undefined) {
      if (!entry.config || typeof entry.config !== "object" || Array.isArray(entry.config))
        throw Error("插件设置状态无法读取");
      config = {};
      for (const [key, item] of Object.entries(entry.config as Record<string, unknown>)) {
        if (typeof item !== "boolean" && typeof item !== "string")
          throw Error("插件设置状态无法读取");
        config[key] = item;
      }
    }
    parsed[id] = {
      ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
      ...(config === undefined ? {} : { config }),
    };
  }
  return { version: 1, plugins: parsed };
}

function readBrowserState(): { state: BrowserState; error: string | null } {
  try {
    const raw = localStorage.getItem(BROWSER_STATE);
    if (!raw) return { state: { version: 1, plugins: {} }, error: null };
    return { state: parseBrowserState(JSON.parse(raw)), error: null };
  } catch {
    return {
      state: { version: 1, plugins: {} },
      error: "插件状态无法读取；插件已暂时关闭，原有状态未改写。",
    };
  }
}

function browserRegistry(): PluginRegistry {
  const { state, error } = readBrowserState();
  const platform = browserPlatform();
  const plugins: PluginView[] = catalog.plugins.map(plugin => {
    const stored = state.plugins[plugin.id];
    const fields = browserFields(plugin);
    const configValues = Object.fromEntries(
      fields.map(field => {
        const candidate = stored?.config?.[field.key];
        return [
          field.key,
          candidate !== undefined && validValue(field, candidate)
            ? candidate
            : defaultConfig(field),
        ];
      }),
    );
    return {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      builtin: plugin.builtin,
      defaultEnabled: plugin.defaultEnabled,
      platforms: plugin.platforms,
      available: plugin.platforms.includes(platform),
      enabled: error === null && (stored?.enabled ?? plugin.defaultEnabled),
      permissions: plugin.permissions ?? [],
      contributes: {
        commands: plugin.contributes.commands ?? [],
        panels: plugin.contributes.panels ?? [],
        themes: plugin.contributes.themes ?? [],
        devices: plugin.contributes.devices ?? [],
      },
      config: fields,
      configValues,
      source: {
        kind: "builtin",
        reference: "CyberNote",
        installedAt: null,
      },
      removable: false,
      ui: { sections: [], visibilityConfig: null },
    };
  });
  return {
    version: catalog.version,
    apiVersion: catalog.apiVersion,
    revision: browserRevision,
    stateError: error,
    installErrors: [],
    plugins,
    devices: { bluetooth: false, smartPen: false, recordingDevice: false },
  };
}

function browserUpdate(id: string, update: PluginUpdate) {
  const current = readBrowserState();
  if (current.error) throw Error(current.error);
  const plugin = catalog.plugins.find(item => item.id === id);
  if (!plugin) throw Error("未知插件");
  if (update.config) {
    const fields = browserFields(plugin);
    for (const [key, value] of Object.entries(update.config)) {
      const field = fields.find(item => item.key === key);
      if (!field) throw Error("插件设置包含未知项");
      if (!validValue(field, value)) throw Error(`设置 ${key} 的值无效`);
    }
  }
  const previous = current.state.plugins[id] ?? {};
  const next: BrowserPluginState = { ...previous };
  if (update.enabled !== undefined) next.enabled = update.enabled;
  if (update.config) next.config = { ...previous.config, ...update.config };
  const plugins = { ...current.state.plugins };
  if (next.enabled === undefined && next.config === undefined) delete plugins[id];
  else plugins[id] = next;
  localStorage.setItem(BROWSER_STATE, JSON.stringify({ version: 1, plugins }));
  browserRevision += 1;
  const registry = browserRegistry();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: registry }));
  return registry;
}

export async function loadPluginRegistry(): Promise<PluginRegistry> {
  if (!native) return browserRegistry();
  return validatePluginRegistry(await invoke<unknown>("plugin_registry"));
}

export async function updatePlugin(
  id: string,
  update: PluginUpdate,
): Promise<PluginRegistry> {
  if (!native) return browserUpdate(id, update);
  return validatePluginRegistry(
    await invoke<unknown>("plugin_update", { request: { id, ...update } }),
  );
}

export async function previewPluginArchive(
  path: string,
): Promise<PluginInstallPreview> {
  if (!native) throw Error("浏览器预览不支持安装插件");
  return validatePluginInstallPreview(
    await invoke<unknown>("plugin_preview_archive", { request: { path } }),
  );
}

export async function installPluginArchive(
  path: string,
  expectedId: string,
  expectedVersion: string,
): Promise<PluginRegistry> {
  if (!native) throw Error("浏览器预览不支持安装插件");
  return validatePluginRegistry(
    await invoke<unknown>("plugin_install_archive", {
      request: {
        path,
        expectedId,
        expectedVersion,
      },
    }),
  );
}

export async function previewPluginGithub(
  url: string,
): Promise<PluginInstallPreview> {
  if (!native) throw Error("浏览器预览不支持安装插件");
  return validatePluginInstallPreview(
    await invoke<unknown>("plugin_preview_github", { request: { url } }),
  );
}

export async function installPluginGithub(
  url: string,
  expectedId: string,
  expectedVersion: string,
): Promise<PluginRegistry> {
  if (!native) throw Error("浏览器预览不支持安装插件");
  return validatePluginRegistry(
    await invoke<unknown>("plugin_install_github", {
      request: {
        url,
        expectedId,
        expectedVersion,
      },
    }),
  );
}

export async function uninstallPlugin(id: string): Promise<PluginRegistry> {
  if (!native) throw Error("浏览器预览不支持卸载插件");
  return validatePluginRegistry(
    await invoke<unknown>("plugin_uninstall", { request: { id } }),
  );
}

export async function subscribePluginRegistry(
  handler: (registry: PluginRegistry) => void,
  onError: (error: unknown) => void,
): Promise<() => void> {
  if (native)
    return listen<unknown>(EVENT, ({ payload }) => {
      try {
        handler(validatePluginRegistry(payload));
      } catch (error) {
        onError(error);
      }
    });
  const listener = (event: Event) => {
    try {
      handler(validatePluginRegistry((event as CustomEvent<unknown>).detail));
    } catch (error) {
      onError(error);
    }
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
