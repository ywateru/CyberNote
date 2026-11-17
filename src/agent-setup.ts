import { agentLaunchConfig, type AgentHostSettings } from "./agent-client";

/** One source for configuration and tester prerequisites; never starts a process. */
export function agentSetup(settings: AgentHostSettings | null, selectedGrantId: string | null, binary: string, now: number) {
  const grants = settings?.grants.filter(grant => !grant.revoked && grant.expiresAt > now) ?? [];
  const grant = selectedGrantId === null ? grants[0] ?? null : grants.find(item => item.grantId === selectedGrantId) ?? null;
  let configuration: ReturnType<typeof agentLaunchConfig> | null = null;
  if (settings && grant && binary.trim()) {
    try { configuration = agentLaunchConfig(binary, { workspaceId: grant.workspaceId, credentialRef: grant.credentialRef, runtimeDir: settings.runtimeDir }); }
    catch { /* Invalid paths never produce a configuration or launch request. */ }
  }
  const missing = [
    ...(!settings ? ["先加载接入设置。"] : !settings.enabled ? ["先开启“允许本机接入”。"] : []),
    ...(!grant ? [grants.length ? "请选择一个有效客户端授权。" : "先创建一个有效客户端授权。"] : []),
    ...(!binary.trim() ? ["填写 cybernote-mcp 可执行文件的绝对路径。"] : !configuration && grant ? ["适配器路径需以 / 开头，且不能包含控制字符。"] : []),
  ];
  return { grants, grant, configuration, missing, ready: !!settings?.enabled && !!grant && !!configuration };
}
