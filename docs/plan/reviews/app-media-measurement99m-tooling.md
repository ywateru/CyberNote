# MEDIA99M 工具阶段独立审查

2026-11-09，审查人 `/root/design100a_verify`，非开发作者。范围 `f11d6e8e151b541e96158830d81363e11cfa5fbb..08b36d0adbc871c2ca247aba92961a9c62892a45`，工作树 `/private/tmp/cybernote-delivery`。

## 结论与准确范围

**tools-ready，工具阶段未发现阻塞项。** 不接受为正式99后测、99功能完成或完整goal完成。当前生产消费仍含Base64，精确分用途/生成逻辑指标为null，原生video provider未接入该基线；formal明确拒绝正是本轮预期。

实测产品指纹 `09b4d755ba338ba75ca5ea8cd00e8cacbee98e7872d537d20a20757b3a8a8628`，454项产品输入；author HEAD `08b36d0adbc871c2ca247aba92961a9c62892a45`。独立probe结果的dirty=true仅因新增本review脚本，产品指纹不变。复用owned harness的binary SHA256 `b3194c61e245d8948d4e5f927a424b09bbbd119d1c21df532ce345a5f480f039`；运行前所有记录的生产源、transport和二进制SHA重新校验，无陈旧输入。

## 独立实测

1. 独立复跑 `check-media-tools.mjs` 到全新 `artifacts/media99m-independent-tools`，10项检查全部通过。503原件715,371,216B逐一流式SHA前后比对、503唯一SHA；manifest `3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351`，冻结SQLite `67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf`未变。新工作Store仅复制SQLite、503硬链接，新增原件字节0。
2. 真实原件HTTP200为661,678B，SHA与JPEG原件一致；Chrome156直连Rust HTTP206读前1024B并核字节，直接解码63,438B/160×115派生PNG。外来Origin403；没有Node媒体响应代理或小图替身。
3. 从原始独立观察值另重算warm payload：`661678 + 1024 + 2 × 63438 = 789578`，精确等于生产聚合bytesRead。generation1/hit1；clear后generation2，clear本身没有payload读取。最终activeStreams0，peakReadBlock65,536B。指标为源payload读取量，不等于OS物理IO或decoder内部读取。
4. release后URL拒绝，真实Session prepare在96,754,277B MP4无Range读取中断流（本次客户端已收到32,664B，不等同Rust已读量）；新grant被access_changed拒绝，abort后恢复。host关闭窗口撤销旧租约，重开incarnation可重新签发。不是合成撤权/媒体字节。
5. 新独立 `review-media99m.mjs` 直接发送raw line请求给同owned真实binary：alternate/大小写错误/null window均access_changed；伪Session、旧noteEpoch、Token额外metadata字段/null、未知用途、超界thumbnail尺寸、original带pixels、未知附件均无value返回。有效回执的access/metadata标签与唯一workspace Session完全一致。HEAD正确返回登记长度，所有负例及HEAD累计payload读取0，activeStreams0。所有perf命令均被导出的实际renderer route policy拒绝；作者复跑还覆盖实际HTTP renderer入口403。
6. 独立运行formal入口到新 `artifacts/media99m-independent-formal-gate`：预期exit1，completedPhaseCount0、未启动Chrome、purposeBytes/generationLogicalBytes显式null。没有把未知指标变成zero。该formal门槛检查不构成正式性能测量。

复现：

```sh
node scripts/performance/check-media-tools.mjs artifacts/media99-fixture artifacts/media99m-tooling-harness3 artifacts/media99m-independent-tools
node scripts/performance/run-media.mjs --fixture artifacts/media99-fixture --build artifacts/media99m-tooling-harness3 --output artifacts/media99m-independent-formal-gate --frontend artifacts/media99m-tooling-frontend1 --mode formal
node scripts/performance/review-media99m.mjs artifacts/media99-fixture artifacts/media99m-tooling-harness3 artifacts/media99m-independent-tools artifacts/media99m-independent-formal-gate artifacts/media99m-independent-probe
```

这些输出已存在，复跑须换全新目录。独立日志 `/private/tmp/cybernote-media99m-independent-{tools,formal-gate,probe}.log`。结构化摘要见相邻`app-media-measurement99m-tooling-result.json`，原始结果保留于上述artifacts目录。

## 静态调用链与限制核对

- Rust adapter复制生产Store/Session/sync/MediaRuntime原模块；唯一`Arc<Session>`交给同步和媒体，真实窗口测试身份固定main，Origin由绑定后的静态服务端口传入。WindowHost在Session锁外先转生产MediaRuntime.event再向renderer排事件。测试host不等于真实Tauri注入窗口身份。
- Rust请求在完整行分配前限制4MiB、worker32；Node复用已接受的分段180MiB response reader，单行只concat一次。独立复跑UTF8分块/超界检查通过，未引入旧平方Buffer拼接。
- builder和runner验source/binary/frontend hash，保持原99P工具/fixture/run4不变；此次author差异只有9个新工具/文档。没有改production。后续99UI/99C必须重建harness和frontend，当前owned binary不能当新source证据。
- 检查音视频分支确实点击实际UI控制并轮询当前媒体元素，只调用原生play/currentTime；没有手写src、load或Base64回退使其成功。正式激活选择器仍须在accepted99UI核对。长媒体失败记录与exit0阶段完成不等同功能通过。
- 本轮text-SVG返回unsupported_media真实保留。450raster/50SVG分组统计成功、失败和未尝试及HTTP流量，不宣称独立450子集内存；不得把SVG未解码造成的RSS降低称全量等功能改善。
- author startup smoke仅1phase、22次旧IPC读取/3,443,151B、0 SHA差异；已核对结果与source身份，未再次跑或将它称优化后数据。本轮没有运行完整10phase、native build、ADB或用户库操作。

正式后测待accepted99UI/99C、生产精确指标与同源native provider接线后另行开发/独审，包括原始trace重算、全部phase和功能失败门槛。Mac ATS/Android cleartext、解码能力、原生RSS及同源最终包继续FINAL101。
