import { useCallback, useEffect, useRef, useState } from "react";
import {
  installPluginArchive,
  installPluginGithub,
  loadPluginRegistry,
  previewPluginArchive,
  previewPluginGithub,
  subscribePluginRegistry,
  uninstallPlugin,
  updatePlugin,
} from "./client";
import {
  pluginById,
  validatePluginRegistry,
  type PluginConfigValue,
  type PluginInstallPreview,
  type PluginRegistry,
  type PluginUpdate,
} from "./types";

export type PluginOperationResult =
  | { ok: true }
  | { ok: false; error: string };

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "插件操作失败，请重试";
}

export function usePluginRegistry() {
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);

  const accept = useCallback((value: unknown) => {
    const next = validatePluginRegistry(value);
    if (next.revision < revision.current) return false;
    revision.current = next.revision;
    setRegistry(next);
    setLoading(false);
    setError(null);
    return true;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      accept(await loadPluginRegistry());
    } catch (cause) {
      if (mounted.current) {
        setLoading(false);
        setError(messageOf(cause));
      }
    }
  }, [accept]);

  useEffect(() => {
    mounted.current = true;
    let release: (() => void) | undefined;
    void subscribePluginRegistry(accept, cause => {
      if (mounted.current) setError(messageOf(cause));
    }).then(unlisten => {
      if (!mounted.current) unlisten();
      else release = unlisten;
    }).catch(cause => {
      if (mounted.current) setError(messageOf(cause));
    });
    void reload();
    return () => {
      mounted.current = false;
      release?.();
    };
  }, [accept, reload]);

  const send = useCallback(
    async (id: string, update: PluginUpdate) => {
      setError(null);
      try {
        accept(await updatePlugin(id, update));
        return true;
      } catch (cause) {
        if (mounted.current) setError(messageOf(cause));
        return false;
      }
    },
    [accept],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => send(id, { enabled }),
    [send],
  );
  const updateConfig = useCallback(
    (id: string, config: Record<string, PluginConfigValue>) => send(id, { config }),
    [send],
  );

  const runOperation = useCallback(
    async (operation: () => Promise<PluginRegistry>): Promise<PluginOperationResult> => {
      setError(null);
      try {
        accept(await operation());
        return { ok: true };
      } catch (cause) {
        const message = messageOf(cause);
        if (mounted.current) setError(message);
        return { ok: false, error: message };
      }
    },
    [accept],
  );

  const installArchive = useCallback(
    (path: string, id: string, version: string) =>
      runOperation(() => installPluginArchive(path, id, version)),
    [runOperation],
  );
  const installGithub = useCallback(
    (url: string, id: string, version: string) =>
      runOperation(() => installPluginGithub(url, id, version)),
    [runOperation],
  );
  const uninstall = useCallback(
    (id: string) => runOperation(() => uninstallPlugin(id)),
    [runOperation],
  );

  return {
    registry,
    loading,
    error,
    reload,
    setEnabled,
    updateConfig,
    previewArchive: (path: string): Promise<PluginInstallPreview> =>
      previewPluginArchive(path),
    previewGithub: (url: string): Promise<PluginInstallPreview> =>
      previewPluginGithub(url),
    installArchive,
    installGithub,
    uninstall,
    plugin: (id: string) => pluginById(registry, id),
  };
}
