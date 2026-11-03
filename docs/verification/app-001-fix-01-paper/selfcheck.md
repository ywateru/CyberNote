# FIX01 纸张入口 IME 遮挡补修：开发者原生回归

日期：2026-11-03。来源：独立 P2 `docs/verification/qa-fix-01/run-8124911/finding-paper-ime.md`。生产基线8124911。**此候选开发者自测通过，仍待独立复验；不代表完整像素一致或FIX01整体验收通过。** 原冻结证据保持原样。

## 生产改动

仅改 `src/App.tsx` 的移动纸张页生命周期：打开时保存 noteId、editor、SelectionBookmark 与原 editable 状态，同步 blur 正文、冻结 editable、调用已有原生隐藏键盘接口。纸张页期间书签跟随事务映射，切换笔记使旧目标失效。取消、选样、系统Back、Escape、backdrop统一恢复同笔记选区和editable，保持IME隐藏。Mac纸张原行为不变；没有CSS、Rust、文档schema、纸张尺寸/纹理或原生inset改动。

独立快照中原纸张页底层编辑器focused=true、IME=true，视口502高，而末行卡片y592.09/h110。源码paper入口此前只setModal/setMenu，未清除正文焦点；Android原生Back可先隐藏IME而仍留编辑焦点，点击更多会再次唤起IME。本次只处理纸张页进入/退出，不顺改其他菜单。

## 构建与安装对应

顺序 `pnpm mac:build` → `pnpm android:build --debug` 均通过。未操作Mac GUI。Android `adb install -r`成功，读取实际安装base.apk，确认与本地最终APK完整字节一致，见 `checks/installed-apk.json`。构建输入与产物见 `build-manifest.json`。

| 项目 | SHA-256 |
|---|---|
| Mac可执行文件 | `b1d9997ed81875ba8cf5b809f49b69fa3b9b5970772f21072db84a962e532dd9` |
| Android APK及已安装base.apk | `a8dad8fc83153b066f8440e3928013b3b4639d765c1f5b09dbc15406d3d5765b` |
| 构建源码聚合 | `008259261680d9a0c12c19623021d433059b01e466d2e5c4cad9e8a4bf90896f` |

## 精确入口原生操作

设备：emulator-5580、Android11/API30、Chrome91、Google LatinIME、1080×2280、DPR2.75。运行新增纸张分支：

```sh
NOTES_PAPER_REGRESSION=1 NOTES_IME_EVIDENCE_DIR=docs/verification/app-001-fix-01-paper/android node scripts/android-ime-regression.mjs
```

全部UI变化经adb原生输入，调试协议只读取DOM、真实编辑器和Rust工作区；未用DOM click、focus/selection setter或编辑命令替代触摸。纸张分支按finding所需建立标题+正文合成笔记、真实长按Beta→格式→粗体→X，之后走系统Back→更多→横线与网格。没有执行旧模式后续面板矩阵或七纸张纹理矩阵。

1. 合成标题 `FIX01IME-1793691183362`，noteId `858e8937-9b94-4ce0-afec-639fae5ce7b2`。原生长按Beta选区31..35，加粗后X恢复同选区和键盘。
2. 系统Back收键盘，再真实触摸更多。`paper-more-native` 如实记录更多会重新显示IME/视口502，复现进入纸张前的状态。
3. 原生点击横线与网格后，`paper-picker-native.png/json` 为IME=false、focused=false、editable=false、视口751，选区31..35与文档不变。全部7个纸张矩形落在视口内，最末行y592.09+h110≤751；截图可见完整末行。
4. 真实触摸取消，`paper-cancel-native` 恢复editable=true，纸张页关闭、IME仍隐藏，同一笔记、选区与正文保留。
5. 再进纸张页并真实触摸最底部 `grid-large`，`paper-grid-large-native` 正常返回。再次打开页时疏网格selected=true，Rust保存paperStyle=grid-large，证明底部入口实际可触达。
6. 分别再次打开，真实系统Back、AndroidKEYCODE_ESCAPE、顶部外露backdrop坐标点击关闭。各自 `paper-back-native`、`paper-escape-native`、`paper-backdrop-native` 均恢复同选区/正文/editable，IME隐藏，仍处于原笔记。
7. 关闭后真实长按原Beta，`paper-resumed-native` 恢复IME、视口502、原选区31..35，证明底层编辑器没有永久冻结。最后系统Back收起键盘。
8. `saved-note.json` 来自Rust，Beta bold与grid-large均持久；WebView异常为0。完整断言结果 `android/result.json`，原生坐标与按键 `android/native-actions.jsonl`。

## 验证边界

类型、格式与差异空白检查通过；两端构建通过，保留既有Vite块体积提示。测试只覆盖当前设备的受影响入口和关闭恢复，没有重复Rust/归档/schema或绘画纹理矩阵；该合成笔记没有绘画，因此正文深度相等断言不冒充真实笔画矩阵。全7项可视与末行实际触摸在本候选有证据，未声称逐项在所有屏幕/IME/真机验证。取消/退出保持选区和隐藏键盘是已明确的项目契约，未把它解释为录屏已证明的原版全部触点。

原始日志按原样保留，末尾空行不作源码空白错误；源码/脚本/说明另行差异检查。完成后已停止设备操作并交回独立verify，源码和产物冻结等待复验。
