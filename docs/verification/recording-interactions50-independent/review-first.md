# 50 首固定源独立审查：BLOCKED

准确固定提交9141dff1941c433f3c916d60d84110867afc9ee9，工作树 /private/tmp/apple-notes-recording-window50-independent-01。只审50与相关生产接缝，不含52预检。全部19变更文件测试后仍与固定提交相同。

首阻塞：实际RecordingWindow/Panel/Session/RecordingOwner中，第一次submit relay在owner.receive之前失败，child却已transferred=true。第二次真实close重试不带File：attempts2、transfers0、decoded0、saves0、phase retry。check-relay-browser.mjs、relay-first/relay-retry-observation.json和原始stdout/stderr保留。修复不能把收到文件和真实正文ACK混为一谈；应缓存同编码在接收确认前可重送，owner只构造一次File。

第二阻塞：child在真实原A正文ACK前Destroyed。生产Rust函数在受控Tauri窗口/事件/状态边界下执行，随后原owner saved和Quit ACK均到达，仍exitCalls0/quitPreventedtrue/新注册被拒；异常child entry永久保留。原native-registry-first与修正退出预期的native-registry-corrected-first均保留。生产App闭包/SaveQueue也证明store1/save1/insert1已saved后ticketReleased仍false，日志owner-late-ack-first.*。需由真实原owner终态ACK清理失去child的guard，并释放原ticket，错误/未知/冒认必须保持保护。

已通过的有限检查：生产App父闭包31、preview19、手机Panel25、Rust registry/barrier2、TypeScript。组件12和child5行为断言均跑完，但并行启动Vite占用24678端口产生WebSocket pageerror，最终门禁exit1；保存failure.json及stderr，属于检查环境冲突，不计产品PASS或额外产品FAIL。之后浏览器检查必须串行/独立输出。未下载依赖、GUI/TCC/真实麦克风/用户数据操作。

Rust独立probe包含准确原模块，仅移除tauri command属性并把内doc注释变普通注释，以替换Tauri的window/state/event/exit边界；函数体未更改。它不是实际原生窗口或真实退出验收。初始已有rlib有多种serde/serde_json特征组合，设置和不匹配编译尝试原样保留，最终选用现有兼容组合，不安装或更改产品依赖。

本轮只声明两个可重复工程阻塞；新修复版本及后续发现须另存。原始录屏、原版Notes、原生包双窗和音频/像素验收不在此证据范围。
