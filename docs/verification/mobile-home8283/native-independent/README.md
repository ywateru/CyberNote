# 82+83组合双端独立核包准备

状态：**PREPARED-NOT-EXECUTED**。仅复用80/81已实际执行过的精简只读核包驱动，改为本轮 `artifacts/mobile-home8283/verification-extract/` 与 Mac26/Android16说明。未执行核包、构建、签名、安装或启动命令，未生成任何通过结果。

根完成组合源码gate、主线回归与双端构建后，使用其准确交付的两个manifest：

```text
python3 docs/verification/mobile-home8283/native-independent/audit-packages.py \
  docs/verification/mobile-home8283/native-build/result.json \
  docs/verification/mobile-home8283/android-build/result.json
```

预期本轮产物为 `artifacts/mobile-home8283/备忘录-Mac26.zip` 与 `备忘录-Android16.apk`；实际路径、大小、SHA与源码身份须届时从真实manifest核对，不预造值。驱动拒绝覆盖已存在的result或提取目录；所有新小日志/结果写本目录，大提取物仅artifacts，不读取在途dist。

范围为提供产物与准确commit输入字节、Mac原/派生app文件和Mach-O sections、ZIP完整性与权限、APK完整性/包名/ABI/ELF、实际内嵌前端JS/CSS字节及完整有序HTML tokens、只读签名验证。原Mac严格签名失败如存在须照实保留，派生交付签名通过才可接受。不重跑79完整DEX/provider/OCR审计，也不替代真实设备/IME/OS选择器/完整WKWebView或原版像素验收。

`preparation.json`记录模板、预期入口和准备时脚本SHA；Python仅做AST语法解析，未执行脚本。最终实际运行后另保存准确命令、完整wall、自然退出与原始stdout/stderr。本轮继续保留原Android未保存录音现场，不操作已装应用、真实麦克风或用户数据。
