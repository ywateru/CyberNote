# MEDIA99UI 独立审查

2026-11-09。结论：**接受本次 UI 源码阶段**，未发现阻塞问题。不是 MEDIA99 整项或最终双端交付的完成声明。

基线 `4bacc5f7526d83735b042428090669b64221258a`，作者提交 `6c9b965b3584b3c964b95f57162b2438abdb1a58`。独审未修改产品代码、原断言、owner guard 或媒体授权。树内尚无另行接受的 99C/100A，使用不变租约接口审核；最终整合与真实 Store/HTTP 性能由父级继续。

## 审查结果

实际入口已连到 metadata Context → 可见 hook → pool → 既有 acquire 的两道 gate → 租约 URL。列表160、画廊480、正文1024缩略图与原件用途分开；普通文件和未激活音频不预读。缩略图签发并发2、共享请求、queued撤出及原件独立通道有直接代码与运行证据。prepare/replacement停止已有controller并释放，迟到grant不发布；普通正文保存不把全局metadata sequence放入缓存键。预览另申original，在await后核对归属、授权、正文引用与触发元素，独立retain不随卡片离屏消失。长音频在fetch之前检查登记大小及已知时长，缓存清理仅影响thumbnail。

独立新增七组 pool/handle 边界全部通过：错owner/id/purpose分别不发布且恰好释放一次；prepare撤回queued并丢弃inflight迟到结果；first-ready回调内重入失效不能再向第二订阅者发布；retired请求收到gate-change后不重试；持续metadata_stale恰好三次后明确失败；脱离原订阅的独立original retain可由owner撤权找到而保留无关owner；一个controller抛错仍先停止全部controller再唯一release。探针调用实际生产TypeScript模块，只有transport可控，不据此证明Rust或原生运行。

原真实App17项在独立输出目录复跑全部通过，包含缩略图用途/尺寸、离屏/普通文件零预读、原字节操作、预览升级/迟到拒绝、精确ID替换、601s音频前置预算/seek、普通保存不断流、clear只刷新thumb与prepare同步stop。生产build通过，既有大bundle提示保留。

## 原大组 captured-target 失败的窄调查

作者记录的失败为移动附件43项之后，重置进入DataManagement首图添加时被既有目标校验拒绝。未将它说成基线既有问题，也未删除历史失败或放宽校验。

独立核对发现作者失败与当前独审的调试源码指纹均为 `723dfb7a43d3044c22ae237e60ce90973f22888f1c936d31fdf796e58ee47e8a`。在此相同且运行期间不变的源码下：

- 新runtime/reset后首图添加连续4轮成功。
- 完整原移动附件43项 → runtime.reset → 同首图/第二图添加成功。
- 精确使用原DataManagement的已解码图片等待、load300ms/store80ms、rAF/MutationObserver表面追踪，两次添加连续3轮成功。
- 可重跑独立脚本再次执行原43项前置 → reset → 上述精确两次添加 → 打开数据总览，全部成功；另三轮fresh精确流程同样通过。DOM保持 `.storage-summary=1`、`.storage-category=7`、`.data-file=0`，确认此前实质性双总览回归已经修复。

由此未复现当前源码的跨场景附件回归；先前一次拒绝的具体原因仍未确认，不把“未重现”写成已定位根因。全扩展attachments大组未重新跑完，历史结果继续保留。此现象作为非阻塞诊断限制记录，最终实际附件流程仍应按101复核。

## 可复验入口与证据

```sh
node scripts/verification/check-media99ui-independent.mjs
node scripts/verification/check-media99ui-picker-independent.mjs --sequence
node scripts/verification/check-media99ui-picker-independent.mjs
pnpm build
```

证据目录 `artifacts/media99ui-independent/`。结构化结果 `app-media-ui99-result.json` 记录原始日志/JSON摘要，包含作者App17复跑的原脚本SHA与仅改输出路径/绝对import的来源说明，未覆盖作者原证据。复验使用Chrome与隔离JS协议fixture；不运行native包/ADB，不接触用户库，也不声称大量503附件后测、视频原生海报、release loopback或实体触摸板通过。
