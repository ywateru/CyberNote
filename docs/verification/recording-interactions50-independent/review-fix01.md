# 50 第二固定源独立复核：BLOCKED（第三项待修）

准确固定提交 8e061891cb56a404bb3ec68baafe0e587d0afa67，工作树 /private/tmp/apple-notes-recording-window50-independent-02。本批保存前两项修复通过及第三项首次失败，不给出 SOURCE-READY。19 个变更输入均与固定提交相同；首轮证据已单独封存 7e0d4fe6f2fb0aa54afee07ea6f21b4e771b4820，未覆盖。

第一项关闭：实际 RecordingWindow/Panel/Session/RecordingOwner 的首 relay 拒绝后真实 close 重试，attempts 2 / transfers 1 / decoded 1 / saves 1；owner 收到才停止携带缓存文件。relay-final/relay-retry-observation.json 和串行浏览器 6 项 PASS 保留，pageErrors/externalRequests 均空。

第二项关闭：原 App 闭包/真实 SaveQueue 在 child-closed 后等真实 A ACK，ticketReleased=true，32 项 PASS。实际 Rust registry 函数在受控 Tauri 边界中接收 child Destroyed→真实 owner saved，随后新注册成功、Quit 无须再被拦；native-registry-final-new-register 通过。最初 native-registry-final 在修复后仍要求 app.exit 的断言失败原样保留：记录已为空时 ExitRequested 正常返回即可退出，这一预期已纠正，不计产品失败。新增显式新注册断言另存 check-registry-recovery-fixed.rs 及 run-registry-probe-fixed.py，保留首轮脚本字节。

防御性顺序限制另存 native-registry-reverse-order：若人为先送 document Quit ACK 再送 owner terminal，当前 Rust wrapper 不调用 may_exit，等待保留。真实 App 协议先终态/关闭→flush→Quit ACK，该逆序在授权接线中不可达；root 与原生审查者已知，不新增阻塞。

第三项首次失败：实际 App Quit listener 已 ACK success:true 后 editor.isEditable 仍 true。随后模拟真实用户仅在 editable=true 时输入，经实际 App saveDoc/SaveQueue 产生 pendingDocs 1 / saves 1 / backendStillOld true，而 native 等待集合已接受该参与者。check-quit-new-edit.mjs 与 quit-new-edit-first stdout/stderr 保留，exit 1。合同要求明确 Quit 首次 await 前冻结真实正文变更入口、失败/取消/超时合法恢复；正常后台录音和普通 hide 仍可编辑。待下一固定修复独验。

本固定源其余有限结果：preview 19、实际组件/PM/Panel/Session 浏览器 12、Rust registry/barrier 3、pnpm build、host cargo check（locked/offline）均通过。build 原有 chunk 大小提示、cargo 4 项 dead-code 提示如实保留。浏览器逐个运行，没有重现首轮并行 Vite 端口冲突。组件截图已人工查看无本夹具重叠，但不证明 Notes 像素一致；fixture 静态 HTML 侧栏缺 charset 的乱码不计产品 bug。

未操作 GUI、真实麦克风、TCC 或用户数据；未证实实际双原生窗、编码/有声、后台设备采集、移动实包或原版像素一致。全部检查仅现有依赖，无安装。最终原生包验收由 root 继续。
