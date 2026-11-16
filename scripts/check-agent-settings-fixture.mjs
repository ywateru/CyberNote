// Browser-only synthetic transport for development component checks. No Store,
// host process, credentials, files, localStorage or persistence is involved.
import React from "react";
import { createRoot } from "react-dom/client";
import AgentSettings from "/src/AgentSettings.tsx";
import "/src/style.css";
import "/src/desktop.css";
import "/src/design-tokens.css";
import "/src/design-controls.css";

const empty = () => ({ enabled: false, hostSessionId: "fixture-host", workspaceId: "fixture-workspace", incarnation: "fixture-incarnation", grants: [], recentOperations: [] });
const folder = (id, kind, name = id) => ({ id, kind, name, parentId: null, sortOrder: 0, createdAt: 0 });
const folders = [folder("default", "default", "默认目录"), folder("physical", "normal", "很长的文件夹名称".repeat(18)), folder("quick", "quick", "快速备忘录"), { ...folder("smart", "smart", "智能目录不应出现"), definitionRevision: 1, query: { version: 1, combine: "all", rules: [] } }, folder("trash", "trash", "最近删除不应出现")];
let root;
window.agentFixture = {
  calls: [], pending: null, failNext: null, hold: null, state: empty(), closed: 0,
  release() { this.pending?.(); this.pending = null; },
  async call(operation, args, complete) {
    this.calls.push({ operation, args: structuredClone(args) });
    if (this.hold === operation) await new Promise(resolve => { this.pending = resolve; });
    this.hold = null;
    if (this.failNext === operation) { if (operation != "settings") this.failNext = null; throw Error("rawcredential=fixture-secret-must-never-render"); }
    return structuredClone(complete());
  },
  mount(options = {}) {
    root?.unmount();
    this.calls = []; this.state = { ...empty(), ...options.settings }; this.closed = 0;
    this.failNext = options.failNext ?? null; this.hold = options.hold ?? null; this.pending = null;
    const f = this;
    /** @type {import('../src/agent-client').AgentClient} */
    const client = {
      settings: () => f.call("settings", {}, () => f.state),
      setEnabled: enabled => f.call("enabled", { enabled }, () => { f.state.enabled = enabled; return f.state; }),
      createGrant: input => f.call("create", input, () => {
        const grant = { ...input, grantId: `fixture-grant-${f.state.grants.length}`, workspaceId: f.state.workspaceId, incarnation: f.state.incarnation, revocation: 0, revoked: false, credentialRef: "fixture-reference" };
        f.state.grants.push(grant);
        return { grant, connection: { workspaceId: grant.workspaceId, credentialRef: grant.credentialRef, runtimeDir: "/private/fixture-runtime" } };
      }),
      revokeGrant: grantId => f.call("revoke", { grantId }, () => { f.state.grants.find(g => g.grantId === grantId).revoked = true; return f.state; }),
    };
    root = createRoot(document.getElementById("root"));
    root.render(React.createElement(React.StrictMode, null,
      React.createElement("div", { className: "recording-layout", style: { "--ui-scale": 1, "--ui-font-scale": 1, "--interface-hit-min": "28px" } },
        React.createElement("main", { className: "app desktop", style: { display: "block" } },
          React.createElement(AgentSettings, {
            folders, ...(options.realClient ? {} : { client }), mobile: !!options.mobile,
            returnFocus: document.getElementById("fixture-trigger"),
            onClose: () => { f.closed++; root.unmount(); },
          })))));
  },
};
window.agentFixture.mount();
