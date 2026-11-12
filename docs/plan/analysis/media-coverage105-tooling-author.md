# MEDIA105 代表项工具作者交付

2026-11-10。状态：工具冻结，等待不同代理审查；不是正式paired runner完成，也没有执行500图对测。只改measurement tools，产品、旧99P/99M gates/raw、冻结原件/SQLite不变。

## 具体变化与身份

5个工具路径：`run-media.mjs`只增加独立105模式分派；新`coverage105.mjs`负责固定角色和同一访问屏障；新`check-coverage105.mjs`跑小谓词/真实代表项；`build-media-harness.mjs`补唯一字体symlink与源SHA；`README99M.md`记录入口和限制。逐SHA、原工具副本清单与原始结果见[作者小证据](media-coverage105-tooling-author.json)及root `artifacts/media105-tool-author/before`。

旧`media-candidate.mjs`/`run.mjs`/`browser-probes.mjs`/`trace-transport.mjs`字节与动手前相同；旧99M156版本锁和候选1507d66a锁不变。105 baseline固定既存binary SHA和9个frontend exact inventory，包括missing/extra/bytechanged失败关闭；after固定接受产品a5b783…/445，完整frontend与source输入前后核对。历史baseline dirty完整源码不可恢复、frontend历史逐asset绑定限制按已接受预审保留。

当前Chrome实际更新为157.0.8103.40，因此105两侧独立固定同一个真实executable SHA `e363cda287a8dd81a8934e6aaae74e941f85c9bd0d2110a5f2a67b2741922923`和framework SHA `45f8ebf07ada22b83fcde1fa63c5da79a7c5b7ebdcc0b0250f78eff5c0f8f2a3`，启动前/运行后流式核对，无复制/下载。不能把新105与旧156 raw当同浏览器、同访问协议比较。

## 作者执行及结果

- after harness一次构建，shared root target/jobs2/incremental0/debug0；真实production Mac provider同源机械提取，唯一字体symlink，没有16MB字体副本。binary SHA `22e8bfb83b3320713aeecf0cc56f3bbd3d0e168d61566c684a91b48560b89c30`，元数据在`artifacts/media105-after-harness/performance-build.json`。
- after frontend一次构建在`artifacts/media105-after-frontend`。baseline未重建。
- `check-coverage105.mjs --unit only`：4组通过（after精确pin；baseline缺失/多出/变字节；当前source/connected/decode/2rAF；固定协议常量）。
- smoke1：实际Chrome身份156→157差异被启动guard拦截，0groups，失败证据保留。接受独立105新浏览器pin后smoke2两侧各3组通过。最后增加post-run frontend exact inventory核对与PID/最后viewport落盘，smoke3验证最终工具字节，两侧各3组均通过；不再加测。
- 最终raw：`artifacts/media105-tool-smoke3/{baseline,after}`；两侧各5 PNG(0–4)、5 JPEG(100–104)、5 textSVG(450–454)，真实产品搜索标题000/020/090后点“查看附件”。各15个ID解码成功、15个source映射到唯一真实IPC；failures/pageErrors均0。两侧相同100ms采样、500ms停留、30s截止和decode+2rAF屏障。
- baseline真实原件IPC58次/43,424,427B（包含真实启动/搜索与StrictMode生命周期，不能误叫15件总源IO）；after原件IPC0。所有实际baseline读回SHA与冻结原件一致；baseline不具备原生precise metrics，相关字段null。after目的分项见groups真实runtimeStart/End/Delta，不人为补0。
- baseline runner/host/Chrome PID2708/2730/2738、after3225/3249/3250均结束；末次空闲约39.6GB（十进制），无设备/原生包/长媒体重测。

原始JSONL包含每step实测rect/scrollTop、mount/image/source token、load/error/current decode、初次complete状态、真实IPC旁路coverageCall、HTTP来源摘要、采样成本及单独Node/Rust/renderer RSS。源关联使用相同同步产品turn中真实data getter→native atob→实际Blob创建，返回字节不替换、不额外做Base64拷贝；source关联不唯一即停止。它是旁路包装，会有测量开销，不能称零影响。可见时间只是100ms采样边界，不是连续精确时长。

## 交审与尚未实施部分

当前helper**仅支持representative workflow**，没有开放105正式mode。过滤后的5卡小画廊一屏容纳，step记录为top0，故本轮验证了当前source、load/decode/真实IPC关联和缓存complete路径；没有证明500卡几何遍历，也没有补访结果。截图中能看到5张SVG的实际文字，但未在当前工具实现逐项PNG文字ROI对照。不能用这15件成功推广到450/50完整覆盖。

独立工具审查优先核data→Blob/source→IPC关联的真实、唯一与生命周期边界、snapshot/decode观察是否正确，以及两角色exact pins失败关闭。通过后正式扩展只复用同一helper，不重建host/frontend、不重复方案研究；仍须实现450/50逐项台账、真实PNG文字ROI、固定完整startup/phase/RSS与三长媒体激活/90%seek逻辑，保留未知原因和停止门槛，再由父级给正式paired执行gate。本文不自行宣称工具独审接受或全目标完成。
