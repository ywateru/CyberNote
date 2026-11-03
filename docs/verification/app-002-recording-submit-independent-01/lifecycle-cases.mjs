// App fixture prefix is copied byte-for-byte from the frozen author's harness.
// Cases below are independently authored. All parent callbacks and the Panel
// cancel callback are extracted from frozen production AST, not reimplemented.
const independentResults = [];
const check = async (name, fn) => {
  independentResults.push({ name, pass: true, ...(await fn()) });
};
await check("actual Panel cancel closes admission and parent UI before waiting for held IPC; duplicate cancellation coalesces", async () => {
  const storeWait = deferred(), f = fixture({ storeWait }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.counts().stores === 1, "held store");
  const panelSource = await readFile("src/RecordingPanel.tsx", "utf8");
  hashes.RecordingPanel = createHash("sha256").update(panelSource).digest("hex");
  const panelAst = ts.createSourceFile("RecordingPanel.tsx", panelSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const matches = [];
  const walk = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(panelAst) === "cancel") matches.push(node);
    ts.forEachChild(node, walk);
  };
  walk(panelAst);
  assert.equal(matches.length, 1);
  const live = { current: true }, events = [];
  const cancel = execute(`return ${matches[0].initializer.getText(panelAst)};`, {
    live,
    clearDeadline: () => events.push("deadline"),
    clock: { current: { pause: () => events.push("clock") } },
    session: { current: { dispose: () => events.push("dispose") } },
    onCancel: () => {
      assert.equal(live.current, false);
      events.push("parent");
      f.props(ticket).onCancel();
    },
  });
  cancel();
  cancel();
  assert.deepEqual(events, ["deadline", "clock", "dispose", "parent"]);
  assert.equal(f.env.record, false);
  assert.equal(ticket.accepting, false);
  assert.equal(f.env.recordingTicket.current, ticket);
  const first = f.api.cancelRecording(ticket), second = f.api.cancelRecording(ticket);
  assert.equal(first, second);
  assert.equal(f.counts().cancels, 0);
  assert.equal(f.counts().submissions, 1);
  storeWait.resolve();
  assert.equal((await result).success, false);
  await first;
  assert.equal(f.counts().cancels, 1);
  assert.equal(f.counts().inserts, 0);
  assert.equal(f.counts().active, false);
  return { events, counts: f.counts() };
});
await check("idle Panel cancellation has no storage or queued work and immediately releases current ticket", async () => {
  const f = fixture(), ticket = f.open();
  await f.api.cancelRecording(ticket);
  assert.equal(f.counts().active, false);
  assert.equal(f.counts().record, false);
  assert.equal(f.counts().stores, 0);
  assert.equal(f.counts().cancels, 0);
  const next = f.open();
  assert.notEqual(next, ticket);
  await f.api.cancelRecording(next);
  return { counts: f.counts() };
});
await check("close during inserted held SaveQueue ACK waits for same running callback without self-wait", async () => {
  const saveWait = deferred(), f = fixture({ saveWait }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.calls.some(c => c.command === "workspace_action"), "held body ACK");
  const cleanup = f.mountClose();
  let prevented = 0, closed = false;
  const closing = f.closeHandler({ preventDefault: () => prevented++ }).then(() => { closed = true; });
  assert.equal(prevented, 1);
  assert.equal(ticket.accepting, false);
  assert.equal(f.env.record, false);
  assert.equal(f.destroyed, 0);
  assert.equal(closed, false);
  assert.equal(f.counts().cancels, 0);
  saveWait.resolve();
  assert.equal((await result).success, true);
  await closing;
  assert.equal(f.destroyed, 1);
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  assert.equal(f.counts().saves, 1);
  assert.equal(f.counts().cancels, 0);
  cleanup();
  return { prevented, closed, counts: f.counts() };
});
await check("close with persistently failing body ACK retains original ticket, pending body and operation; later global retry recovers once", async () => {
  const f = fixture({ saveFailures: 100 }), ticket = f.open();
  assert.equal((await outcome(f.props(ticket).onDone(f.file))).success, false);
  f.mountClose();
  const failedClose = await outcome(f.closeHandler({ preventDefault: () => {} }));
  // Existing close listener reports through fail and keeps the window open.
  assert.equal(failedClose.success, true);
  assert.match(f.env.error, /尚未保存|未确认保存|durable save rejected/);
  assert.equal(f.destroyed, 0);
  assert.equal(f.counts().active, true);
  assert.equal(f.env.pendingDocs.current.size, 1);
  assert.equal(f.counts().submissions, 1);
  assert.equal(f.counts().cancels, 0);
  f.options.saveFailures = 0;
  await f.api.retryAttachments();
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  assert.equal(f.backend.notes[0].revision, 1);
  assert.equal(f.counts().active, false);
  return { counts: f.counts() };
});
await check("cancel after local insertion during held ACK preserves exact pending document and never cancels its attachment", async () => {
  const saveWait = deferred(), f = fixture({ saveWait, saveFailures: 2 }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.calls.some(c => c.command === "workspace_action"), "held pending body");
  const document = f.env.pendingDocs.current.get("note-a");
  const cancellation = outcome(f.api.cancelRecording(ticket));
  assert.equal(f.env.record, false);
  assert.equal(ticket.batch.cancelRequested, undefined);
  assert.equal(f.counts().cancels, 0);
  saveWait.resolve();
  assert.equal((await result).success, false);
  const cancelled = await cancellation;
  assert.equal(cancelled.success, false);
  assert.match(cancelled.message, /待保存正文/);
  assert.equal(f.env.pendingDocs.current.get("note-a"), document);
  assert.equal(f.counts().cancels, 0);
  f.options.saveFailures = 0;
  await f.api.retryAttachments();
  assert.equal(f.backend.notes[0].revision, 1);
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  return { cancelled, counts: f.counts() };
});
console.log(JSON.stringify({ tests: independentResults.length, results: independentResults, sourceHashes: hashes,
  boundary: "Independent cases; author's frozen AST/production-helper fixture reused. Real Panel cancel AST also executed. React setters, Editor command host, FileReader, native IPC/backend and window controlled; no mounted App, device, DB or valid media claim."
}, null, 2));
