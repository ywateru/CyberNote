# FORMAT102 v2 — close-only phone diagnostic

2026-11-10, Asia/Shanghai. This run did **not reproduce** the original r2 panel disappearance. No product fix or final-release acceptance is claimed. Original r2 evidence remains valid and the cause remains unestablished.

## Artifact and limited gate

Isolated source review HEAD `dff5ed501f02ff6fa35a566b5ae8d6f5a4e26716`, product fingerprint `e47728b9654af12607d6695a70dbbd90f87f9aa1f8e4e35fc0c3b7a1c27cab25`,439 inputs. The exact reviewed product blobs were checked before and after building. Only two reserved plugin Android generated roots were untracked; both were outside product inputs and retained without deleting active caches.

Evidence base: `/Users/water/work/2026/Apple-Notes-Clone/artifacts/mobile-format102-native-diagnostic-v2/`.

Version `0.1.0`, target `android`, prepare `2026-11-09T19:48:11.537Z`, frontend build `2026-11-09T19:48:19.868Z`. APK `CyberNote-Android-DIAGNOSTIC102-arm64.apk`,38,475,914 bytes; SHA256 `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178`. Actual primary library SHA256 `d921c657a4e0ea199aa4d860d3dcc8d35561a7bc9745d4ea95789a7dfd22257e`. Certificate SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79` matched the installed v1 diagnostic before preserving `install-r`; no uninstall or data clearing. Actual DEX SHA256 `86f79d894aa67c0a763e5eb781bb575d91c2beaa62a4354c085fe0fa2a3c9436` is identical to v1, whose bounded native sink was already independently inspected. Actual library/codegen-embedded metadata/runtime, signing and alignment were verified separately before install authorization. See `android.json`, `android-source-assets.json`, `completion.json`, source pre/postflight, build log, frontend/codegen copies and tool SHA records.

**Full `lintUniversalRelease` failed:** `MissingTvBanner` and `ImpliedTouchscreenHardware`,30 warnings and1 hint. It ran unmodified; only the already verified Rust library rebuild task was excluded to avoid invoking Tauri RPC outside the package build. No lint issue was suppressed and no product source was changed. APK bytes remained unchanged after lint. Parent explicitly authorized this exact package only for a bounded Samsung/API28 phone diagnosis; task103 separately owns the Manifest errors. This is not a final-release lint pass or publication. Full failure report/log are preserved in the evidence base.

## One fresh-process case

Samsung SM-G9500, Android9/API28, arm64,1440×2960, serial `98895a3147304c3132`. Same-certificate install and normal fresh Activity start produced PID1793. Evidence `device/install-cert.json`/`install-r.txt` preserves the upgrade. No other workflow was taken over. Every input in `device-phone-case/actions.jsonl` has a CyberNote foreground guard; every dependent input was preceded by observed screenshot/XML state. Only one new self-owned note was created; user notes were not selected for editing.

1. Create at `(1248,2708)`; enter ADB ASCII `FINAL102-Android-IME`; observe screenshot/XML.
2. WeType retained `final` and offered an `AndroidIME` floating candidate. Enter committed it into single-line `finalAndroidIME`, rather than the requested literal marker or a new paragraph.
3. The original command `alpha%sbeta%sgamma` produced a floating composing string `alphabet'a'gam'ma` and candidate `阿拉伯符号码`. The screenshot had a collapsed caret, not the original r2's already selected title. Full keyboard was not visibly rendered although Android reported IME shown. Actual transformation is retained without correcting/retyping.
4. One Back hid the candidate/IME and **stayed in this new own note**, confirmed immediately in `06-after-back`. Only then perform original `(120,1745)` blank-area tap, observe the still-owned note/real format button, and click `(115,2810)`.
5. `08-format-stable` shows the complete panel. XML measured title `[96,600][1344,740]`, panel `[0,1860][1440,2900]`; IME reported hidden. This verifies the exact original hold point is actual title text; no scrolling was needed.
6. Perform the **only hold**, stationary `(600,670)`800ms; capture `09-after-only-hold` immediately. It shows nonempty full-title selection with handles, Android Cut/Copy menu and complete format panel together. No style command was issued.
7. As authorized for sink validation only, tap the actual close control once at `(1288,1956)`. `10-manual-close-sink.xml` has no format close control/panel; its fixed-tag log records exactly one event with `reason:"confirm"`. No input followed this manual close.

## Diagnostic silence and sink proof

The close-only source restores the original pre-event paths, with no diagnostic pointer/focus/selection listeners, subscriptions, DOM reads, rAF or pre-close console/native calls. Fixed-tag PID-filtered logcat was read without clearing any global buffer and without collecting other-app logs.

All saved logs through format-open and after the longpress contain **zero app diagnostic records**. Some files contain logcat `beginning of main/system` headers; they are not literally zero-byte files. This corrects a brief progress-message shorthand. Panel persistence is established by the screenshot/XML, not inferred from log silence alone.

Only after the explicit manual close did the sink emit:

```json
{"sequence":1,"kind":"panel","open":false,"blocked":false,"authorized":true,"visible":true,"reason":"confirm"}
```

Thus the native post-close sink worked, budget was1/100, and no pre-close diagnostic call was needed to observe this non-reproduction. The manual event proves the observer, not an automatic failure. There is no automatic close reason or metadata/access/window-focus causal chain to infer in this case; v2 intentionally does not log those pre-events.

## Limits and preservation

The same command structure and exact hold coordinate were exercised after removing v1's pre-event synchronous logging. That reduces one timing concern but cannot prove why the original failure occurred. Actual title, candidate and initial selection still differed from r2. This single bounded run cannot declare a fix or cancel the original observation, and no further device case or source change followed.

`device-phone-case/result.json` preserves machine-readable outcome and boundaries. `settings-before.json`, `settings-after.json`, `settings-comparison.json` confirm original default/enabled WeType IME and both rotation settings unchanged. No settings restoration mutation was needed. No formatting, deletion, export or user-note edit was performed; database immutability was not separately audited. The new self-note is left selected with its panel manually closed. Diagnostic APK remains installed, unpublished; final product delivery and lint correction remain separate work.

Completed-task cleanup candidate only: `aligned-unsigned.apk` (38,406,979 logical bytes;38,408,192 allocated bytes) is redundant after verified signed installation. Listed with SHA in `cleanup-candidates.json`; not deleted by this agent. Signed APK, extracted binary/manifests and original evidence remain; active shared target and Gradle/plugin caches must remain for subsequent final builds.
