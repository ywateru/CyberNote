# Mac13 独立准确核包证据

2026-11-05，verify_app。PASS / READY STOP，仅准确来源及包身份。审查见`docs/plan/reviews/mac-typography-keyboard-independent13.md`。

verify.py首次运行864断言通过；attempt01-command.json保留完整命令/输出，result.json保留清单、聚合、所有断言和签名内容保持证明。fresh-signature-checks.json是新鲜只读原始strict失败及sealed strict通过；native-keyboard-markers.json只证明静态编入标识。bundle-metadata.json不表示运行兼容性。

input-manifest.json保护374个明确文件，input-close.json及final-integrity.json再次核对bytes/hash/mtime和323冻结输入。共享target、动态dist与共享缓存未读取。attempt01构建PermissionError原始记录未变，独立verifier首轮成功，没有夹具失败或重建。

无Git/产品修改、构建、签名写入、应用启动、GUI、ADB、用户DB、安装或下载。真实运行、键盘焦点、系统切换、Option插入、整体像素与Android准确包验收仍开放。evidence-index.json包含本目录其他文件及报告，不索引自身。
