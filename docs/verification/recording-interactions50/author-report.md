# 独立录音窗口实现与验证（50）

固定产品提交：`9141dff1941c433f3c916d60d84110867afc9ee9`。工作树起点：`85fb9f1fd16730e6fdcd0e68a00d04446723a9d6`；产品基线：`d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46`。合同采用主线 `e6158b1`，合同文档副本未进入本产品提交。全部改动文件哈希见 `source-manifest.json`。

## 实现边界

桌面录音使用真正的 Tauri 独立窗口入口：规范小写 UUID 对应 `recording-UUID`，本地 query route，初始 320×600、最小宽度 280、可调整尺寸、非置顶。子窗口仅挂载 RecordingWindow/Panel/Session，无 App、私有笔记或主工具栏。移动端保留录音 sheet。

原始笔记 A 的编辑器与队列在原窗口中持续挂载。实际事务映射原始插入书签；录音期间可输入、Undo/Redo、切到 B 并编辑 B。结束时以 A 当前文档为依据插入一次附件，不切换当前笔记、不夺焦点。独立录音专用目标验证允许本地真实编辑，通用附件验证未放宽。File 字节传输一次、原窗口解码一次，重试复用同一 File/operation；只有原始 SaveQueue 与后端保存 ACK 成功才通知子窗口完成。

普通关闭原窗口仅隐藏。关闭录音窗口先安全结束采集，再等原笔记保存 ACK，最后销毁。显式退出等待所有实际文档窗口 ACK 与录音子窗口销毁；失败取消退出并保留窗口、原 File。启动时关闭早于子窗口监听器或 Panel 句柄就绪，使用 hello 握手重放关闭请求。原始 owner 异常销毁后明确报错并保留子窗口 File，新窗口同名也不能接管。强杀/进程崩溃后的音频恢复不属于本实现的保证。

Rust 进程注册表从实际调用窗口鉴别身份与消息方向。访问屏障 begin/finish 两处都只排除精确规范 recording-UUID；未知、格式错误和原始文档 owner 都继续参与屏障。子窗口没有私有文档，不能承担文档 ACK。

播放器采用真实 currentTime/seekable/seeked 确认，支持绝对定位、±15、暂停位置保持、播放结束后回到起点再播放。波形从实际采集活动时间与幅度历史生成，100ms 桶并有上限；编辑器临时卡片为视图装饰，不写入文档 JSON、历史或选区。

## 最新固定源检查

| 检查 | 最新目录 | 结果与边界 |
| --- | --- | --- |
| TypeScript | `typecheck-independent-final01` | 通过；最终 build 又检查最新源 |
| 生产构建 | `build-independent-final02` | 通过；仅 bundle 大小提示 |
| 原 App 函数、SaveQueue、原始 A 验证 | `parent-independent-final02` | 31 项通过；抽取实际函数，非挂载完整 App；原生 IPC、Editor 命令宿主和后端应答受控 |
| Session/预览播放器 | `preview-independent-final01` | 19 项通过；媒体事件、计时器与 chunk 受控 |
| 实际 Panel/Session/ProseMirror 组件 | `component-independent-attempt01` | 12 项通过；真实编辑/Undo/Redo 与装饰卡片，桌面窗口为受控 320px 宿主 |
| 实际独立 RecordingWindow 入口与 RecordingOwner | `child-entry-final02` | 5 项通过；一次传输/解码、同 File 重试、丢失成功 ACK、启动关闭、owner 失联；Tauri 与设备边界受控 |
| Rust 注册表/退出与访问屏障 | `native-registry-final01` | 2 项通过；真实临时 Store/Session 屏障，现有 dead_code 提示 |
| Rust cargo check | `native-registry-attempt01` | 离线检查通过；未生成应用包 |
| 差异空白检查 | 产品冻结前 `git diff --check` | 通过 |

浏览器组件/入口检查的页面错误与外部请求为空。受控截图已目视检查；它们是布局与组件证据，不是与原生 Notes 的像素差分验收。原手机录屏已经保存在仓库 references，50 未重新读取或复制用户原文件；50 未操作原版 Notes 录音、未导出用户数据库或媒体。

## 保留的尝试与限制

所有先前尝试与失败记录原样保留。`*-attempt*` 名称不能一律视为通过，应读取 execution/result 与日志。旧 dock/模态实现的历史截图和旧 Panel PASS 已被独立窗口合同取代，不作为当前原生窗口验收。旧附件 submission/cancellation 脚本的 fixture 失败没有计入通过，也没有为通过它们放宽产品规则；对应非本任务脚本已恢复。

本提交没有修改 `src/recording-session.ts`、麦克风插件或 Task52 权限预检。主线集成 50+52 后仍须重复最小构建、App/Panel/子入口和 Rust 检查。当前证据不证明原生双窗、切换其它应用后麦克风持续可听、编码音频有效性、Android/iOS 打包、后台系统策略或像素一致。这些是后续真实设备与原版对照验收项。

浏览器使用机器现有 Chrome/Playwright 与现有 node_modules；未安装依赖或下载工件。缓存留在本地但由本目录 .gitignore 排除；日志通过局部规则显式保留。
