# FIX-01 格式面板重复附加栏补修：开发者回归

日期：2026-11-03。来源：独立 P2 `docs/verification/qa-fix-01/run-08f2776/finding-format-accessory.md`。这是候选修复的开发者取证，**待独立复验，不关闭原 finding，也不代表整体像素验收通过**。原 FIX-01、IME 补修和 QA 记录保持原样。

## 最小改动与构建

生产改动都在 `src/App.tsx`：移动端 `menu === "format"` 时不渲染 `editor-tools`，另按独立 Mac 核对把桌面“等宽”文字改为“等宽样式”，与手机统一。原有格式面板、面板自身圆形 X、SelectionBookmark、X 恢复焦点与 Android Back 契约均复用。键盘编辑时显示附加栏，面板 Back 后显示原浏览页脚。没有 CSS、Rust、原生 IME inset 或 schema 变化。

先按顺序重新执行 `pnpm mac:build`、`pnpm android:build --debug` 生成 P2 行为候选，Android 使用 `adb install -r` 保留克隆数据安装成功；只读读取设备实际 base.apk，与该候选 APK 完整字节一致。以下原生矩阵全部来自此中间候选，清单见 `native-regression-manifest.json` 和 `checks/installed-apk.json`。

| 原生矩阵中间候选 | SHA-256 |
|---|---|
| Mac notes-clone | `eb44546d592ca8b901c96634902a1b7b76e8e461aa94ff1c6be2ec7b6e718188` |
| Android APK / 已安装 base.apk | `9e6573d5d6447288a9949b9c5e511be3497a4a47b2f58460af2dbcb098834fdd` |
| 构建源码聚合 | `66b9a911ec71832d7ca33da0ee508549c5b7837804d2fc3532abd6890cd21e6a` |

原生矩阵通过后，按独立核对补全 Mac“等宽样式”文案，并再次顺序重构建最终 Mac/Android。该次与原生矩阵候选的唯一生产源码差异是该桌面菜单标签：手机原已显示“等宽样式”，编辑行为无变化。最终产物与源码 hash 单列于 `build-manifest.json`，不把中间候选的已安装字节核对冒充最终候选。按协调范围未重复整个原生矩阵，实际最终菜单文本交独立核对。Mac 未操作 GUI，既有独立核对运行保留副本。

## 原生操作与观察

设备：emulator-5580，Android 11/API30、Chrome91、Google LatinIME，1080×2280、DPR2.75。运行：

```sh
NOTES_IME_EVIDENCE_DIR=docs/verification/app-001-fix-01-format/android node scripts/android-ime-regression.mjs
```

脚本全部 UI 变化使用 adb 原生输入，包括触摸新建、系统键盘 Enter、正文输入、长按单词、触摸格式/粗体/X、系统 Back；调试接口只读 DOM、编辑器状态和 Rust 工作区。未用 DOM click、focus setter、selection setter 或编辑器命令绕过触摸。

1. 新建合成笔记 `FIX01IME-1793689590365`，实际键盘 Enter 后输入 `Alpha Beta Gamma`，形成标题与正文。真实长按选中 Beta，选区 anchor31/head35。
2. 键盘可见时 WebView 从751缩为502高，格式按钮物理 Y1352–1456，在应用可见底部1464以内。直接原生触摸格式成功，无需先收键盘。
3. `android/format-native.png/json`：正文直接衔接格式标题；面板保留自己的 X，`toolbars=[]`，面板 y491.27/h260，底边约751.27，与视口751相接。IME隐藏、Editor失焦，选区31..35保留。
4. 原生触摸粗体后，`bold-native` 中只有 Beta 增加 bold；面板无附加栏，选区保留，IME仍隐藏。
5. 原生触摸面板 X 后，`x-native` 中面板移除，同选区31..35恢复，IME显示，视口502，恰好一条非 bottom-tools 的键盘附加栏恢复。
6. 再次从键盘原生打开格式，确认仍无附加栏，再系统 Back：面板/IME关闭、仍处于同一笔记、视口恢复751；原浏览页脚恢复。
7. 原生触摸正文恢复键盘再按系统 Back：键盘隐藏、笔记保持打开、视口恢复751。
8. `saved-note.json` 证实 Rust 保存 Beta bold，WebView 异常0。完整结果见 `android/result.json`，实际坐标输入记录见 `android/native-actions.jsonl`。

## 边界

类型检查、前端构建、Mac与Android构建、两处源码格式检查均通过；Vite 既有块体积提示保留。没有扩大重跑无关存储/schema/纸张矩阵。只证明此安装候选在当前 Android11/Chrome91 设备的指定交互；原参考帧分辨率与系统栏不同，本记录不把结构修正解释为完整像素误差验收，也不覆盖其他设备、IME、组合输入或动画。WebView top83px与实际键盘 Enter 坐标是此设备夹具。

原始构建日志按原样保留，末尾空行不作源码空白错误；源码、说明及回归脚本单独执行差异空白检查。
