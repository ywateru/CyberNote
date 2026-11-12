# Modernization101 r2 — independent actual Mac verification

Verifier: independent verify agent `/root/design100_independent`. Date: 2026-11-09/10 Asia/Shanghai. This report records a bounded native UI smoke test, not a replacement for source-level regressions or a claim that every requested scenario passed.

## Artifact and safety boundary

Application launched through CUA from the exact path `artifacts/releases/20261109-modernization101-r2/CyberNote.app`. Runtime settings showed CyberNote 0.1.0, build `2026-11-09 14:41:51.600 UTC`, Git `bf26dae17f972fc09276deb456b4599e1ebe5d67` (`+modified`), fingerprint `1c99f39a70e9a00399e40cd8b298b0531929dd9ed518007a44602875bf5efb7f`.

All GUI observations/actions used CUA native AX/screenshot/input APIs. No GUI automation through shell, no Cargo/build, no OS privacy change, no TCC reset. Only the verifier-owned note **FINAL101 Mac 速绘与附件**, in 快速备忘录, was edited. Other notes were visible in the list but not edited. Theme/font settings were inspected, not changed. Final state is the owned note with no open picker/menu/recording dock and playback stopped.

Evidence root: `artifacts/final101-mac-r2/`.

## Observed results

| Path | Actual result | Evidence |
| --- | --- | --- |
| Desktop settings | Side navigation, appearance cards and separate five-step interface/editor controls visible. Existing system theme / 小 font values retained. Native top toolbar remains rendered, gray/disabled while the settings modal is open. | `settings-toolbar-visible.png`, `settings-version.png`, `settings-runtime-version.ax.txt` |
| Drawing opening/background | Added own sketch; drawing canvas opened with no text field focused. Selected 中网格. AX focus remained HTML content; no macOS software keyboard was shown. | `drawing-grid-before.png` |
| Drawing wheel input | Actual CUA macOS scroll API down 0.2/right 0.2, then an own stroke followed by down 0.15/right 0.15. The zoom indicator remained **231%** throughout. Vertical input changed the grid phase and moved the stroke out of view. Horizontal input was issued but did not yield distinguishable visual displacement in the periodic grid screenshots. | `drawing-grid-pan-vertical.png`, `drawing-grid-pan-both.png`, `drawing-stroke-before-pan.png`, `drawing-stroke-pan-vertical.png`, `drawing-stroke-pan-both.png` |
| Drawing save/reopen/menu | Saved stroke/background; single click on 编辑手绘笔迹 reopened the saved sketch. Canceled the unchanged reopened panel. Right click exposed 编辑速绘、复制、剪切、粘贴、导出 SVG、删除速绘. No cut/delete/export was executed. | `drawing-saved.png`, `drawing-single-click-reopen.png`, `drawing-context-menu.png` |
| Local files | Imported only five owned small fixtures: PNG, SVG, WAV, MP4, TXT (total about 240 KB), from `/private/tmp/cybernote-final101-android/fixtures`. SVG and PNG rendered as images, video as playable poster, WAV as audio waveform component, TXT as file card. | `media-imported.png`, `gallery-photos.png`, `final-own-note.ax.txt` |
| WAV activation | Clicked 播放; AX changed to 暂停 and enabled waveform slider; actual duration resolved to 0:03. Playback completed. The initial/reopened unloaded card reports 时长未知 until media activation. | `audio-seek.png` and recorded CUA AX |
| MP4 activation | Clicked own video poster; actual WebKit video controls appeared with Pause, elapsed time, duration 3 seconds, volume/mute/fullscreen controls. | `video-playback.png` and recorded CUA AX |
| Gallery → note | 查看附件 entered gallery with photo/video, audio, document, all categories. Own PNG/SVG thumbnails rendered correctly. Opened the own SVG attachment options menu and selected 在备忘录中显示; returned to the same owned note with that attachment targeted. | `gallery-photos.png`, `gallery-to-note.png` |
| Table one-click menu | Inserted a 2×2 empty table at the end of the owned note. One click on 选择列 selected the column and immediately opened native 在左侧添加列 / 在右侧添加列 / 删除1列. Dismissed menu without destructive action. | `table-one-click-axis-menu.png`, `final-own-note.ax.txt` |

## Recording failure and verification limits

Actual native recording Start changed to 正在准备麦克风… and then **系统麦克风授权等待超时；可取消后检查是否仍有系统提示。** No recording was captured. CUA app/window observation did not show an authorization dialog. A subsequent full enabled-surface `cua.getState()` and `cua.listApps()` inventory likewise did not expose a dedicated permission surface; the inventory is not proof that no hidden/background system prompt exists. The empty recording dock was closed. No retry loop, permissions reset, re-signing, or OS settings change was performed. `recording-active.png`, `recording-permission-timeout.png`, `recording-permission-timeout.ax.txt`, and `permission-surface-inventory.json` preserve the boundary.

Consequently **recording-completion refresh behavior is not verified** in this Mac session. A timeout alone does not establish a product root cause. Source presence of microphone usage text or a request timeout also does not identify that cause.

CUA has no physical trackpad pinch interface. No physical pinch zoom or two-finger hardware input is claimed. The wheel actions exercised native CUA scroll delivery only. Read-only image analysis found the raw screenshot horizontal-grid lines changed from `y=303+120n` to `y=331+120n` after down input, while vertical-grid lines remained `x=120+120n` after right input. With periodic grid and the stroke already out of view, horizontal translation is **inconclusive**, not a passing assertion. The scale stayed 231%; it must not be presented as proof of a zoom gesture.

The audio slider `setValue(1.5)` attempt coincided with the 3-second clip ending; returned AX was at 3 seconds, so this is **not counted as verified seeking** despite the historical screenshot filename `audio-seek.png`. No waveform fidelity/long-recording benchmark was performed. Gallery audio/document category counts were observed but every category operation was not repeated. Table text↔table roundtrip, long-press timing, floating preview dragging, clipboard/export, five-font-size matrix, and Android keyboard behavior are outside this finite Mac smoke session and require their separate regression/device evidence.

## Read-only RSS snapshots

Only exact `ps` command equality with `…/20261109-modernization101-r2/CyberNote.app/Contents/MacOS/notes-clone` counts as owned. PID **49451**, PPID 1 was observed throughout. These are **native executable RSS only**, not total application memory; WebKit helpers cannot be reliably attributed among concurrently running web applications and are not added.

| State | Native executable RSS (KiB) | Evidence |
| --- | ---: | --- |
| Normal own note before media import | 92,512 | `rss-normal.json` |
| Small-media gallery after playback activation | 129,520 | `rss-gallery.json` |
| Returned owned note, playback stopped | 104,432 | `rss-after-playback.json` |

An initial substring process classifier accidentally included its own sampling shell PID 53217 because its command text contained the bundle path. The normal JSON has been corrected to remove that sampler and documents the correction. These sparse point samples do not establish a leak, peak, or performance improvement.

## Disposition

The bounded settings/drawing reopen/media activation/gallery-location/table-axis paths above were observed working in the exact r2 runtime. No product source was modified by this verifier. Acceptance is limited to those observations; microphone recording completion, horizontal wheel translation, physical pinch, and seeking remain explicit evidence gaps. Final own-note AX and screenshot are `final-own-note.ax.txt` and `final-own-note.png`.
