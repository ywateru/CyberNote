# Mac录音统一侧栏66：Mac19准确输入准备与冻结

2026-11-05。root在66独审复验通过、主目录typecheck/build通过后，确认精确整合源 `7c1a3e424ff0cb7343cab14559efb2a92b79140b`，授权本阶段创建完整迁移计划、九字段授权与freeze。本计划与freeze完成后，root直接核对并明确START；随后实际构建与collection已完成，完整执行记录见下文链接。实际运行仍未执行。

产品 **358** 项，聚合 `6bd522cd54a6247000cf8f3ec5b7907023fcb0438ccae347882e430bfa5f0469`；完整输入 **379** 项，聚合 `b160802ef3d41e33ec42d24ecca5bcc744ee5ccc48b1469d0feca640f9bb55f1`。准确授权 [mac-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-sidebar66-preparation/mac-authorization.json) 为 39238 字节，SHA256 `b63d88fba927d3fa09ee4b822d87963f1327d4491202480c21ff75ce4aaba6be`。

以Mac18的完整353/374清单作为底表，从根目录重新计算：保留全部仍存在的历史产品和输入，纳入最终已提交的7个新检查脚本，记录10个既有输入的实际修改，移除2个确实被Git删除的旧child capability。完整迁移表、每项前后大小/SHA及新产品/输入行见 [input-plan.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-sidebar66-preparation/input-plan.json)。21个历史input-only输入全部保留且字节未变：2个store-probe manifest、5个patched ProseMirror依赖、14个Android生成输入。77个插件文件及既有产品fixture例外继续包含。

被删除的 `src-tauri/capabilities/macos-recording-access.json`（旧360字节，SHA256 `4387271bd891609b3afa7b4298d26f4db88b657b8d182474061defd47a667587`）和 `src-tauri/capabilities/recording-window.json`（旧418字节，SHA256 `e85e5603d86a4cbd7ae70fcaea0decba2f799f23c1cde93ef590044ca0b19907`）仅作为迁移tombstone记录；没有恢复文件，也没有把不存在路径放进授权。旧RecordingWindow、transport、relay及recording_window.rs仍存在，继续冻结；入口/handler断开不等于文件删除。

[完整命令与权限审计](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-sidebar66-preparation/command-capability-audit.json)逐份记录旧5份及新3份capability、两组handler列表、前端调用点、原生guard引用与未变化的插件权限资源。新handler为register_recording_local、recording_local_validate/started/revision/release、recording_quit_sealed，并保留recording_quit_ack；两组平台条件注册一致。当前capability没有新增grant；owner-window移除hide而保留show/set-focus。`macos-notes-ui.json`在Mac18与本轮源码中逐字相同，既有macOS、main/note-*范围已授予notes-ui:allow-recording-access，因此删旧recording-*授权没有造成main窗口预检权限缺口。此前漏查该未变配置形成的疑点已经撤回。

[输入冻结](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-sidebar-build19/input-freeze.json) 为 **349550 字节**，SHA256 **`b9c27e759213dd31b9ed843fd4676aa9bcb6247e76478a1f29f10e2ebe956deb`**。冻结工具只运行版本/环境/补充输入身份检查，未运行平台构建。freeze中的产品、完整输入及聚合已与计划和当前字节逐行重算核对；结果见 [freeze-review.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-sidebar-build19/freeze-review.json)。主目录HEAD仍为上述准确SHA，tracked工作树/index干净。准备文档未提交，避免改变待审HEAD。

后续必须由root直接审查准确freeze SHA并另给构建START，再调用既有candidate06 run-build/collector。工具沿用固定pnpm mac:build和既有独占隔离，后续应原子保全当时固定target .app与dist到本次prior-outputs，而非清理缓存或覆盖旧证据。artifact目标为 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-sidebar-build19`；执行阶段已在mac-attempt02下保存完整原包与独立派生包。Mac18正在运行的完整封存app及其未保存约3秒录音、Android原约13秒失败录音现场均未操作；也未读取、复制、导出、转写其音频。

本轮证据只证明精确源码/输入冻结及所述源代码映射。它不表示DeveloperID、公证、TCC、真实麦克风/回放、关闭/退出保存恢复、手机或像素验收已经通过。旧Mac18与Android历史产物保持原身份。

root准确START与后续重试授权均有单独记录。attempt01在启动前进程状态检查被拒，保全旧输出但未执行构建；attempt02使用相同工具/策略成功执行唯一正常构建，elapsed 86.476秒、exit0，collector ready=true。完整包、失败证据与签名边界见 [Mac19执行记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-sidebar-build19/README.md)。准备input-plan保留冻结时状态文字；本README更新执行结果，原授权/计划/审计/freeze字节未变。
