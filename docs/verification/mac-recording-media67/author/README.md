# 持久录音卡首显读取恢复67：作者证据

产品冻结提交：`7243c649862181d35aa94063149e30653593d7dc`，基点 `43e16f9707b6a602577c6793e9075e6185dd89d4`。产品只修改 `src/use-attachment-media.ts`。本目录记录作者受控验证，独审及准确新包的真实GUI复验分别由根任务接收，不在这里追认完成。

Mac19真实C累计录音在×后首次显示MetadataStale、一次手动重试恢复播放，是本任务的触发事实。原始实际记录继续保存在 `../../mac-recording-sidebar66-runtime/README.md`；受控事件顺序不等同于该次真实内部trace，C的精确内部事件顺序仍未知。这里没有操作Mac19或任何现有音频。

## 实现边界

加载器仅对 `error instanceof MetadataStale` 丢弃该次响应并重新调用原 `readAttachment`，最多三次总尝试。每次调用仍由原bridge捕获新的access stamp并执行完整access/metadata验收。没有接受旧bytes、降低sequence、复用失败URL，也没有修改bridge、gate、写入、正文ACK、journal、录音版本、overlay或退出守卫。

已提交id/kind/version的layout生命期令旧工作失效，手动重试在调度新version前也立即使旧工作失效。旧请求可以在进程边界返回，但不会继续旧重试、发布旧媒体URL或错误。非MetadataStale立即保留错误。超过三次仍显示原有错误与手动重试入口。既有停止播放器和object URL回收继续执行。

## 受控复现与修复trace

使用实际 `App → Host/NoteEditor → ReactNodeView/MediaView → useAttachmentMedia → bridge → AccessGate/MetadataGate`，以及实际DesktopRecordingPanel、Session、累计WAV、版本提交和正文保存链。只将native IPC/registry、麦克风和设备边界替换为控制器；录音来自Chrome AudioContext的合成440Hz振荡器和真实MediaRecorder。直接媒体边界样本由程序生成一秒WAV，不读取现有音频文件。

控制器可以保留 `read_attachment` 原始响应快照，并暂缓一次已通过native核验的 `recording_local_validate` 响应。该屏障位于真实final正文ACK之后、下一次可信同步之前，用来构造仅metadata推进而access身份不变的窗口。包装的gate方法只记录结果，返回值和所有拒绝条件不变；App测试tap仅暴露原始闭包及观察点，不替换验证谓词、保存或React Host等待。

| 顺序 | 未修基线与候选共同事实 | 未修基线 | 修复候选 |
| --- | --- | --- | --- |
| 两次暂停后关闭 | 实际第3版final读取捕获sequence 5、access generation 11 | 同左 | 同左 |
| 实际正文保存ACK | sequence推进到6；native验证响应被暂缓，generation仍11 | 同左 | 同左 |
| 放行旧读取 | 实际metadata gate记录 `sequence:5, observed:6, applied:6, accepted:false` | MediaView存为failure，不新读 | 同一id立即新read，重新捕获stamp；响应sequence 6 |
| 放行native验证响应 | 实际后续目标同步/最终核验、native `saved:true/revision:3` 完成，撤除实时卡和侧栏 | 持久节点显示MetadataStale和手动重试，无播放器 | 一张持久卡，无重试按钮，实际合成WAV可播放 |

这证明该合法metadata-only时序可以在真实前端链稳定复现和恢复。它不证明Mac19 C当时恰好发生此序列。第一次过宽的hold跨过完整后续同步时，实际access generation 11→13，gate先拒为AccessChanged；原失败完整保留，且产品继续禁止自动恢复此错误。

## 验证结果

- `baseline-attempt03/result.json`：未改产品基点上的预期缺陷证明，3/3检查、0 page errors。`pass:true`只表示成功重现预期缺陷，不表示基线产品通过。对应 `baseline-stale-visible.png`。
- `candidate-attempt02/result.json`：冻结产品主定向25/25检查、0 page errors。
- `strict-lifetime/result.json`：新增layout生命期在开发StrictMode的重放/清理2/2检查、0 page errors。
- `typecheck.log`：通过。`build.log`：通过，既有bundle大小警告保留。
- `git diff --check`：产品冻结前及证据整理时通过。
- 无native产品变更，没有重新编译或执行Rust全矩阵。

25个主检查包括实际final交接首显、无额外store/录音版本/重复卡；连续两个stale后第3读成功且只生成一个URL；连续三个stale耗尽及手动新version恢复；同文案/同code的普通Error、不可读和非法录音日期不重试；真实AccessChanged不重试；stale后新读遭锁定或撤权时终止；id/kind/unmount变化对迟到stale及迟到已被gate接受响应均不发布旧媒体；手动新version取消旧pending重试；换附件与卸载先停播放器并唯一回收URL；手机共享NodeView的触摸展开/播放/暂停及正文无修改。

StrictMode两次读取属于React开发模式的两个独立effect生命期；被废弃的首个生命期响应不生成URL，存活生命期只创建一个URL并在卸载时回收一次。这不把开发重放计作同一生命期的额外透明重试。

## 原始尝试保全

1. `baseline/failure.json`、`baseline.log`：runner最初只匹配无query的URL，页面返回Cannot GET，尚未进入产品。随后修正runner路由。
2. `baseline-attempt02/failure.json`、同名log：真实final早期read一路hold到所有同步完成，触发的是AccessChanged；不作为typed MetadataStale复现，也不放宽产品来让此试验通过。trace保留了实际generation变化。
3. `baseline-attempt03/result.json`、同名log：在原产品代码不变时加入post-body-ACK native响应屏障，明确分离metadata-only变化，成功复现预期缺陷。
4. `candidate-attempt01/failure.json`、同名log：前14条已通过。kind变化样本把带已知音频日期的附件当图片，生产正确返回“附件录音日期无效”；runner错误等待img。将跨kind样本改为有效无音频日期的file，再运行主25条。原失败及当时的final卡截图保留。
5. `candidate-attempt02`：主25条通过；随后仅增加可选StrictMode模式，`strict-lifetime`单独运行2条，不重复完整主矩阵。所有候选运行使用相同且与冻结提交一致的产品字节。最终runner包含主模式与StrictMode可选模式；较早失败/基线的runner中间版本未单独冻结，不将最终runner SHA冒充每次历史尝试的精确脚本身份。

所有 `vite-cache*` 留在磁盘，排除提交。source清单绑定最终产品、未修改的关键生产模块及最终runner；evidence清单绑定本目录全部非缓存原始产物（不包含清单自身）。所有截图均为合成受控界面，桌面顶部native toolbar bind错误条来自控制器未实现该插件呈现，不能作为真实app视觉结论。

## 重跑与限制

```sh
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-media67.mjs <新的主检查输出目录>
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-media67.mjs <新的StrictMode输出目录> --strict-only
pnpm typecheck
pnpm build
```

基线模式 `--baseline` 只适用于基点未修hook；当前冻结修复版本不应运行它并期待错误。需要基线复现时，在基点独立工作树使用该runner，避免覆盖候选产品或历史输出。浏览器套件顺序执行。运行期间未访问真实麦克风、GUI、手机、模拟器或现有音频；没有导出、复制或转写真实录音，没有改签名、TCC、应用身份或权限。手机检查仅为Chrome移动触摸仿真的共享媒体组件，不表示Android设备通过。真实Mac新包首显、活动×、主窗关闭与重开/退出和整体像素继续由根任务分别验收。
