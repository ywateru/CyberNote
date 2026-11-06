# 冻结原生与模型独立验证

结果：**PASS-FROZEN-NATIVE-AND-MODEL**，详见 [result.json](result.json)。6 项 candidate 输入与 7d180411 逐字一致，source-before / source-after 哈希相同。

- 生产 Objective-C 隔离 AppKit harness：compile exit 0 / 1.058441s，run exit 0 / 0.606882s；真实 NSWindow zoom 几何变化及还原、控件 hit test、真实 field editor marked text、overlay 隐藏/恢复、过期 revision 拒绝和 search 值保留均通过。单击 drag 仅覆写计数，避免真实鼠标拖动。
- Rust 精准新增模型测试：content_overlay_is_optional_and_survives_strict_transport_serialization，1 passed / 25 filtered，自然 exit 0 / 完整 31.374019s；复用主项目 src-tauri/target，未新建大缓存。

执行 cwd 为 /private/tmp/apple-notes-ui8081-candidate。准确 argv、环境、wall 和日志 SHA 见 native-commands.json、rust-model-command.json；原始输出完整保全。preservation-map.json 记录初始临时输出与持久位置。编译 harness binary 保存在 artifacts/ui-hierarchy8081/verification-extract/native/，不加入 docs。

本次证据只针对冻结 Objective-C/AppKit 与 Rust 模型。未运行浏览器或 candidate dist，不证明完整 WKWebView UI/原版像素一致；未启动已安装应用，未使用真实麦克风，未触原 Android 录音现场。原生与 Cargo 测试均自然结束；共享 target 已交还根。
