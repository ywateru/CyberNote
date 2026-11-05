# 71 手机录音命令验收开发记录

工作开始2026-11-05，收束2026-11-06。未操作现有Mac应用、Android设备/模拟器或真实麦克风，未读取用户音频，未安装/构建原生包。现有手机未保存录音现场保持原样。

## 结果及源码身份

本轮使用真实App/TipTap/MobileRecordingPanel/RecordingSession/Playback/SaveQueue/附件正文ACK，系统与设备边界为隔离JS协议fixture及固定440Hz合成流。`pnpm debug group recording --mobile`有独立手机场景，桌面九组保留。

完整开发回归以base `77ade45ef51b87c90fa4022c3ada74425b64728e`及未提交的本任务源码运行。四份summary的79个输入文件SHA均为`2684e6020edb8245b4d5a468274962d3e695bcaefc4f3f377e4b5659da19b934`，各次start/end相同，pageErrors均空。后续仅将一次性probe移入本目录txt归档、格式化新手机模块以及编辑文档；因此不把旧指纹冒认为最终提交精确指纹，独审和根整合应重跑最终提交。

| 实际命令 | 结果 | CLI耗时（含启动，cleanup前） | 场景耗时 |
| --- | --- | --- | --- |
| `pnpm test:debug --out /private/tmp/mobile-debug71-desktop01` | 9组94检查，exit0 | 29.743s | 各组见[desktop/suite](desktop/suite.json) |
| `pnpm debug group recording --mobile --out /private/tmp/mobile-debug71-final-mobile01` | 37检查，exit0 | 15.040s | 8.085s |
| `pnpm debug group notes --mobile --out /private/tmp/mobile-debug71-final-notes01` | 9检查，exit0 | 9.674s | 2.497s |
| `pnpm debug check-production --production dist --out /private/tmp/mobile-debug71-production01` | API不存在、URL不能启用、4类marker匹配0，exit0 | 2.404s | — |
| `pnpm build` | TypeScript及生产Vite成功，exit0 | 未采总时 | Vite1.40s |

desktop session99401在输出summary后仍清理，已再次轮询确认终态exit0。上述若干运行并行，耗时只代表本机本轮，不是性能保证。生产有既存的大chunk提示。生产产品src在构建后未改；debug脚本与文档后续变化不声称为原生新包。

## 修复与证据

1. 命令close错误使用canFinish限制：手机idle close原返回UNAVAILABLE；采集中finish原成功noop。guard现按真实控件校验；桌面idle close也经真实local.close取消。手机投影canFinish现与Done控件一致，仅paused/retry，不影响实际close路径。原[baseline](baseline.json)保留历史观察。
2. 手机onState的100ms投影使快速命令读到旧elapsed/错误。仅DEV且显式debug启用时在React提交后立即发布当前投影，普通呈现周期保持，不增加通用pending后门，不修改生产Session。
3. 旧合成MediaRecorder每次requestData及stop发完整累计WAV，生产Session正确拼块，最终浏览器只解第一份RIFF。[cumulative-before](cumulative-before.json)实测两段活动约5秒却只解2.069秒。先保留[流式header原型](streaming-wav-proof.json)，然后仅修mock为首header（RIFF/data未知长度0xffffffff）加增量PCM，全部前缀和最终文件由浏览器真实解码。[最终媒体证明](mobile/mobile-media-proof.json)实际253288字节、126622帧、5.275917秒、RMS0.08839，4秒后能量239.27；并在暂停预览和重挂载已保存卡上真实播放超过4.1秒，排除仅计时器自证。
4. 本机Playwright的waitForFunction内部直接对predicate返回值判truthiness，async函数返回Promise被当完成。[旧等待实际返回false](async-predicate-before.json)保留。统一scripts/debug已清除全部async waitForFunction，以共享waitForState真正await投影/条件；desktop contract增加async false须真实超时并保留lastState、延迟true不得提前返回两个检查。旧任务70的通过没有证明这项等待机制正确，本任务重新完整跑94检查。
5. Playwright跨进程抛Error会丢自定义code。runner idle和CLI显式waitForIdle现与execute一样使用JSON错误envelope；CLI按字段存在检测raw waitForIdle，null/false/0/空串不再跳过API校验。[8项负例](negative-summary.json)实测五个raw无效值/未知字段INVALID_ARGUMENT、CLI真实TIMEOUT、CLI手机设备APP_ERROR、直接raw waitForIdle真实异步APP_ERROR。历史probe保留为[文本](negative-probe.mjs.txt)，不是产品入口。

## 手机覆盖及边界

37检查覆盖初始真实HTML/禁用态、空取消、开始、active finish拒绝、暂停预览且无checkpoint写入、播放暂停、禁止播放时继续、seek及双向skip夹限、暂停时间排除、两段后部真实回放、play失败重试、原A正文ACK及B不变、真实存储字节解码、重开卡播放、track停止与旧preview URL撤销、采集中关闭保存、设备拒绝后取消、延迟store/save真实busy及APP_ERROR、保留可重试会话和同一operation去重。保存失败通过真实“重试”控件恢复，从未靠dismissError假装成功。

JS fixture首次成功保存的journal可仍显示stored，只有后续query才更新committed，故以真实backend正文attachment引用、pending/failed为0及owner释放联合证明ACK，不把fixture状态更新时机错套生产Rust。桌面旧committed媒体仍按原Undo契约保留。

[mobile目录](mobile)保留初始、录制、暂停、预览失败、设备失败、store/save失败、保存后HTML/rect/computed style及PNG；[history](history.json)保留失败轮次，未追认失败为通过。dev01无editor因初始手机在列表页；dev02–04暴露async等待；dev05暴露idle code丢失；dev06错误要求fixture journal立刻committed；dev07点到CSS隐藏的桌面展开按钮，改点手机可见标题，未改产品CSS。dev08真实通过36项，最后加forward skip和资源断言后37项通过。

此为Chrome390×844合成媒体/协议fixture验收，未证明Android WebView、Rust持久化、系统权限/真实设备音质、原版像素级一致。原版没有HTML，仍需以已保全录屏/截图标注对照；本轮没有自比图冒称原版通过。手机保存失败时继续保留真实File/session，暂停不采用桌面checkpoint。桌面A录音/B编辑仍由独立桌面场景验证。
