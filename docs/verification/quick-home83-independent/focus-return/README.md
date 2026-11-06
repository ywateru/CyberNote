# 返回焦点等待的独立最小复核

**PASS-FOCUSED，11项自然exit0，完整外层6.0548605秒。** 产品仍为 `d73e1f30a04ccf578f7df64b2a2b873a18c3d64d`；runner修复 `1ad73a08b52c4b38ec4693872eeda13eba3d6437`，候选证据HEAD `3fcfacb6`。当前126项输入指纹运行前后均为 `c04c48d484961b22efa6828ca27e5b4fc183ee5d00b0a8a36c5ba4528aa5029b`。78个src文件加index.html共79项，独立逐文件SHA与d73完全相同，见 `final/product-identity.json`。

根首轮组合在旧storage-overview组 `Focus trap wraps forward Tab back to header` 失败，原始进程及现场保存在主线 `docs/verification/mobile-home8283/integration/attempt01/`。作者自然复现证据 `docs/verification/quick-home83-focus-followup/natural-focus-trace.json` 第二轮rows[2]/[3]分别落other/all，最后focus栈来自DataManagement.back的requestAnimationFrame。源码 `src/DataManagement.tsx` 301–310行安排下一帧返回来源按钮，而旧runner仅等待 `.storage-summary` 出现就开始设置close焦点及Tab，DOM挂载与导航焦点完成之间存在竞态。

修复只在 `scripts/debug/storage-overview.mjs` 的back helper增加8行：读取当前真实 `data-storage-view`，点击原返回按钮、等待总览DOM，再等待 `document.activeElement` 对应的 `data-storage-category` 等于来源。原正反Tab断言完整保留，无sleep、无更换预期、无产品改动。只读提交diff与78src/index逐文件映射支持本次限定为runner顺序修复。

`run-focused.mjs` 从已提交runner文本直接提取该back helper并执行，原文及其SHA保存在 `final/actual-back-helper.txt` 与 `final/result.json`。一个受控mobile runtime扩大至原失败末尾1280px，依次all/other/all进入分类，通过确切helper返回后立即执行原close→Shift+Tab→末尾summary→Tab→close断言，共9项，再查pageErrors为空及126输入不变，共11项。透明记录focus调用栈，没有改变自然requestAnimationFrame、没有Mock调度器、没有sleep，未重复整组storage或attachments。

完整外层自然退出见 `final/process.json`，实际HTML和focus trace同目录。输出先写 `/private/tmp`，runtime cleanup并释放index/dist后才保全。当前仅定向修复通过；根后续build/production、desktop storage-overview、完整mobile attachments以及准确双端构建/独立核包另行执行，本证据不冒称组合或完整交付通过。真实Android IME/provider、Rust Store、真实麦克风、原版像素不在本次范围，原Android录音现场未动。
