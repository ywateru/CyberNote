# Candidate04 Mac 恢复、有限运行与 OCR 持久化验收

日期：2026-11-04（Asia/Shanghai）。结论：**精确 candidate04 已实际启动，AX 可读；搜索零结果→清空恢复、旧合成笔记显示、单张本地图片实际 OCR、插入正文以及正常退出/冷启动后的正文恢复通过。** 内部 ACK 调用没有独立追踪；像素一致和录音不属于本轮通过项。GUI 已释放，最后观察为 candidate04 PID 56019，停留在新合成笔记。

## 受控终止旧测试实例

旧实例曾连续绑定超时，且已有独立 1 秒线程样本。执行前再次只读确认唯一 notes-clone 为 candidate03：PID 39665，启动 Wed Nov 4 03:42:28 2026，路径 `/private/tmp/notes-unified-candidate03-mac-sealed.app/Contents/MacOS/notes-clone`，SHA-256 `f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56`。只对此 PID 发送一次 SIGTERM，0.155609625 秒后观察退出，未用 SIGKILL、批量信号、原版信号或数据清理。

**这是受控终止，不能计作旧03正常退出或保存 PASS；未知未保存内存状态、是否所有 pending 为空仍为 UNKNOWN。** 旧证据和数据保留。独立诊断在同级 `candidate03-mac-ax-timeout-diagnosis-01`，不能将其栈线索推广成04死锁结论。

## candidate04 精确运行身份

目标仅为 `/private/tmp/notes-unified-candidate04-build-01-mac-sealed.app`。可执行文件 16,005,376 B，SHA-256 `c1bece8821acb4df552da6b66664a4dec35b6ab136d8922932f92aea31929bbd`，启动前核验通过。首次 CUA getApp 因 Mac 锁定返回，没有 AX/截图，后续只读 ps 无克隆，未记为启动成功。父任务收到本次用户“已解锁”后才继续。没有重复锁屏探测或使用 Dock。

解锁后精确路径 CUA 启动在 2.9857 秒返回 AX。只读核验唯一运行实例：PID 55529，启动 `Wed Nov 4 06:15:08 2026`，路径/哈希精确匹配04。初始页面显示旧合成笔记 `QA C03 MEDIA 20261104 0327` 的正文与内联测试图片；没有点击文件卡片或下载入口。此处只是可见恢复，没有读取旧附件来证明字节保全。

搜索固定唯一无匹配字符串后，AX 显示“搜索 无结果”，编辑工具禁用；点击 cancel 清空后，旧列表和合成正文恢复。07/08 记录该转移。

## 实际 OCR 和本地保存

在 `QA 独立验证` 文件夹新建专用合成笔记 `QA C04 OCR RECOVERY 20261104 0617`，写入英文合成标记。通过应用正常菜单“添加附件 → 从图片识别文本…”和原生 Open 文件选择器选已有 fixture：

`/Users/water/work/2026/Apple-Notes-Clone/docs/verification/qa-scan-plugin/chinese-fixture.png`

该文件 70,361 B，SHA-256 `53e4caa8f5d48a7a3bbb55ba0b72b93a33bf3def9418142edbbe9f8a35facda9`，没有新生成或下载图片。实际界面先显示“正在识别文字…”，然后预览逐行精确得到：

```text
离线文字识别
备忘录扫描测试
本地保存 2026
```

点击启用的“插入”后，面板关闭，正文与列表摘要均含三行结果，工具栏恢复启用。15 是真实识别预览；16/17 是插入后正文。**UI 完成和跨进程持久化通过，内部 document/session ACK、cleanup 事务没有单独抓调用，不虚称为直接 ACK 实测。** 没有数据库读取、内部接口调用或 JS 注入。

通过 CUA CmdQ 正常退出04，独立只读 ps 证实没有 clone 进程；没有向04发终止信号。随后 CUA 精确路径冷启动在 0.709 秒返回已恢复正文。新 PID 56019，启动 `Wed Nov 4 06:19:45 2026`，路径/可执行文件哈希仍精确匹配04；恢复正文包含合成标记和完整三行 OCR。18/19/20 建立正常退出→进程消失→新进程→正文恢复链条。合成测试笔记保留供审阅，没有清理数据。

本轮未强制断网，也未收集网络观测；“离线文字识别”是 fixture 内容，不能因此宣称首次离线或零网络运行实证。结果仅限这张本地图、这条合成笔记的实际识别与持久化。

## 图像及边界

三张 CUA 图片实际均为 JPEG/JFIF，2176 × 1320，分别为 246,105、218,180、245,769 B。根据真实编码将临时 .image 文件名改为 .jpg，没有重新编码。不能称作无损 PNG、无重采样或像素一致证据；本轮也没有与原版作同布局截图配对。原版 Notes 没有被操作。

没有 file-card/download、外链或分享，没有录音、播放、屏幕/麦克风权限请求、TCC 变更，没有缓存/权限/数据库/附件清理，没有 Android 操作或构建/下载/测试，没有使用 host target。低磁盘余量提示后只保存必要小 AX 和三张 JPEG。没有后续 CUA 超时，没有反复绑定或 Dock。

`22-gui-action-ledger.json` 是根据已返回 CUA 结果整理的动作追记，不是新增操作；`result.json` 区分通过、部分观察和未知；`21-image-identities.json` 记录 fixture 与截图编码、大小和哈希；`MANIFEST.json` 对本目录证据（不含自身）逐项列出路径/大小/SHA-256。
