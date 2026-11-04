# Mac 键盘策略35独立证据

2026-11-05，verify_app。**PASS — source/mechanism scope only，SOURCE-READY，READY STOP。** 结论见[独立审查](../../plan/reviews/app-mac-keyboard-policy35.md)。

隔离HEAD`45fdc698154e23d7efac5661cb62641311cd5b17`、产品`cbcf592d464a57cc04cbe40894d0b8b48f6fb3ee`、base`e687ea6ceaa02c57e511c4a97a6187cba5f5acf0`。[identity.json](identity.json)由只读元数据取得，无Git命令。产品六路径字节核对产品提交blob；作者21项封存与完整插件33项已封存基线范围核准。[verification-result.json](verification-result.json)为86/86身份/范围/接口/证据检查通过。

[verify.py](verify.py)保存核查实现；[lifecycle-excerpts.json](lifecycle-excerpts.json)保存固定Tauri/runtime主线程生命周期原文及hash。base loose对象已打包，首轮读取错误保留在`verification-attempt01-error.json`/`verify-attempt01.py`；最终使用已独审task31的封存产品清单及35旧路径身份交叉核对，不声称读取了base树。

[independent-mechanism.m](independent-mechanism.m)直接include生产helper；[compile-command.json](compile-command.json)记录严格Clang编译，[native-run.json](native-run.json)为最终31项通过的命令及完整stdout/stderr，最终二进制`independent-mechanism`封存。先实际AppKit getter（转调super，false/false）与真实WKPreferences；后续明确切到fake provider、owned事件、手工通知和key状态。monitor nil及配置异常为仅本程序进程内注入，原方法立即恢复。无真实系统切换、`sendEvent:`按键分发、焦点移动或Option插入验收。

[release-only.m](release-only.m)、[release-only-run.json](release-only-run.json)为独立函数作用域的两窗清理复核，最终exit0、A/B均nil。早期失败材料：

- `independent-mechanism-attempt01.m`、`native-run-attempt01.json`、`compile-command-attempt01.json`：立即weak归零假设失败。
- `independent-mechanism-attempt02.m`、`native-run-attempt02.json`、`compile-command-attempt02.json`：增加pool边界后B仍存活。
- `release-only-attempt01.m`、`release-only-run-attempt01.json`：纯两窗清理仍见B存活。
- `release-only-attempt02.m`、`release-only-run-attempt02.json`：函数`__weak *`边界编译错误准确指明第二变量为`__strong *`。这是多变量weak声明的验证器错误；最终分别声明两个weak引用后通过，产品未修改。未保全每版旧二进制，保留各版源、命令和输出，最终二进制已封存。

[protected-inputs.before.json](protected-inputs.before.json)包括69项初始及2项已标注的封存基线补充，收尾见[protected-inputs.after.json](protected-inputs.after.json)、[integrity-result.json](integrity-result.json)。仅新增本目录和审查文件。未改原证据、产品、共享文档或Git，未运行完整Rust/平台包、GUI、ADB或修改系统设置。作者原有27项受控程序和16项Rust日志只核对已封存内容，未重跑完整旧套件。

[evidence-index.json](evidence-index.json)封存本目录其他文件与审查，排除索引自身。精确索引SHA由交接提供。准确新Mac包与原版同态运行仍待后续，完整交互目标继续开放。
