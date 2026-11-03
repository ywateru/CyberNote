import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Run the actual App startup effect, hydration, synchronization assignment and
// presentation declarations with the production synchronization coordinator.
// React host setters and subscribe/load I/O are controlled; this is not a mount.
const source = await readFile("src/App.tsx", "utf8");
const ast = ts.createSourceFile(
  "App.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function unique(matches, description) {
  assert.equal(matches.length, 1, `unique actual App ${description}`);
  return matches[0];
}
function declaration(name) {
  return unique(
    nodes.filter(
      (node) =>
        ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
    ),
    `declaration ${name}`,
  );
}
function compile(body, context) {
  const code = ts.transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return Function(...Object.keys(context), code)(...Object.values(context));
}
const effect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]
        ?.getText(ast)
        .includes("unlisten = await subscribeAccess"),
  ),
  "startup effect",
);
const syncAssignment = unique(
  nodes.filter(
    (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(ast) === "synchronizeRef.current",
  ),
  "synchronization assignment",
);
const syncModule = ts.transpileModule(
  await readFile("src/trusted-synchronization.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { TrustedSynchronization } = await import(
  `data:text/javascript;base64,${Buffer.from(syncModule).toString("base64")}`
);
const results = [];
async function scenario(
  name,
  { subscribeFailure = false, loadFailure = false, after, loadWait, inspectPending } = {},
) {
  const state = {
    errors: [],
    syncCalls: 0,
    loadCalls: 0,
    unsubscribeCalls: 0,
    invalidations: 0,
  };
  const empty = {
    notes: [],
    folders: [],
    settings: {},
    access: { notes: {}, suspended: [] },
  };
  const context = {
    state,
    separate: null,
    useState: (value) => [value, () => {}],
    useCallback: (callback) => callback,
    wsRef: { current: empty },
    clearSensitive: {
      current: () => assert.fail("no protected note in empty fixture"),
    },
    pendingDocs: { current: new Map() },
    revisions: {
      current: { observe: () => assert.fail("no note in empty fixture") },
    },
    externalVersions: { current: new Map() },
    initializedSelection: { current: false },
    blockedNotes: { current: new Set() },
    synchronizingRef: { current: false },
    synchronizeRef: { current: null },
    synchronization: new TrustedSynchronization(),
    accessHandler: { current: () => {} },
    errText: (error) => error.message,
    setError: (value) => {
      state.error = value;
      state.errors.push(value);
    },
    invalidateAccessRequests: () => {
      state.invalidations++;
    },
    setWs: (value) => {
      state.ws = value;
    },
    setSettings: (value) => {
      state.settings = value;
    },
    setFolderId: (value) => {
      state.folderId = value;
    },
    setNoteId: (value) => {
      state.noteId = value;
    },
    setPage: (value) => {
      state.page = value;
    },
    subscribeAccess: async () => {
      if (subscribeFailure) throw Error("subscription unavailable");
      return () => {
        state.unsubscribeCalls++;
      };
    },
    loadWorkspace: async () => {
      state.loadCalls++;
      if ((loadFailure && !state.recovered) || state.retryFailure)
        throw Error("workspace load unavailable");
      if (loadWait) await loadWait;
      return empty;
    },
  };
  // State initializers are extracted as well, so the regression cannot assume
  // that the new positive fact happens to start false.
  for (const [name, setter] of [
    ["loading", "setLoading"],
    ["workspaceLoaded", "setWorkspaceLoaded"],
    ["synchronizing", "setSynchronizing"],
    ["syncError", "setSyncError"],
    ["accessSuspended", "setAccessSuspended"],
  ]) {
    const binding = unique(
      nodes.filter(
        (node) =>
          ts.isVariableDeclaration(node) &&
          ts.isArrayBindingPattern(node.name) &&
          node.name.elements[0]?.getText(ast) === name,
      ),
      `state initializer ${name}`,
    );
    state[name] = compile(
      `return ${binding.initializer.getText(ast)}[0];`,
      context,
    );
    context[setter] = (value) => {
      state[name] = value;
    };
  }
  for (const name of ["fail", "hydrate"]) {
    context[name] = compile(
      `return ${declaration(name).initializer.getText(ast)};`,
      context,
    );
  }
  compile(`${syncAssignment.getText(ast)};`, context);
  const synchronize = context.synchronizeRef.current;
  context.synchronizeRef.current = async () => {
    state.syncCalls++;
    state.syncResult = await synchronize();
    return state.syncResult;
  };
  const cleanup = compile(
    `return (${effect.arguments[0].getText(ast)})();`,
    context,
  );
  if (inspectPending) await inspectPending({state,context});
  for (let turns = 0; state.loading && turns < 100; turns++)
    await Promise.resolve();
  assert.equal(state.loading, false, `${name}: startup settled`);
  if (after) await after({ state, context });
  const shown = compile(
    [
      ...[
        "desktopSearch",
        "desktopSearchZero",
        "listTitle",
        "listSubtitle",
      ].map(
        (name) =>
          `const ${name} = ${declaration(name).initializer.getText(ast)};`,
      ),
      "return {desktopSearchZero,listTitle,listSubtitle};",
    ].join("\n"),
    {
      mobile: false,
      separate: null,
      query: "unloaded-query",
      view: "list",
      loading: state.loading,
      workspaceLoaded: state.workspaceLoaded,
      synchronizing: state.synchronizing,
      syncError: state.syncError,
      accessSuspended: state.accessSuspended,
      accessGate: { state: null },
      listed: state.ws?.notes || [],
      folderLabel: "备忘录",
      error: state.error,
    },
  );
  cleanup();
  return {
    name,
    state,
    shown,
    trusted:
      state.syncResult && context.synchronization.current(state.syncResult),
  };
}

const resultsIndependent = [];
const zero = {desktopSearchZero:true,listTitle:"搜索",listSubtitle:"无结果"};
const recovery = await scenario("actual successful retry after initial failed load establishes the positive fact", {
  loadFailure:true,
  after: async ({state,context}) => {
    assert.equal(state.workspaceLoaded,false);
    assert.equal(state.syncResult.success,false);
    state.recovered=true;
    await context.synchronizeRef.current();
  },
});
assert.equal(recovery.state.loadCalls,2);
assert.equal(recovery.state.workspaceLoaded,true);
assert.equal(recovery.trusted,true);
assert.deepEqual(recovery.shown,zero);
resultsIndependent.push(recovery);
let release;
const loadWait = new Promise(resolve=>{release=resolve});
let intermediate;
const delayed = await scenario("pending actual first load cannot establish loaded before publication", {
  loadWait,
  inspectPending: async ({state}) => {
    for(let i=0;i<50 && state.loadCalls===0;i++) await Promise.resolve();
    assert.equal(state.loadCalls,1);
    assert.equal(state.workspaceLoaded,false);
    assert.equal(state.loading,true);
    assert.equal(state.synchronizing,true);
    intermediate={loadCalls:state.loadCalls,workspaceLoaded:state.workspaceLoaded,loading:state.loading,synchronizing:state.synchronizing};
    release();
  },
});
assert.equal(delayed.state.workspaceLoaded,true);
assert.equal(delayed.trusted,true);
assert.deepEqual(delayed.shown,zero);
resultsIndependent.push({...delayed,intermediate});
console.log(JSON.stringify({tests:resultsIndependent.length,results:resultsIndependent,fixture:"Reuses frozen author actual App AST/module fixture, adds independent recovery and pending-publication assertions; no copied synchronization or presentation rule; no mounted React/Tauri/native execution"},null,2));
