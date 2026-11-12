# SVG104 root integration — accepted

2026-11-10. Independent integration check of root against accepted `59cbbf74822c626750295bcdc374d6fb1a2d9243`. No product modification, native package, device operation or benchmark.

Independently read all 17 entries in `artifacts/svg104-integration/source-copy.json`, obtained the accepted bytes directly from Git, and compared actual root bytes, lengths and SHA256. **17/17 exact before and after the run**. This includes production/harness Cargo locks and manifests, embedded font, OFL/README, renderer/cache and test/harness files. Font remains 16,437,364 B, SHA256 `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`; prior independent provenance/name/OFL findings apply to these identical bytes. APFS clonefile is the recorded copy method, not a new font identity.

Existing Android103 Manifest remains exactly approved SHA256 `ca66daacdadfd0e28aeba29b2ffbe5fee1c434ffb3c663f7c0da6ce7af0a8611`. Release `network_security_config.xml` remains byte-equal to `e521306e`; both XML files parse. Checks repeated after tests confirm neither changed.

Ran exactly the two necessary combined harness targets from root, shared root target, two jobs, incremental disabled, harness debug=0, offline locked dependencies:

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
SVG104_FIXTURE=/private/tmp/cybernote-delivery/artifacts/media99-fixture \
SVG104_RESULTS=/Users/water/work/2026/Apple-Notes-Clone/artifacts/svg104-integration/frozen50.json \
cargo test --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --locked --offline --test review104 --test svg104 -- --test-threads=2 --nocapture
```

Actual exit **0**, independent review **5/5**, SVG focused groups **4/4**. HTTP/file/data presentation URL cases reject with zero files; ordinary stylesheet/inline comments and local gradient retain expected pixels. Partial text, visible window, resource/budget negatives, concurrent deduplication, post-render Session prepare/source replacement, real HTTP/cache and all **50 original frozen SHA before/after plus text ROI contrasts** pass. No unrelated matrix was added. Fixture originals remain read only and no large fixture/font copy was created by this check.

Evidence: `artifacts/svg104-integration/independent-source-check.json`, `combined-tests.txt`, `frozen50.json`, `independent-result.json`. Original source copy record retained unchanged. This accepts root source/real-module integration only; final packaged rendering and equivalent-coverage performance remain separate gates.
