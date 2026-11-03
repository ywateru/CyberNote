# OCR 宿主独立源码审查 01 证据

结论 BLOCKED（P2：OCR UI 预览明文状态未在失效/结束后清除）。详细范围、复现与通过项见主报告 `docs/plan/reviews/app-004-ocr-host-static-01.md`，机器摘要见 result.json。

- 冻结候选 2ad1e89423d1be6e872c248bfcae92ff2abade62，baseline 8bc8ae2f712ebf85ec0cd79453318563e3d83a8b。
- identity-before/after 记录干净独立树、14 产品与 22 保护文件；product.diff.patch 为独立保存的产品/检查 diff。
- *.command.json 与对应 stdout/stderr 为本轮独立原始输出。两个 sensitive-state repro 为独立新增失败断言，复用冻结测试的夹具设置并执行实际生产闭包；没有修产品。
- Panel attempt01 端口 EPERM；原样脚本经必要执行权限后 attempt02 7 项通过。保留两次输出及实际截图，320px 底部画面观测不外推像素通过。
- metadata 为离线解析，无编译；baseline dependency diagnostic 是本轮另建 descriptors 的独立重现，不能冒称作者最初失败日志。
- author-* 文件按冻结候选原样复制。author-attempt-history.json 明确只含此前工具输出转录。
- manifest.json 列出本目录文件 hashes 与主报告 hash；不包含 manifest 自身。
