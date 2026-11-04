# APP-003-TAGS independent02 evidence

Candidate a0989b354b539fc06d794f167cd97af615693d44；结论 BLOCKED。

composition-last-reference.json 是新 P2 的独立生产 App/Editor/Store 详细快照；来自完整保留的 boundary-run02-failure.json 第一场景。该文件同时保留未筛选 composition 与单标签／所有标签新建已完成断言及后续夹具失败。boundary-result.json 是仅补跑移动 suggestion 的成功结果；run03.json 为其执行摘要。run01.json、boundary-run01-failure.json 和两个旧脚本版本保留先前失败，不得覆盖或记作整轮 pass。

independent-boundary.mjs 为最新自写 App 夹具；REVIEW_SCENARIO=suggestion 可单独执行移动补跑，默认执行全部。每次 Store 数据目录需要改用新 run 名称，否则已有合成数据会影响场景。脚本只改浏览器 preview action transport，生产 App/Editor/saveDoc/queue/matcher 不替换。controlled DOM composition 不是 native IME。

ocr-attachment-replay.mjs 的 AST fixture scaffold 来自本冻结作者脚本，仅保留本地 OCR／附件段；审查者加入真实 Store conflict/retry/ACK。ocr-run01-result.json 保留实际 source-extracted callbacks、Store 请求响应与raw严格身份结果。平台 cleanup 端口合成；没有原生 OCR 或附件持久端到端声明。

identity-before/after 固定11产品SHA、CLI来源与精确hash、lockfiles、磁盘门槛和临时依赖链接解除。没有Rust编译。typecheck/schema/access 日志及结果是本轮独立执行。

manifest.json 按路径组件排序，对 `<sha256>  <relativePath>\n` UTF-8 串取SHA256；另列全路径字符串顺序聚合。manifest自身和外部报告不纳入证据聚合，报告hash单列。所有数据为合成笔记。
