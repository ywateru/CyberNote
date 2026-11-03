import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/secure-id.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { secureId } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const use = (value) =>
  Object.defineProperty(globalThis, "crypto", { configurable: true, value });
try {
  const native = webcrypto.randomUUID();
  use({ randomUUID: () => native });
  assert.equal(secureId(), native);
  use({ getRandomValues: (bytes) => bytes.fill(0) });
  assert.equal(secureId(), "00000000-0000-4000-8000-000000000000");
  use({ getRandomValues: (bytes) => bytes.fill(255) });
  assert.equal(secureId(), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  use({ getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) });
  const ids = Array.from({ length: 128 }, () => secureId());
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  assert.equal(new Set(ids).size, ids.length);
  use({});
  assert.throws(() => secureId(), /设备缺少安全随机数能力/);
  use(undefined);
  assert.throws(() => secureId(), /设备缺少安全随机数能力/);
  console.log(
    "Secure ID: native path, RFC4122 version/variant boundaries, real CSPRNG fallback and unavailable-source rejection passed.",
  );
} finally {
  if (original) Object.defineProperty(globalThis, "crypto", original);
  else delete globalThis.crypto;
}
