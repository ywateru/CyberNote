# OCR 宿主独立源码复审 02 证据

结论 SOURCE-READY，关闭独审01的P2预览状态残留；不代表原生OCR/真实Rust DB ACK/冷启/设备锁定或像素通过。完整报告在 `docs/plan/reviews/app-004-ocr-host-static-02.md`。

- exact candidate `5b707ae73f541bb784f08e6af0d1afdae2750c2c`，父 `2ad1e89423d1be6e872c248bfcae92ff2abade62`；只在新detached review02读取及执行。
- identity-before/after 与 runtime-source-identity 核14产品、22保护、17旧作者证据、7检查源码及37项调用的16个生产模块；只App/Host产品改动。
- 两个 ocr-sensitive-state-*.mjs 是原独审01脚本逐字节副本，来源/hash见identity-before。没有改断言或路径；仅运行cwd选择新候选。对应 original-*-repro.stdout/stderr/command 为本轮独立原始结果，两次exit0。旧失败证据与报告不改。
- ocr-host.* 为原样37项生产闭包/控制器定向检查；typecheck/diff-check分别保留命令与原始stdout/stderr，均exit0。
- author-* 为冻结作者报告/manifest原样副本，不冒称其输出为本轮独立运行。
- 本轮不重跑未变Panel/CSS、native或metadata；原320截图未知保留。
- manifest.json 保留明确files数组顺序（pathlib.Path分段排序）的aggregateSha256，同时另列完整路径字符串排序的canonicalPathStringAggregate。二者按每条hash、两个ASCII空格、相对path、LF进行UTF-8 SHA-256。manifest不包含自身；外部report hash单列。当前均为同一目录下ASCII文件，若两值相同是当前排序一致，并非省略规则。
