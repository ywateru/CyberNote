# data-management79 UI 开发与验证证据

这里保留附件全窗闪烁、图片原文件导出和数据管理的前端证据。App、Tiptap、Host、SaveQueue、权限同步与附件提交真实运行，默认 IPC 和设备为合成 fixture。真实 Rust 文件系统、平台 IO、打包由根任务和独立验收记录。

## 版本与指纹

- 产品提交：`490b2e92` → `4d744ca5` → `b980b248`。
- 第一冻结 runner：`a4ab8130`。源码 SHA256：`151e9d807aa0735f4d51410f06f654d521b9155d1f331e91ebb98de920d58e92`。
- 最终 runner 适配：`1833bb53`。源码 SHA256：`d6b0da9afeaa0f999efd4b4bd51ae48dfaab9a1a642822ae09262234df9dafdd`。这一提交仅改测试，产品保持 b980。
- 上述指纹范围为 src、scripts/debug、package/lock/vite/tsconfig 共 95 files，不包含 Rust；真实 Rust 整合指纹见根任务。

## 闪烁轨迹

| 证据 | rAF 帧数 | cover / hidden 帧 | Host / editor 更换 |
| --- | ---: | ---: | --- |
| before/timeline.json | 171 | 94 / 94 | false / false |
| develop01-quiet/timeline.json | 176 | 34 / 34 | false / false |
| develop02-quiet/timeline.json | 135 | 0 / 0 | false / false |

修复前 FileList 经 AttachmentSubmission → validatePickerTarget → trusted synchronize begin，导致 access-sync 隐藏全窗。首次 quiet 仍有 34 帧：附件 metadata 事件的 passive load 被并行 quiet validation 失效，AccessChanged 分支又启动强同步。4d744ca5 在确有可信同步进行时等待同一 proof，保留所有 owner、generation、Host commit 和同步 gates。

强同步、prepare、陌生响应 session、trusted load 失败仍提起安全遮罩。最终新组在整个附件事务内同时观察 rAF、MutationObserver、Host/editor/已有 image 身份，正常链均无遮罩、无 hidden、无重挂。

原始观察脚本在 observer-scripts。它们保留当时的绝对工作树路径，不应在新版本运行后冒充修复前证据。develop01-quiet 是观察复跑；首次 assertion 提前退出未生成完整轨迹。

## 定向验证与失败原件

| 目录 | 结果 |
| --- | --- |
| develop03 | 首次完整新组失败：Tauri plain object 错误显示为 [object Object]。b980 修复错误信息提取。 |
| develop04 | 初版新组 31 项通过，其中含重复 no-errors 统计，不作为最终计数。 |
| develop05 | 陌生 session 负例触发预期 App 恢复错误，runner 的 app.state 查询被 APP_ERROR 拒绝。后改真实 DOM 等待并明确 dismiss 预期错误。 |
| develop06 | 桌面新组 32 项业务检查加通用无异常，共 33 项通过。 |
| develop07-mobile | 初次移动 runner 尚在 folders 页面，附件 choose 明确拒绝；后改真实 note.select 进入笔记页。 |
| develop08-mobile | 移动新组 33 项通过。 |
| revision01-mobile-attachments | 旧组与新组串联时撤权断言失败，fixture reset 遗留先前 unlocked Set。 |
| revision02-mobile-data | 修正真实 notice selector 后新组独跑 33 项通过，确认串联状态残留原因。 |
| revision03-mobile-attachments | 最终组合 75 项通过，natural exit 0，pageErrors=[]，指纹 d6b0da9a，运行期间源码不变。 |

新增负例包括真实图片卡缺文件、文件选择器等待期间撤权无导出/无成功提示、quiet trusted response 陌生 session cover。正常卡、预览和管理页都比较同一个附件 ID 的原字节。样本为合成 1×1 PNG，预览图用于确认界面入口，不代表真实照片质量或大图性能。

## 冻结整轮

frozen-a4ab/commands.json 保留每个子进程的自然退出和完整墙钟时间。source-start/end 指纹相同；有 summary 的检查均 sourceInputsChanged=false、pageErrors=[]。

| 命令 | exit | 完整墙钟 | 结果 |
| --- | ---: | ---: | --- |
| build | 0 | 6.930 s | 通过 |
| production | 0 | 1.997 s | 调试 API 与 bundle markers 排除通过 |
| desktop | 0 | 58.722 s | 230 项通过 |
| mobile-notes | 0 | 6.248 s | 9 项通过 |
| mobile-recording | 0 | 13.698 s | 43 项通过 |
| mobile-attachments | 1 | 15.815 s | 旧图片点击选中断言过时，失败原件保留 |

旧移动附件测试通过点击图片来选择节点；本轮图片点击按新交互打开预览，故等待 ProseMirror-selectednode 超时。1833bb53 改为实际普通文件卡选择，仍检查替换和 Undo，并额外确认原图片一直保留在正文。图片预览和导出在新组有独立检查。

同一修正显式初始化 fixture unlocked Set，避免 reset 后沿用旧授权。最小前后诊断见 fixture-reset-diagnosis.json。同时把撤权成功提示断言从不存在的 class 改为真实 image-export-status[role=status]。

根任务要求作者只重跑受影响的移动附件组合。最终 revision03 75 项、exit 0，完整墙钟见 revision03-command.json。根任务负责最终整合源码的整六项与出包。

## 范围

- 全部采用隔离 Chromium 与临时 fixture，没有启动或操作已安装的 Mac 应用/Android 设备，原模拟器未保存录音现场未触碰。
- size、mtime、缺失文件、目录、符号链接及 content://synthetic URI 为明确合成边界，不等于真实 Android document provider IO。
- Import prepare/commit 在 IPC 协议边界注入，App clearSensitive、trusted synchronization、Host 生命周期仍真实执行。fixture 归档不是 Rust notesbackup 格式。
- 数据管理页面只读取清单 DTO，不读取附件 payload。几何覆盖 320 浅色与 390 深色，保留 PNG、HTML/geometry snapshot。
- runtime reset 不再清除 pageErrors；异常跨测试 reset 保留到 CLI summary。

## 独审陌生 authority 竞争及最终修正

上面的第一轮通过不代表竞争不存在。独审在冻结 1833 runner 的一次真实新组运行中捕获陌生 session 无 committed cover：21 帧、7 次 MutationObserver，cover/hidden 均 0，旧 editor 随后已拆除。原件复制在 revision04-authority-cover/independent-before-unknown-session-timeline.json。

产品修正 1e16c9fe：quiet 异步 load 返回陌生 session、operation 或 suspended 时，使用 react-dom flushSync 提交遮罩，再进入已有 rAF 和可信 hydrate。单纯 rAF 不是 React state 的提交屏障，旧实现可能把 true 与稍后 false 合批。flushSync 仅在 await load 之后的异步分支运行，不在 render/effect 中调用；正常已知 authority quiet 路径不触及它。原授权/metadata gates、原 owner、实际 Host commit 均保留。

修正源码指纹 db1ce52c7bc97aa4dde4035290d3a23c9f9da68c59167e907c61ed0be92b848a。revision04 两端新组 33 项均通过，pageErrors=[]、源码未变：

| 平台 | 正常 quiet 帧 / cover / hidden / 身份变化 | 陌生 session 帧 / cover / hidden | 自然完整墙钟 |
| --- | --- | --- | ---: |
| desktop | 90 / 0 / 0 / 0 | 24 / 1 / 1 | 401.934 s |
| mobile | 95 / 0 / 0 / 0 | 21 / 1 / 1 | 444.559 s |

build 自然 exit 0、11.676 s。两个浏览器组均在约 20 秒输出通过 summary，但 Node cleanup 长时间保留 Vite HTTP listener 和 esbuild，最终自行自然 exit 0；没有终止或 process.exit 包装。其异常长的完整墙钟原样保留在 command JSON。只读 inspector 诊断仅针对作者 desktop 进程，未注入应用/源码状态；mobile 未连接 inspector，亦自行自然退出。

外部 runtime 副本分段探针检查 context、browser、Vite watcher/ws、client/SSR container/optimizer、HTTP server 的关闭，完整 33 项探针自然完成，client pending=[]，未复现等待。探针和日志在 revision04，不能据它认定原延迟根因。

runner 最小设置修正 ad982ee8：显式预构建 react-dom 与 react-dom/client。当前 plugin-react 默认 include 已有 root react-dom，但不含 client 入口；这里不重写 cleanup，不增加退出超时/强制退出。revision05-react-entries 串行对照新组自然 exit 0、23.544 s，33 项、pageErrors=[]、源码不变；正常 98 帧 cover/hidden/身份变化均 0，陌生 session 23 帧有 1 cover/1 hidden。最终作者源码指纹 c1ec0c7ee06f84889438ae6a427b89e7895da8b02996b5e14e0931f9d040c4fd。

此单次对照证明显式双入口设置能够完成当前复测，尚未证实异常长 cleanup 的唯一根因；性能异常记录为 OPEN，根任务负责最终串行整合验证和独审自然退出确认。
