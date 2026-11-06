#!/usr/bin/env node
// Synthetic isolated Store/socket route acceptance. No GUI, fake merge or user data.
import { rustBackend } from "./rust-backend.mjs";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { networkInterfaces } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { createServer, createConnection } from "node:net";

const [binaryArg, sourceArg, outputArg, mode = "all", expectedArg] =
  process.argv.slice(2);
if (
  !binaryArg ||
  !sourceArg ||
  !outputArg ||
  !["all", "lan", "tunnel"].includes(mode)
)
  throw Error(
    "usage: node scripts/debug/sync87-routes.mjs BINARY SOURCE NEW_OUTPUT [all|lan|tunnel] [EXPECTED_BINARY_SHA256]",
  );
const binary = resolve(binaryArg),
  source = resolve(sourceArg),
  output = resolve(outputArg);
if (!output.startsWith("/private/tmp/sync87-routes-"))
  throw Error("output must be new /private/tmp/sync87-routes-*");
const expectedBinary =
  expectedArg ||
  "898331177b9f3f40fcc197c84acd1d93622bc3d453da078cf0c1429ebc81acc3";
if (!/^[a-f0-9]{64}$/.test(expectedBinary))
  throw Error("invalid expected binary SHA256");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const binaryBefore = sha(await readFile(binary));
if (binaryBefore !== expectedBinary) throw Error("frozen binary mismatch");
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
async function fingerprint() {
  const files = git(source, [
    "ls-files",
    "-z",
    "src-tauri/src",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "scripts/debug/rust",
    "scripts/debug/build-rust-attachments.mjs",
  ])
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file + "\0");
    hash.update(await readFile(join(source, file)));
    hash.update("\0");
  }
  return {
    head: git(source, ["rev-parse", "HEAD"]),
    dirty: git(source, [
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      "src-tauri/src",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
      "scripts/debug/rust",
      "scripts/debug/build-rust-attachments.mjs",
    ]),
    files: files.length,
    sha256: hash.digest("hex"),
  };
}
const sourceBefore = await fingerprint(),
  scriptBefore = sha(await readFile(new URL(import.meta.url))),
  began = performance.now();
await mkdir(output, { recursive: false });
const checks = [],
  processes = [],
  tunnels = [],
  routes = {},
  failures = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, details = {}) {
  if (!ok) throw Error(name);
  checks.push({ name, ...details });
  console.log("PASS " + name);
}
async function eventually(name, predicate, timeout = 25000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (await predicate()) {
      check(name, true);
      return;
    }
    await sleep(150);
  }
  throw Error("timeout: " + name);
}
class Device {
  async open(name, root) {
    this.name = name;
    this.root = root;
    this.opened = performance.now();
    this.errors = [];
    this.backend = await rustBackend(binary, root, {
      timeoutMs: 40000,
      closeTimeoutMs: 10000,
    });
    processes.push(this);
    this.queue = [];
    await this.workspace();
    this.timer = setInterval(() => this.pump(), 80);
    return this;
  }
  async call(command, args = {}) {
    const r = await this.backend.call(command, args);
    this.events = (this.events || 0) + r.events.length;
    this.queue.push(...r.events);
    if (!r.ok)
      throw Object.assign(Error(r.error.message), { code: r.error.code });
    return r.value;
  }
  async workspace() {
    const w = await this.call("load_workspace");
    this.access = w.access;
    return w;
  }
  expected(id) {
    return {
      sessionId: this.access.sessionId,
      epoch: this.access.epoch,
      ...(id ? { noteEpoch: this.access.notes[id]?.epoch } : {}),
    };
  }
  async sync(command) {
    await this.workspace();
    const started = performance.now();
    try {
      const value = await this.call("sync_command", {
        command,
        expected: this.expected(),
      });
      (this.timings ||= []).push({
        type: command.type,
        wallMs: Math.round(performance.now() - started),
        ok: true,
      });
      return value;
    } catch (e) {
      (this.timings ||= []).push({
        type: command.type,
        wallMs: Math.round(performance.now() - started),
        ok: false,
        code: e.code,
      });
      throw e;
    }
  }
  async pump() {
    if (this.closed || this.pumping) return;
    this.pumping = true;
    try {
      await this.call("poll_events");
      while (this.queue.length) {
        const e = this.queue.shift();
        if (e.name === "notes-access") {
          if (e.payload.access.epoch >= this.access.epoch)
            this.access = e.payload.access;
          if (e.payload.phase === "prepare")
            await this.call("acknowledge_access", {
              operationId: e.payload.operationId,
              success: true,
            });
          continue;
        }
        if (e.name !== "notes-sync") continue;
        const p = e.payload;
        if (p.sessionId !== this.access.sessionId)
          throw Error("foreign session");
        if (p.phase === "probe")
          await this.call("sync_window_reply", {
            expected: this.expected(),
            reply: {
              phase: "probe",
              operationId: p.operationId,
              protectedNoteIds: [],
              blocked: false,
            },
          });
        if (p.phase === "prepare")
          await this.call("sync_window_reply", {
            expected: this.expected(),
            reply: {
              phase: "prepare",
              operationId: p.operationId,
              ready: true,
            },
          });
      }
    } catch (e) {
      this.errors.push(e.code || e.message);
    } finally {
      this.pumping = false;
    }
  }
  async apply() {
    return this.workspace();
  }
  async create(text) {
    await this.workspace();
    const n = await this.call("workspace_action", {
      action: { type: "createNote" },
      expected: this.expected(),
    });
    await this.save(n.id, text);
    return n.id;
  }
  async save(id, text, extra = []) {
    const w = await this.workspace(),
      n = w.notes.find((n) => n.id === id),
      intent = randomUUID();
    await this.call("register_save_intent", {
      noteId: id,
      intent,
      expected: this.expected(id),
    });
    await this.call("workspace_action", {
      action: {
        type: "saveNote",
        id,
        revision: n.revision,
        document: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text }] },
            ...extra,
          ],
        },
        saveIntent: intent,
      },
      expected: this.expected(id),
    });
  }
  async note(id) {
    return (await this.apply()).notes.find((n) => n.id === id);
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    while (this.pumping) await sleep(10);
    await this.backend.close();
    this.wallMs = Math.round(performance.now() - this.opened);
    check(
      this.name + " natural process exit",
      this.backend.lifecycle.exit?.code === 0 &&
        !this.backend.lifecycle.exit?.signal,
    );
  }
}
const decodeInvite = (token) =>
  JSON.parse(
    Buffer.from(token.slice("notes-sync-v1:".length), "base64url").toString(),
  );
function syntheticWav() {
  const b = Buffer.alloc(160044);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = 44; i < b.length; i += 2)
    b.writeInt16LE(
      Math.round(8000 * Math.sin((((i - 44) / 2) * 2 * Math.PI * 440) / 8000)),
      i,
    );
  return b;
}
async function media(from, to, nid, label, bytes, mime, kind) {
  await from.workspace();
  const attachment = (
    await from.call("store_attachment_operation", {
      operationId: randomUUID(),
      noteId: nid,
      name: label,
      mime,
      data: bytes.toString("base64"),
      ...(kind === "audio" ? { recordedAt: 1700000000000 } : {}),
      expected: from.expected(nid),
    })
  ).attachment;
  await from.save(nid, label, [
    { type: "attachment", attrs: { id: attachment.id, kind, name: label } },
  ]);
  await eventually(label + " metadata arrives", async () =>
    (await to.apply()).attachments.some((a) => a.id === attachment.id),
  );
  const read = await to.call("read_attachment", {
    id: attachment.id,
    expected: to.expected(nid),
  });
  check(
    label + " remote read original SHA",
    sha(Buffer.from(read.data, "base64")) === sha(bytes),
    { size: bytes.length, sha256: sha(bytes) },
  );
  const exportPath = join(output, label);
  await to.call("export_attachment", {
    id: attachment.id,
    path: exportPath,
    expected: to.expected(nid),
  });
  check(
    label + " export original SHA",
    sha(await readFile(exportPath)) === sha(bytes),
  );
  const w = await to.workspace(),
    a = w.attachments.find((a) => a.id === attachment.id);
  check(
    label + " separate managed file SHA",
    sha(await readFile(join(to.root, "attachments", a.relativePath))) ===
      sha(bytes),
  );
  return attachment.id;
}
async function exercise(name, endpoint, host, client) {
  const invitation = (await host.sync({ type: "createInvite", endpoint }))
    .invitation;
  const identity = decodeInvite(invitation);
  await client.sync({
    type: "pair",
    invitation,
    deviceName: "Synthetic " + name + " client",
  });
  check(
    name + " authenticated separate Store adoption",
    (await client.sync({ type: "status" })).status.workspaceId ===
      identity.workspaceId && client.backend.pid !== host.backend.pid,
  );
  const nid = await host.create(name + " host note");
  await eventually(
    name + " host to client note",
    async () => (await client.note(nid))?.plainText === name + " host note",
  );
  await client.save(nid, name + " client edit");
  await eventually(
    name + " client to host edit",
    async () => (await host.note(nid))?.plainText === name + " client edit",
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
    "base64",
  );
  await media(
    host,
    client,
    nid,
    name + "-image.png",
    png,
    "image/png",
    "image",
  );
  const reverse = await client.create(name + " audio owner");
  await eventually(
    name + " reverse owner arrives",
    async () => !!(await host.note(reverse)),
  );
  await media(
    client,
    host,
    reverse,
    name + "-audio.wav",
    syntheticWav(),
    "audio/wav",
    "audio",
  );
  return {
    workspaceId: identity.workspaceId,
    hostKey: identity.hostKey || identity.host_key,
  };
}
async function ownedProxy(port) {
  const rows = [],
    sockets = new Set(),
    started = performance.now();
  const server = createServer((socket) => {
    const upstream = createConnection({
      host: "127.0.0.1",
      port: Number(port),
    });
    const row = {
      openedMs: Math.round(performance.now() - started),
      toHostBytes: 0,
      fromHostBytes: 0,
      upgradeRequest: false,
      upgradeResponse: false,
    };
    rows.push(row);
    sockets.add(socket);
    sockets.add(upstream);
    socket.on("data", (b) => {
      row.toHostBytes += b.length;
      if (b.subarray(0, 4).toString() === "GET ")
        row.upgradeRequest = b
          .toString()
          .toLowerCase()
          .includes("upgrade: websocket");
    });
    upstream.on("data", (b) => {
      row.fromHostBytes += b.length;
      if (b.subarray(0, 5).toString() === "HTTP/")
        row.upgradeResponse = b.subarray(0, 30).toString().includes("101");
    });
    for (const [a, b] of [
      [socket, upstream],
      [upstream, socket],
    ]) {
      a.on("error", () => b.destroy());
      a.on("close", () => {
        sockets.delete(a);
        b.destroy();
        row.closedMs = Math.round(performance.now() - started);
      });
    }
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  await new Promise((ok, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", ok);
  });
  return {
    port: server.address().port,
    rows,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
async function stopTunnel(t) {
  if (t.stopped) return;
  t.stopped = true;
  if (!t.exit) t.child.kill("SIGTERM");
  let stopTimer;
  await Promise.race([
    t.exited,
    new Promise((r) => {
      stopTimer = setTimeout(r, 8000);
    }),
  ]);
  clearTimeout(stopTimer);
  if (!t.exit) {
    t.forced = true;
    t.child.kill("SIGKILL");
    await t.exited;
  }
  await t.proxy?.close();
  t.originConnections = t.proxy?.rows;
  t.wallMs = Math.round(performance.now() - t.started);
  await writeFile(join(output, t.name + ".log"), t.log);
  check(t.name + " owned tunnel terminated", !!t.exit);
}
async function publicReady(t) {
  t.wsProbes = [];
  for (let i = 0; i < 3; i++) {
    const probe = await new Promise((done) => {
      const ws = new WebSocket(t.endpoint);
      let settled = false,
        upgraded = false;
      const finish = (closed) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        done({ connected: upgraded, closed });
      };
      const timer = setTimeout(() => finish(false), 7000);
      ws.addEventListener("open", () => {
        upgraded = true;
        ws.close();
      });
      ws.addEventListener("close", () => finish(true));
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {}
      });
    });
    t.wsProbes.push(probe);
    if (probe.connected && probe.closed) return;
    await sleep(1000);
  }
  throw Error(
    t.name + " public WebSocket Upgrade/close failed after 3 bounded attempts",
  );
}
async function tunnel(name, port) {
  const proxy = await ownedProxy(port);
  const dir = join(output, name);
  await mkdir(dir);
  const config = join(dir, "config.yml");
  await writeFile(
    config,
    "# Owned Quick Tunnel configuration; no account credentials.\nurl: http://127.0.0.1:" +
      proxy.port +
      "\n",
  );
  const args = [
    "tunnel",
    "--config",
    config,
    "--origincert",
    join(dir, "unused-cert.pem"),
    "--no-autoupdate",
    "--metrics",
    "127.0.0.1:0",
    "--loglevel",
    "info",
    "--protocol",
    "http2",
    "--retries",
    "1",
    "--grace-period",
    "1s",
    "--url",
    "http://127.0.0.1:" + proxy.port,
  ];
  const env = { ...process.env };
  for (const k of Object.keys(env))
    if (
      k.startsWith("TUNNEL_") ||
      k.startsWith("CF_") ||
      ["NO_AUTOUPDATE", "NO_TLS_VERIFY"].includes(k)
    )
      delete env[k];
  const child = spawn("/opt/zerobrew/bin/cloudflared", args, {
    env,
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const t = {
    name,
    proxy,
    child,
    args,
    pid: child.pid,
    started: performance.now(),
    log: "",
    forced: false,
  };
  t.exited = new Promise((resolve) =>
    child.once("close", (code, signal) => {
      t.exit = { code, signal };
      resolve(t.exit);
    }),
  );
  child.on("error", (e) => {
    t.error = e.message;
  });
  for (const s of [child.stdout, child.stderr])
    s.on("data", (d) => {
      t.log += d.toString();
      if (t.log.length > 2 * 1024 * 1024) {
        t.error = "bounded tunnel log exceeded";
        child.kill("SIGTERM");
      }
    });
  tunnels.push(t);
  const end = performance.now() + 45000;
  while (performance.now() < end) {
    const m = t.log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && t.log.includes("Registered tunnel connection")) {
      t.endpoint = m[0].replace("https:", "wss:");
      await publicReady(t);
      return t;
    }
    if (t.exit || t.error) throw Error(name + " startup failed");
    await sleep(200);
  }
  throw Error(name + " registration timeout (45 seconds)");
}
try {
  const interfaces = networkInterfaces();
  const lan = Object.entries(interfaces)
    .flatMap(([name, rows]) =>
      rows
        .filter(
          (r) =>
            r.family === "IPv4" &&
            !r.internal &&
            /^en\d+$/.test(name) &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(r.address),
        )
        .map((r) => ({ name, address: r.address })),
    )
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!lan) throw Error("no active RFC1918 physical LAN interface");
  const virtual = Object.entries(interfaces)
    .filter(([name]) => /^(utun|wg|tun|tap|easytier)/.test(name))
    .map(([name, rows]) => ({
      name,
      addresses: rows.map((r) => ({ family: r.family, address: r.address })),
    }));
  const commands = {};
  for (const cmd of ["wg", "easytier-core", "easytier-cli"]) {
    try {
      commands[cmd] = execFileSync("/usr/bin/which", [cmd], {
        encoding: "utf8",
      }).trim();
    } catch {
      commands[cmd] = null;
    }
  }
  routes.virtualNetwork = {
    verified: false,
    reason:
      "No explicitly owned reachable WireGuard/EasyTier peer network supplied; generic utun and 198.18/15 proxy address are not proof of either product.",
    commands,
    interfaces: virtual,
    usage:
      "Set invite endpoint to ws://<reachable-virtual-IP>:<listen-port> (or TLS wss endpoint); system client owns network and routes.",
  };
  if (mode !== "tunnel") {
    const host = await new Device().open("LAN-host", join(output, "lan-host"));
    const client = await new Device().open(
      "LAN-client",
      join(output, "lan-client"),
    );
    const listen = (
      await host.sync({
        type: "startHost",
        deviceName: "Synthetic LAN host",
        port: 0,
      })
    ).status.listenAddress;
    const port = new URL(listen).port,
      endpoint = "ws://" + lan.address + ":" + port;
    routes.lan = {
      endpoint,
      interface: lan.name,
      samePhysicalHost: true,
      verified: false,
    };
    await exercise("lan", endpoint, host, client);
    routes.lan.verified = true;
    const changed = "ws://127.0.0.1:" + port;
    const identity = (await client.sync({ type: "status" })).status;
    await client.sync({
      type: "pair",
      deviceName: "Synthetic LAN client",
      invitation: (await host.sync({ type: "createInvite", endpoint: changed }))
        .invitation,
    });
    const updated = (await client.sync({ type: "status" })).status;
    check(
      "same-workspace repeated pair adds new endpoint without device identity drift",
      updated.workspaceId === identity.workspaceId &&
        updated.deviceId === identity.deviceId &&
        updated.peers.some((p) => p.endpoint === changed),
    );
    await client.close();
    const lanRestart = await new Device().open(
      "LAN-client-restart",
      client.root,
    );
    await eventually(
      "same client cold restart connects newly persisted endpoint",
      async () =>
        (await lanRestart.sync({ type: "status" })).status.peers.some(
          (p) => p.endpoint === changed && p.connected,
        ),
    );
    await lanRestart.close();
    await host.close();
  }
  if (mode !== "lan") {
    await writeFile(
      join(output, "cloudflared-help.txt"),
      execFileSync("/opt/zerobrew/bin/cloudflared", ["tunnel", "--help"], {
        encoding: "utf8",
      }),
    );
    routes.quickTunnel = { verified: false, attempts: 1 };
    const th = await new Device().open(
      "Tunnel-host",
      join(output, "tunnel-host"),
    );
    const tc = await new Device().open(
      "Tunnel-client",
      join(output, "tunnel-client"),
    );
    const listen = (
      await th.sync({
        type: "startHost",
        deviceName: "Synthetic tunnel host",
        port: 0,
      })
    ).status.listenAddress;
    const port = new URL(listen).port;
    const t = await tunnel("quick-tunnel-1", port);
    routes.quickTunnel.endpoint = t.endpoint;
    const first = await exercise("tunnel", t.endpoint, th, tc);
    const bad = await new Device().open(
      "Tunnel-bad-key",
      join(output, "tunnel-bad-key"),
    );
    const decoded = decodeInvite(
      (await th.sync({ type: "createInvite", endpoint: t.endpoint }))
        .invitation,
    );
    decoded.psk = Buffer.alloc(32, 17).toString("base64url");
    let rejected = false;
    try {
      await bad.sync({
        type: "pair",
        deviceName: "Synthetic invalid key",
        invitation:
          "notes-sync-v1:" +
          Buffer.from(JSON.stringify(decoded)).toString("base64url"),
      });
    } catch (e) {
      rejected = true;
      routes.quickTunnel.badKeyCode = e.code;
    }
    check(
      "wss incorrect Noise PSK rejected before Store enable",
      rejected && !(await bad.sync({ type: "status" })).status.workspaceId,
    );
    await bad.close();
    await stopTunnel(t);
    // New anonymous hostname uses a fresh invitation; host identity remains unchanged.
    const t2 = await tunnel("quick-tunnel-2", port);
    routes.quickTunnel.secondEndpoint = t2.endpoint;
    const again = tc;
    const second = await exercise(
      "tunnel-new-hostname",
      t2.endpoint,
      th,
      again,
    );
    check(
      "new Quick Tunnel endpoint preserves Noise host and workspace identity",
      first.workspaceId === second.workspaceId &&
        first.hostKey === second.hostKey &&
        typeof first.hostKey === "string",
    );
    const persisted = (await again.sync({ type: "status" })).status.peers;
    check(
      "same client remembers new wss endpoint",
      persisted.some((p) => p.endpoint === t2.endpoint),
    );
    const root = again.root;
    await again.close();
    const restarted = await new Device().open("Tunnel-client-restart", root);
    check(
      "cold restart preserves new wss endpoint",
      (await restarted.sync({ type: "status" })).status.peers.some(
        (p) => p.endpoint === t2.endpoint,
      ),
    );
    const cold = await th.create("tunnel cold restart note");
    await eventually(
      "same client cold restart reconnects through new hostname",
      async () =>
        (await restarted.note(cold))?.plainText === "tunnel cold restart note",
    );
    await restarted.close();
    await stopTunnel(t2);
    await th.close();
    routes.quickTunnel.verified = true;
  }
} catch (e) {
  failures.push({ message: e.message, code: e.code, stack: e.stack });
  console.error(e.stack);
} finally {
  for (const t of tunnels)
    if (!t.stopped)
      try {
        await stopTunnel(t);
      } catch (e) {
        failures.push({ message: e.message });
      }
  try {
    check(
      "no async quiet protocol errors",
      processes.every((p) => p.errors.length === 0),
    );
  } catch (e) {
    failures.push({ message: e.message });
  }
  for (const p of processes)
    if (!p.closed)
      try {
        await p.close();
      } catch (e) {
        failures.push({ message: e.message });
      }
  const sourceAfter = await fingerprint(),
    binaryAfter = sha(await readFile(binary)),
    scriptAfter = sha(await readFile(new URL(import.meta.url)));
  try {
    check("frozen binary unchanged", binaryBefore === binaryAfter);
    check(
      "source fingerprint unchanged",
      sourceBefore.sha256 === sourceAfter.sha256 &&
        sourceBefore.files === sourceAfter.files &&
        sourceBefore.dirty === sourceAfter.dirty,
    );
    check("route harness unchanged", scriptBefore === scriptAfter);
  } catch (e) {
    failures.push({ message: e.message });
  }
  const files = [];
  async function inventory(dir) {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, d.name);
      if (d.isSymbolicLink()) throw Error("unexpected owned symlink");
      if (d.isDirectory()) {
        if (d.name !== ".sync") await inventory(path);
      } else if (d.isFile() && !path.endsWith(".log")) {
        const s = await stat(path);
        files.push({ path, size: s.size, sha256: sha(await readFile(path)) });
      }
    }
  }
  await inventory(output);
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(
      {
        mode,
        scriptHead: git(process.cwd(), ["rev-parse", "HEAD"]),
        script: { sha256: scriptBefore, after: scriptAfter },
        sourceBefore,
        sourceAfter,
        binary: { path: binary, sha256: binaryBefore, after: binaryAfter },
        routes,
        checks,
        processes: processes.map((p) => ({
          name: p.name,
          root: p.root,
          ...p.backend.lifecycle,
          wallMs: p.wallMs,
          events: p.events,
          errors: p.errors,
          timings: p.timings,
        })),
        tunnels: tunnels.map(
          ({
            name,
            pid,
            args,
            endpoint,
            exit,
            forced,
            wallMs,
            error,
            wsProbes,
            originConnections,
          }) => ({
            name,
            pid,
            args,
            endpoint,
            exit,
            forced,
            wallMs,
            error,
            wsProbes,
            originConnections,
          }),
        ),
        files,
        wallMs: Math.round(performance.now() - began),
        failures,
      },
      null,
      2,
    ),
  );
}
if (failures.length) process.exitCode = 1;
