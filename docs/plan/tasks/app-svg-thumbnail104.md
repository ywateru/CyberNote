---
id: app-svg-thumbnail104
scope: attachment-media-svg-thumbnails
status: integrated-source-verified
depends-on: [app-attachment-media99]
---

## objective

补齐文字SVG在列表/画廊的缩略图。现有受限resvg显式拒绝text，正式99M冻结样本50张文字SVG全部unsupported；原文件能够打开不等于缩略图要求已满足。沿用受管附件、授权、可见区域加载、有限并发和独立PNG缓存，不加载原件冒充缩略图，不修改冻结503原件或用户库。

## boundary and first gate

先研究锁定resvg/usvg 0.45的文字能力与Mac/Android一致可用的字体来源。输出具体字体覆盖、体积、授权、内存/复杂度限制与失败策略；不得简单打开全系统字体扫描、网络/文件URL或CSS外部资源。文字必须实际渲染，不能去掉拒绝后静默丢字。尽量复用既有依赖与共享target，无第二份target、整包或大样本重新生成。原input2MiB/10K XML节点、输出1024px等预算继续有效；增加文字复杂度边界并更新缓存算法版本，避免旧结果误命中。

实现范围限attachment_media缩略图与必要Cargo依赖、字体资产/许可、真实Store边界测试和文档。全SVG效果/外部资源不扩展。确定方案后更新attachment-media契约并实现，由不同代理独审。原50份冻结SVG的文字均为Latin编号，能覆盖该样本并不证明中文；另加小型中文文字SVG验证，不能只通过空白或Latin就宣称完整文字支持。研究若发现可行方案需要大依赖或不可获得的字体许可，先准确报告，不猜实现。

## proof

基线实际文字SVG拒绝作为正控；修改后相同冻结样本的50张原件逐SHA保持且逐张成功生成可解码非空PNG。核至少中文、英文、tspan/常用布局的可见字形；外部file/network/data资源、DTD、超量文字与超大画布仍拒绝。真实Store/cache/HTTP证明小尺寸派生、命中不重复生成、授权撤回/源替换不发布旧结果。局部验证通过后再决定必要的正式性能重测，不复制/重建整个样本。后续双端包的能力与本地独立测试区分，不提前宣称Android实际渲染通过。


## author implementation and evidence (2026-11-10)

- `svg_text.rs`: restricted horizontal text/tspan, one trusted static Binary face,
  nominal glyph/outline preflight and per-layouted-span text/outline verification.
  Source-to-parsed text check also rejects an entirely dropped sibling text node.
  1024 scalars/128 spans/4096 positioning numbers, positive bounded font size,
  100000 nominal outline operations before shaping and100000 transformed segments.
  Missing/partial/unsupported text returns `unsupported_media`, never a blank hit.
- Vector-only ordinary stylesheet/inline styles/local gradient remain supported,
  no font DB initialization on that branch. Text stylesheets/escaped or external
  CSS and resource URLs are rejected before shaping; all resolvers remain disabled.
- One pinned official Regular font under `src-tauri/fonts`, 16,437,364 B + OFL.
  Product fingerprint already walks this directory. Actual single-byte mutation
  rejected an old stamp; restored bytes made it valid again, with no retained copy.
  This probe used sparse104 inputs and does not claim the full final product fp.
- Cache version `media-thumbnail-v3-svg-text` + pinned font SHA; no grant/Session,
  source authorization, source/cache integrity, atomic publish or IPC changes.
- Production lock has12 added text-related packages and no removed/upgraded old
  package versions; harness lock has13 because tinyvec was not previously in it.
  `cargo tree -e features -i fontdb` shows no fs/fontconfig/memmap/system-fonts.

Run from `/private/tmp/cybernote-svg104` with shared target:

```sh
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
SVG104_FIXTURE=/private/tmp/cybernote-delivery/artifacts/media99-fixture \
SVG104_RESULTS=/private/tmp/cybernote-svg104/docs/plan/analysis/svg-thumbnail104-evidence/frozen50.json \
cargo test --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --locked --test svg104 -- --test-threads=2 --nocapture

CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo test --manifest-path src-tauri/src/attachment_media/harness/Cargo.toml \
  --locked --test media --test platform --test review99a --test review99b \
  -- --test-threads=2
```

Results:4 focused groups and16+7+2+1 regressions passed. Frozen50 are read only,
per-file source SHA verified before/after. Each actual800x600 PNG differs from the
same source with text removed in ROI `[12,12,260,28]` by844–903 pixels. JSON:
[per-image](../analysis/svg-thumbnail104-evidence/frozen50.json),
[checks](../analysis/svg-thumbnail104-evidence/checks.json),
[identity](../analysis/svg-thumbnail104-evidence/fingerprint.json).
Chinese/Traditional/Latin/tspan/dxdy/end/middle anchor are separate small fixtures.
Negative cases include missing glyphs, valid neighbour plus font-size0/display:none
or negative-spacing dropped span, external local-file/http/data font/image/CSS,
DTD, huge canvas and each character/span/position/outline budget. A real local
listener verifies no HTTP request. Real HTTP/cache test verifies source retained,
warm hit, replaced source rejection/regeneration and Session prepare denial.

Only same-HEAD six scan/ui Cargo/lib/build files materialized to satisfy production
lock resolution (35,462 B); no edits or plugin assets. Shared target, no App native
package/ADB/formal benchmark, no root product/102 changes. Full font increases raw
product inputs by16.4MB per target; final compressed package/RSS not measured here.
Independent review and subsequent complete-source same-stamp packages remain gates.


## F1 author repair (awaiting independent rereview)

Independent review `6d2462b0f985afe94d0ac030937274e3dac07cfd` rejected the
vector-only presentation attribute policy. Before repair, its exact
`external_presentation_attributes` real Store test reproduced all HTTP/file/data
fill/stroke inputs succeeding with one PNG each (exit101). Disabled resolvers
were still intact; this was a silent unsupported-paint success, not evidence of
network/file access.

Repair puts shared attribute resource preflight before either text/vector branch:
all presentation values use `safe_value`; style declarations retain `safe_css`
so ordinary vector CSS comments/local paints remain supported. Added the same
three vector-only negatives to the author's permanent Store regression. No font,
IPC, authorization, decoder or independent-review file changes.

Necessary repair verification: `cargo test --offline --locked --manifest-path
src-tauri/src/attachment_media/harness/Cargo.toml --test review104 --test svg104
-- --test-threads=2 --nocapture` with the same shared target/jobs2/incremental0 and
`SVG104_FIXTURE`. Independent groups4/4 and original focused groups4/4 pass.
External presentation outcomes are each `accepted=false files=0`; internal
local-gradient/stylesheet, Chinese/tspan,50 frozen source hashes/text ROI,
HTTP/cache/replacement/revocation and post-render authority checks still pass.
Original rejected report is unchanged; only another agent can accept the repair.
No unrelated media matrix, native package, device or benchmark rerun.

## root integration accepted

2026-11-10：F1窄修99e220c1由不同代理59cbbf74接受，root17产品文件逐字整合后再由同一独审者核直接Git blobs；唯一combined review1045/5+svg1044/4通过。报告[整合独核](../reviews/app-svg-thumbnail104-integration.md)，含字体/OFL/locks、103Manifest和网络XML前后未变。字体使用APFS clonefile避免独立物理副本。没有包含104的新Mac/Android安装包，105新协议性能测量尚未运行；不把源码接受当作原生交付或完整覆盖性能接受。
