export type PluginConfigValue = boolean | string;

export type PluginConfigOption = {
  value: string;
  label: string;
};

export type PluginConfigField = {
  key: string;
  type: "boolean" | "select";
  title: string;
  description: string;
  default: PluginConfigValue;
  options: PluginConfigOption[];
};

export type PluginContributions = {
  commands: string[];
  panels: string[];
  themes: string[];
  devices: string[];
};

export type PluginUiSection = {
  slot: "plugin.detail";
  title: string;
  body: string;
};

export type PluginUi = {
  sections: PluginUiSection[];
  visibilityConfig: string | null;
};

export type PluginSourceKind = "builtin" | "zip" | "github";

export type PluginSource = {
  kind: PluginSourceKind;
  reference: string;
  installedAt: number | null;
};

export type PluginView = {
  id: string;
  name: string;
  description: string;
  version: string;
  builtin: boolean;
  defaultEnabled: boolean;
  platforms: string[];
  available: boolean;
  enabled: boolean;
  permissions: string[];
  contributes: PluginContributions;
  config: PluginConfigField[];
  configValues: Record<string, PluginConfigValue>;
  source: PluginSource;
  removable: boolean;
  ui: PluginUi;
};

export type DeviceCapabilities = {
  bluetooth: boolean;
  smartPen: boolean;
  recordingDevice: boolean;
};

export type PluginRegistry = {
  version: number;
  apiVersion: string;
  revision: number;
  stateError: string | null;
  installErrors: { id: string; message: string }[];
  plugins: PluginView[];
  devices: DeviceCapabilities;
};

export type PluginInstallConflict = {
  kind: "builtin" | "same" | "upgrade" | "downgrade";
  version?: string;
};

export type PluginInstallPreview = {
  id: string;
  name: string;
  description: string;
  version: string;
  platforms: string[];
  available: boolean;
  permissions: string[];
  contributes: PluginContributions;
  config: PluginConfigField[];
  ui: PluginUi;
  source: Pick<PluginSource, "kind" | "reference">;
  manifestSha256: string;
  archiveSha256: string;
  conflict: PluginInstallConflict | null;
};

export type PluginUpdate = {
  enabled?: boolean;
  config?: Record<string, PluginConfigValue>;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} 格式无效`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw Error(`${label} 格式无效`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw Error(`${label} 格式无效`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string"))
    throw Error(`${label} 格式无效`);
  return value as string[];
}

function configValue(value: unknown, label: string): PluginConfigValue {
  if (typeof value !== "boolean" && typeof value !== "string")
    throw Error(`${label} 格式无效`);
  return value;
}

function parseConfigField(value: unknown): PluginConfigField {
  const field = record(value, "插件设置项");
  const type = text(field.type, "插件设置类型");
  if (type !== "boolean" && type !== "select")
    throw Error("插件设置类型不受支持");
  const options = Array.isArray(field.options)
    ? field.options.map(item => {
        const option = record(item, "插件设置选项");
        return {
          value: text(option.value, "插件设置选项值"),
          label: text(option.label, "插件设置选项名称"),
        };
      })
    : [];
  return {
    key: text(field.key, "插件设置键"),
    type,
    title: text(field.title, "插件设置标题"),
    description: typeof field.description === "string" ? field.description : "",
    default: configValue(field.default, "插件设置默认值"),
    options,
  };
}

function parseContributions(value: unknown): PluginContributions {
  const contributions = record(value, "插件贡献");
  return {
    commands: strings(contributions.commands ?? [], "插件命令"),
    panels: strings(contributions.panels ?? [], "插件面板"),
    themes: strings(contributions.themes ?? [], "插件主题"),
    devices: strings(contributions.devices ?? [], "插件设备"),
  };
}

function parseUi(value: unknown): PluginUi {
  if (value === undefined || value === null)
    return { sections: [], visibilityConfig: null };
  const ui = record(value, "插件界面");
  if (!Array.isArray(ui.sections)) throw Error("插件界面区块格式无效");
  return {
    sections: ui.sections.map(item => {
      const section = record(item, "插件界面区块");
      const slot = text(section.slot, "插件界面槽位");
      if (slot !== "plugin.detail") throw Error("插件界面槽位不受支持");
      return {
        slot,
        title: text(section.title, "插件界面标题"),
        body: text(section.body, "插件界面内容"),
      };
    }),
    visibilityConfig:
      ui.visibilityConfig === null || ui.visibilityConfig === undefined
        ? null
        : text(ui.visibilityConfig, "插件界面可见性设置"),
  };
}

function parseSource(value: unknown, builtin: boolean): PluginSource {
  if (value === undefined || value === null)
    return {
      kind: builtin ? "builtin" : "zip",
      reference: builtin ? "CyberNote" : "本地扩展",
      installedAt: null,
    };
  const source = record(value, "插件来源");
  const kind = text(source.kind, "插件来源类型");
  if (kind !== "builtin" && kind !== "zip" && kind !== "github")
    throw Error("插件来源类型不受支持");
  return {
    kind,
    reference: text(source.reference, "插件来源"),
    installedAt:
      typeof source.installedAt === "number" ? source.installedAt : null,
  };
}

function parseConfigValues(value: unknown): Record<string, PluginConfigValue> {
  const values = record(value, "插件设置值");
  return Object.fromEntries(
    Object.entries(values).map(([key, item]) => [key, configValue(item, `插件设置 ${key}`)]),
  );
}

function parsePlugin(value: unknown): PluginView {
  const plugin = record(value, "插件");
  if (!Array.isArray(plugin.config)) throw Error("插件设置清单无效");
  const builtin = boolean(plugin.builtin, "插件来源");
  return {
    id: text(plugin.id, "插件 ID"),
    name: text(plugin.name, "插件名称"),
    description: text(plugin.description, "插件说明"),
    version: text(plugin.version, "插件版本"),
    builtin,
    defaultEnabled: boolean(plugin.defaultEnabled, "插件默认状态"),
    platforms: strings(plugin.platforms, "插件平台"),
    available: boolean(plugin.available, "插件可用状态"),
    enabled: boolean(plugin.enabled, "插件启用状态"),
    permissions: strings(plugin.permissions, "插件权限"),
    contributes: parseContributions(plugin.contributes),
    config: plugin.config.map(parseConfigField),
    configValues: parseConfigValues(plugin.configValues),
    source: parseSource(plugin.source, builtin),
    removable:
      plugin.removable === undefined
        ? !builtin
        : boolean(plugin.removable, "插件卸载状态"),
    ui: parseUi(plugin.ui),
  };
}

function parseInstallErrors(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Error("插件加载错误格式无效");
  return value.map(item => {
    const error = record(item, "插件加载错误");
    return {
      id: text(error.id, "插件加载错误 ID"),
      message: text(error.message, "插件加载错误说明"),
    };
  });
}

export function validatePluginRegistry(value: unknown): PluginRegistry {
  const registry = record(value, "插件注册表");
  if (!Array.isArray(registry.plugins)) throw Error("插件列表格式无效");
  const devices = record(registry.devices, "设备能力");
  return {
    version: typeof registry.version === "number" ? registry.version : 0,
    apiVersion: text(registry.apiVersion, "插件 API 版本"),
    revision: typeof registry.revision === "number" ? registry.revision : 0,
    stateError:
      registry.stateError === null || registry.stateError === undefined
        ? null
        : text(registry.stateError, "插件状态错误"),
    installErrors: parseInstallErrors(registry.installErrors),
    plugins: registry.plugins.map(parsePlugin),
    devices: {
      bluetooth: boolean(devices.bluetooth, "蓝牙能力"),
      smartPen: boolean(devices.smartPen, "智能笔能力"),
      recordingDevice: boolean(devices.recordingDevice, "录音设备能力"),
    },
  };
}

function parseConflict(value: unknown): PluginInstallConflict | null {
  if (value === null || value === undefined) return null;
  const conflict = record(value, "插件安装冲突");
  const kind = text(conflict.kind, "插件安装冲突类型");
  if (!["builtin", "same", "upgrade", "downgrade"].includes(kind))
    throw Error("插件安装冲突类型不受支持");
  return {
    kind: kind as PluginInstallConflict["kind"],
    ...(typeof conflict.version === "string" ? { version: conflict.version } : {}),
  };
}

export function validatePluginInstallPreview(
  value: unknown,
): PluginInstallPreview {
  const preview = record(value, "插件安装预览");
  if (!Array.isArray(preview.config)) throw Error("插件设置清单无效");
  const source = record(preview.source, "插件来源");
  const kind = text(source.kind, "插件来源类型");
  if (kind !== "zip" && kind !== "github")
    throw Error("插件安装来源不受支持");
  return {
    id: text(preview.id, "插件 ID"),
    name: text(preview.name, "插件名称"),
    description: text(preview.description, "插件说明"),
    version: text(preview.version, "插件版本"),
    platforms: strings(preview.platforms, "插件平台"),
    available: boolean(preview.available, "插件可用状态"),
    permissions: strings(preview.permissions, "插件权限"),
    contributes: parseContributions(preview.contributes),
    config: preview.config.map(parseConfigField),
    ui: parseUi(preview.ui),
    source: { kind, reference: text(source.reference, "插件来源") },
    manifestSha256: text(preview.manifestSha256, "插件清单摘要"),
    archiveSha256: text(preview.archiveSha256, "插件包摘要"),
    conflict: parseConflict(preview.conflict),
  };
}

export function pluginById(registry: PluginRegistry | null, id: string) {
  return registry?.plugins.find(plugin => plugin.id === id);
}
