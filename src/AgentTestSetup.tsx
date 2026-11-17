import { useId, useLayoutEffect, useRef } from "react";
import type { agentSetup } from "./agent-setup";

export default function AgentTestSetup({ setup, binary, onBinary, onGrant, onStart, onClose, onSetup, trigger }: {
  setup: ReturnType<typeof agentSetup>;
  binary: string;
  onBinary(value: string): void;
  onGrant(value: string): void;
  onStart(): void;
  onClose(): void;
  onSetup(): void;
  trigger: HTMLElement | null;
}) {
  const id = useId(), root = useRef<HTMLElement>(null);
  const latest = useRef(onClose); latest.current = onClose;
  useLayoutEffect(() => {
    const targets = () => [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest("[inert]"));
    (root.current?.querySelector<HTMLElement>("select,input") ?? targets()[0] ?? root.current)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); latest.current(); }
      else if (event.key === "Tab") {
        const nodes = targets(), first = nodes[0], last = nodes.at(-1);
        if (!nodes.includes(document.activeElement as HTMLElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault(); event.stopImmediatePropagation(); (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const focus = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) (targets()[0] ?? root.current)?.focus(); };
    document.addEventListener("keydown", keyboard, true); document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", keyboard, true); document.removeEventListener("focusin", focus);
      queueMicrotask(() => { if (trigger?.isConnected && !trigger.closest("[inert],[hidden]") && !trigger.matches(":disabled")) trigger.focus({ preventScroll: true }); });
    };
  }, [trigger]);
  return <div className="agent-dialog-backdrop">
    <section ref={root} className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header><h3 id={`${id}-title`}>MCP 测试程序</h3><button type="button" onClick={onClose}>关闭</button></header>
      <form className="agent-test-setup" onSubmit={event => { event.preventDefault(); if (setup.ready) onStart(); }}>
        <h4>连接前准备</h4>
        <p className="agent-help">使用已授权的客户端运行单项调用或批量测试。打开窗口不会启动适配器。</p>
        {setup.missing.length > 0 && <div className="agent-prerequisites" role="status"><p>还需完成：</p><ul>{setup.missing.map(message => <li key={message}>{message}</li>)}</ul></div>}
        <label className="agent-field">测试使用的客户端<select value={setup.grant?.grantId ?? ""} onChange={event => onGrant(event.target.value)}><option value="" disabled>请选择有效授权</option>{setup.grants.map(grant => <option key={grant.grantId} value={grant.grantId}>{grant.clientId}</option>)}</select></label>
        <label className="agent-field">适配器可执行文件绝对路径<input value={binary} spellCheck={false} autoComplete="off" placeholder="填写已安装的 cybernote-mcp 绝对路径" onChange={event => onBinary(event.target.value)} /></label>
        <p className="agent-help">连接时会实际运行此文件。路径存在与否、适配器握手结果将在连接时检查。</p>
        <footer><button type="button" onClick={onSetup}>返回接入设置</button><button type="submit" className="agent-primary" disabled={!setup.ready}>打开测试控制台</button></footer>
      </form>
    </section>
  </div>;
}
