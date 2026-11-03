# 统一候选 3edc4ad0：Android 独立实际有限验收 01

日期：2026-11-04（Asia/Shanghai；实际 00:36–00:40）。执行者 verify。结论：**本轮有限功能范围 PASS；播放器展开存在已知阻塞，移动进度/±15s 未验收；不是整体完成或像素一致验收。**

## 精确输入与独立身份

独立操作对象是设备 `emulator-5580` 上已经安装的包，非当前主源码的推定构建。安装路径实际读回 base.apk：301366970 bytes，SHA256 `3edc4ad07524f630d694c0695cbde34bc4a02aa3c36f1fba0bd44a8de80574bf`，PID9355。构建冻结源 `f4d3a0273de35e7fc4e59c595630ba76aa9a900b`；216 项输入聚合 `a6b191546c39f2bf1c431e7547228a2714f79e355376a686380c89efd2299939`。独立将已跟踪输入与冻结 git blob、生成/依赖输入与实际文件逐项重新哈希，216 项全部相等。不能据此宣称完整依赖和工具链可复现，也不能把后来 Store 主线代码算入这个包。

开发构建证据 22 文件 manifest、Android 开发证据 48 文件 manifest 已独立全量重新哈希匹配。首次证据解析器假设两个 manifest 都有 files 数组，遇构建目录实际 path-map 格式而 KeyError；没有设备动作和产品变更。最终 `rehash-evidence.py` 显式处理两种实际格式，重新读取验证全部文件，原始失败及修正已在结果中说明。

运行环境实际为 Android11/API30、WebView91.0.4472.114；physical1080×2280、density440、CSS393×751、DPR2.75，无尺寸覆盖。已准许 RECORD_AUDIO 保持，host mic OFF 保持。没有应用/模拟器重启、卸载、清数据、重置权限或新录音。

## 实际通过范围

1. **原媒体与数据**：使用既有合成 note `a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3` 和 attachment `cb3fa001-9d73-4580-b959-38481fbba90b`。实际 app 根目录 `attachments/cb3fa001-9d73-4580-b959-38481fbba90b.webm` 在开始和清理时各独立读出并重新哈希，均429547 bytes、SHA256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`；证据保留一份原文件。只读 Rust workspace 保存完整 MEDIA02 与 QA-PAPER 三篇测试笔记、attachment 对象及总附件数；本轮最终 JSON 与基线严格相等，媒体 revision30、纸张 revision58 没有增加。
2. **初始显示与真实播放暂停**：原生返回列表并打开媒体 note，实际卡片“录音 · 1:06”；第一次采样及用户播放前采样均 currentTime0、pausedtrue，readyState4、errornull。第一次观察时解析已完成，因此只证明解析后的采样位置0/暂停，不能声称观察了之前所有瞬态或完整无自动跳转历史。主 audio duration/seekable upper 仍Infinity，与有限显示时长分开报告。真实原生播放后 currentTime0.513487、pausedfalse；真实暂停后1.45205、pausedtrue；再隔600ms读取，仍1.45205。该序列采样 error 均null，不代表完整媒体事件/错误历史，也没有可听音频验收。
3. **真实导航与归属**：paper→list→media→list→paper→format/paper panels→list→media→list→paper，全程由 Android input 执行触控。两篇实际文档、附件及真正 note/session/epoch 父 key 与各自 note 匹配；纸张无音频节点，媒体无纸张正文。媒体重开后 time0/pausedtrue。笔记切换重新挂载属于正常行为，本轮没有声称跨 note 保持同一 editor 实例。
4. **最小纸张选区 smoke**：实际长按选中 bold Beta，selection39..43，打开格式并关闭，再原生 Back 关闭 IME。More→横线与网格→取消→重新打开（grid-large 已选中）→原生 Back。四个 picker 开/关检查点完整文档、selection、真正父 key 都相等，CDP 持有的实际 Editor/View/DOM 均严格 `===`。面板期 editablefalse、无IME；返回 editabletrue、无IME。没有改纸张样式，未重复七态和短屏矩阵。实际截图已目视复核音频时长和纸张选中卡片，不据此宣称像素一致。

## 保留阻塞与未测边界

本轮独立只读确认 `.audio-expand` displaynone、0×0，实际 range不存在。开发此前单次原生 summary 双击没有展开而唤起 IME，原始冻结证据已重哈希匹配；本轮没有重复该失败，没有 DOM点击/CSS修改/React状态写入替代用户入口。**移动展开修复、真实 range拖动、±15s与上下界 clamp 仍未验收，不能标通过。** 后续需可达源码候选及新包另验。

未重复首次拒绝/准许权限、录制保存/取消、声音、完整66秒 ended、受控失败、Store新操作API或附件前端事务；旧 dba 包证据不能跨记为本包通过。没有 iOS 真机、iOS safearea、Mac F07实际或原版公共 ROI 像素比较。本轮 Android功能通过不解除这些边界。Mac开发另报 sealed 包 startup 白屏，独立 verifier 本轮未操作Mac，也没有重复要求解锁。

## 方法、清理与交接

`runtime-probe.mjs` 仅通过 CDP 读取实际 DOM、HTMLMediaElement、真正 React祖先key、编辑器JSON/selection及实际 Rust `load_workspace`；`Runtime.callFunctionOn` 仅比较持有对象身份。所有 UI动作走真实 adb input，没有调用产品命令、更改 editor/ref/store/React、包装平台API、安装全局observer或伪媒体。仅创建 verifier 自有 CDP handles和本机9227转发，已释放和移除；最终 forward列表为空，没有设备XML。

2026-11-04 00:40 正式交回 Android：emulator PID3197/original session73263保持；app PID9355，纸张测试 note `1a0718dd-c71c-4192-89b6-bd58cb9ba475` / grid-large，菜单、纸张面板和IME关闭，当前纸张页无音频、媒体最后暂停。导航重开使当前 selection回到正常起点，不把早前39..43的面板保持结论误写为最终还在该选区。

证据目录：`docs/verification/unified-f4d3a02-independent-01/android/`。关键文件 `00-identity.json`、`09-audio-finite-result.json`、`23-paper-picker-result.json`、`30-navigation-result.json`、`31-source-evidence-rehash.json`、`32-cleanup.json`、`result.json`、`manifest.json`。未修改产品源码、未执行主目录 git add/commit；root 串行保存。
