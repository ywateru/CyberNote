# SVG104 F1 independent repair review — accepted

Date: 2026-11-10. Independently reviewed clean author repair `99e220c16d8c109c371b9e0c8bac5d43052da070` relative to prior reject `6d2462b0f985afe94d0ac030937274e3dac07cfd`. This closes the sole blocking finding in `app-svg-thumbnail104-independent.md`; that original report and failing raw evidence remain unchanged.

The product repair is exactly **12 additions/3 removals** in `svg_text.rs`: all element attributes now pass the shared resource policy before choosing text/vector branches; `style` uses comment-aware `safe_css`, other values use `safe_value`. The former duplicate vector-only style check is removed. Disabled resolvers, font binary/SHA, text/glyph/layout/outline budgets, cache version, authorization, source stamp and atomic publication behavior are unchanged. Other repair changes are three source regression inputs and task/evidence documentation. No unrelated product edit was found.

## Independent real results

Same independent Store/Session/MediaCore test and source strings as the reject, with three concurrent requests per case:

| External presentation input | Before repair | After repair |
| --- | --- | --- |
| HTTP `fill` URL | accepted, 1 PNG | rejected, 0 files |
| file `stroke` URL | accepted, 1 PNG | rejected, 0 files |
| data `fill` URL | accepted, 1 PNG | rejected, 0 files |

Added one focused independent positive: a normal stylesheet comment/red fill, inline style comment/blue fill and quoted local gradient/green fill all successfully render the exact expected pixels. Concurrent successes still generate one cache entry. This guards against replacing the bypass with indiscriminate rejection of ordinary comments or local paint.

Actual offline locked Cargo result: independent review **5/5 pass**, author focused production-module groups **4/4 pass**. Passing boundaries include partial span missing scalar/zero size/dropped sibling; visible Chinese/Latin adjacent to off-viewport text; CSS import/comment/escape/uppercase-URL negatives; scalar/span limits; post-render real Session prepare and same-length/new-inode source replacement with zero publications; Chinese/Traditional/tspan/dxdy/anchor pixels; HTTP/cache integrity; and all **50 original frozen SVG SHA checks plus actual text ROI versus same-source text-removed contrast**. No fixture/font copy was made. Fresh outputs: `svg104-independent/f1-after.txt` and `f1-frozen50.json`.

Command retained the shared root Cargo target, `CARGO_BUILD_JOBS=2`, `CARGO_INCREMENTAL=0`, existing debug=0 harness profile, `--locked --offline --test review104 --test svg104 -- --test-threads=2 --nocapture`. No native package, device operation, large performance matrix or unrelated media suite was run. `git diff --check` passes.

Decision: **accepted for the SVG104 source/real-module contract, including F1 repair**. Prior independent font/OFL/lock/fingerprint findings and evidence continue to apply because those inputs did not change. This is not final Mac/Android packaged rendering, all-Unicode/full-SVG support, compressed bundle/RSS cost or equivalent-coverage performance acceptance. Those gates remain separate; root may now perform its narrow integration.
