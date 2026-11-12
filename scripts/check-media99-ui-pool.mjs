// Production pool/lease lifetimes, deterministic deferred IPC. No Rust/perf claim.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
const out = "artifacts/media99ui/pool";
await mkdir(out, { recursive: true });
const vite = await createServer({
  configFile: false,
  cacheDir: out + "/vite",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  logLevel: "error",
});
const checks = [];
try {
  const { AttachmentSourcePool } = await vite.ssrLoadModule(
    "/src/attachment-source-pool.ts",
  );
  const calls = [],
    releases = [],
    pending = [];
  const order = [];
  const pool = new AttachmentSourcePool({
    acquire: async (id, purpose, pixels) => {
      calls.push({ id, purpose, pixels });
      return new Promise((resolve) => pending.push({ id, purpose, resolve }));
    },
    release: async (lease) => {
      releases.push(lease);
      order.push("release:" + lease);
    },
  });
  const sources = new Map();
  const errors = [];
  const ask = (id, purpose = "thumbnail") =>
    pool.request(
      id,
      "owner",
      purpose,
      purpose === "thumbnail" ? 160 : undefined,
      "epoch-v1",
      (source) => sources.set(id, source),
      (error) => errors.push(error),
    );
  const finish = async (id) => {
    const row = pending.find((p) => p.id === id);
    assert(row, id + " pending");
    row.resolve({
      leaseId: id,
      url: "http://127.0.0.1:1234/media/" + id,
      mime: "image/png",
      bytes: 20,
      name: id,
      width: 1,
      height: 1,
      attachmentId: id,
      noteId: "owner",
      purpose: row.purpose,
    });
    await new Promise(setImmediate);
  };
  const a = ask("a"),
    a2 = ask("a"),
    b = ask("b"),
    c = ask("c"),
    d = ask("d");
  assert.equal(calls.length, 2);
  c();
  assert.equal(calls.length, 2);
  const original = ask("original", "original");
  assert.equal(calls.at(-1).id, "original");
  await finish("a");
  assert.equal(calls.filter((c) => c.id === "a").length, 1);
  assert.equal(calls.at(-1).id, "d");
  assert(!calls.some((c) => c.id === "c"));
  checks.push(
    "two thumbnail slots, identical pending dedupe, queued offscreen withdraw, original independent",
  );
  a();
  assert(!releases.includes("a"));
  a2();
  assert.equal(releases.filter((x) => x === "a").length, 1);
  checks.push("shared consumers release only after their last reference");
  b();
  await finish("b");
  assert(!sources.has("b"));
  assert.equal(releases.filter((x) => x === "b").length, 1);
  checks.push("late in-flight grant is released without publication");
  await finish("original");
  const preview = sources.get("original").retain();
  original();
  assert(!preview.disposed);
  assert(!releases.includes("original"));
  let stops = 0;
  preview.bindController(() => {
    stops++;
    order.push("stop:original");
  });
  pool.revoke(["owner"]);
  assert(preview.disposed);
  assert.equal(stops, 1);
  assert(order.indexOf("stop:original") < order.indexOf("release:original"));
  preview.dispose();
  preview.dispose();
  assert.equal(releases.filter((x) => x === "original").length, 1);
  assert.throws(() => preview.retain());
  checks.push(
    "independent floating retain survives viewport release; prepare stops before final release; handle disposal idempotent",
  );
  await finish("d");
  assert(!sources.has("d"));
  assert.equal(errors.length, 0);
  d();
  const e = ask("e"),
    f = ask("f", "original");
  await finish("e");
  await finish("f");
  const file = sources.get("f");
  pool.clearThumbnails();
  assert(sources.get("e").disposed);
  assert(!file.disposed);
  assert.equal(pool.version("e", "thumbnail"), 1);
  assert.equal(pool.version("f", "original"), 0);
  pool.invalidate(["f"]);
  assert(file.disposed);
  assert.equal(pool.version("f", "original"), 1);
  e();
  f();
  checks.push(
    "thumbnail cache clear preserves active originals; exact attachment event invalidates original and thumbnail",
  );
  let attempts = 0,
    cancellations = 0;
  const fresh = new AttachmentSourcePool({
    acquire: async () => {
      attempts++;
      if (attempts < 3)
        throw Object.assign(Error("response gate changed"), {
          code: "access_changed",
        });
      return {
        leaseId: "fresh",
        url: "http://127.0.0.1:1234/media/fresh",
        mime: "image/png",
        bytes: 20,
        name: "fresh",
        attachmentId: "fresh",
        noteId: "owner",
        purpose: "thumbnail",
      };
    },
    release: async () => {
      cancellations++;
    },
  });
  let freshSource;
  const cancelFresh = fresh.request(
    "fresh",
    "owner",
    "thumbnail",
    160,
    "stable-epoch",
    (source) => (freshSource = source),
    (error) => {
      throw error;
    },
  );
  await new Promise(setImmediate);
  assert.equal(attempts, 3);
  assert(freshSource);
  cancelFresh();
  assert.equal(cancellations, 1);
  let deniedCalls = 0,
    denied;
  const denial = new AttachmentSourcePool({
    acquire: async () => {
      deniedCalls++;
      throw Object.assign(Error("revoked"), { code: "permission_denied" });
    },
    release: async () => {},
  });
  const cancelDenied = denial.request(
    "denied",
    "owner",
    "original",
    undefined,
    "stable",
    () => {
      throw Error("unexpected source");
    },
    (error) => (denied = error),
  );
  await new Promise(setImmediate);
  assert.equal(deniedCalls, 1);
  assert.equal(denied.code, "permission_denied");
  cancelDenied();
  checks.push(
    "fresh response-gate retry is bounded to three acquisitions; authorization denial never retries",
  );
  await writeFile(
    out + "/result.json",
    JSON.stringify({ passed: true, checks, calls, releases }, null, 2),
  );
  console.log("MEDIA99 UI pool:", checks.length, "checks passed");
} finally {
  await vite.close();
}
