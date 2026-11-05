---
id: app-mac-recording-diagnostics63
scope: bounded opt-in Mac recording authorization diagnostics and structured errors
status: in-progress
depends-on: [app-mac-recording-access52]
---

## objective

为既有Start授权超时增加可因果区分的源码诊断，保留原有UI文案、授权顺序、单pending和所有资源生命周期。依据研究61，当前证据停在AV预检，不能假定WK/getUserMedia已执行，也不能将签名mismatch判作唯一根因。任务只源码与受控验证，不启动/替换当前Mac17，不触原Android现场。

## context

阅读docs/INDEX.md、docs/ui/recording-desktop.md“授权诊断63”、docs/research/mac-recording-access-next61/README.md、52任务及独审。项目遵循docs-sprint开发/独审分离。研究62的已保存附件菜单差异另行保留，不在此实现。

## path

允许src/native-recording-access.ts、plugins/tauri-plugin-notes-ui/{guest-js/index.ts,src/lib.rs,src/macos.rs,macos/recording_access.m}，必要独立诊断helper及针对性scripts/check-mac-recording-diagnostics63*，作者证据docs/verification/mac-recording-diagnostics63/。只在需要时修改原52检查的FFI签名以保持现有真实实现测试。禁止改UI/CSS、Session/Panel/Dock/owner/transport/save、数据库、权限策略、能力配置、签名或依赖。不得读取/导出任何真实音频或笔记。

## contract

1. 诊断默认关闭，由明确进程环境开关开启；不新增产品UI、自动重试或挂载/启动授权查询。开关只影响诊断输出，不影响API返回、pending、截止、线程、授权和资源行为。使用进程内有界事件预算（至少明确固定上限及截断标记），组件不自行持久化文件、无网络、无音频/笔记/路径/标题/窗口裸指针。受控测试可将合成事件输出保存为本任务证据。事件只含固定stage/code、无内容request ID、单调时间、公开status及Boolean等最小标量；不可任意序列化错误对象。
2. 一个明确Start对应的Rust→ObjC链共用request ID。至少区分Rust派发/原生入口、主线程和window校验结果、pending busy、发请求前公开status、request-issued、30秒finish、OS completion-entry（必须在dispatch main之前、线程安全且不访问AppKit）、main completion处理、pending清除、Rust收到结果/等候截止、成功后window复核及最终交付。取消/关窗/异常/迟到必须可以区别；不得让日志本身抛异常跨FFI或改变context所有权。
3. 不增加status查询次数。pending仅在真实completion或既有异常路径清除，timeout/close不释放仍可能被系统block引用的context；系统completion迟到仍不二次交付。保留30/35/35/45秒层次，不延长、不缩短、不绕过AV预检/WK策略，不为诊断触发requestAccess/getUserMedia。
4. JS authorizeNativeRecording必须保留原生结构化错误code及可选诊断stage/request ID，保持Error.message供原UI展示；不得把timeout/busy转为denied。普通Error原样向上传递；未知错误仍给既有明确失败文案，不能伪装授权。默认关闭时是否返回安全stage须明确记录，不得暴露用户内容。
5. 本项不宣称已定位真实根因、有效收音、设备录音或像素通过。Session层和跨窗诊断后续按真实缺口再拆，不因本任务扩张整个录音链。

## verification

先冻结源码再独审。对真实生产原生类使用现有52替代OS/假时钟边界，至少验证no-callback→timeout→busy、timeout后late-completion、close后late、异常、已授权/拒绝/受限与结果不一致；比较开关前后reply/request/status查询/release次数及顺序不变。callback-entry须在main处理之前有可验证事件，而非在main内重复命名。覆盖迟到receiver/context只最终释放、进程预算/截断/默认关闭零诊断、结构化JS错误和普通/未知错误。可以编译/运行受控原生测试，但不得启动真实麦克风请求；原生Cargo/ObjC构建须先与root串行协调。运行typecheck/build及必要52回归，失败证据保留。日志和报告不得包含真实媒体或用户笔记。源码和作者证据可分提交，独审绑定准确source SHA。
