# 桌面录音指示与真实完成按钮78开发证据

日期：2026-11-06。基线`1021547d`，产品冻结提交`206557bb`，runner冻结提交`8fc060dd`。当前源码输入SHA256：`09fb9ee8b4702499400963dbf4f16693cd5c8646565f06823aa9daeb39f4b9ce`（90文件）；产品首版后没有再改逻辑，各轮变化仅为测试驱动修正。完整冻结回归结果在本目录`frozen`。

## 修改前真实DOM复现

[before/state.json](before/state.json)记录采集中controller `canFinish=true`、实际侧栏✓ `disabled=true`、×可点击、列表活动badge为0。测试未绕过实际✓调用语义finish。随后真实浏览器鼠标点击×，同一条录音保存1张附件、原session release `saved=true/revision=1`，见[close-result.json](before/close-result.json)。原HTML/computed style/PNG保存在`before`。

## 实现和范围

桌面✓直接遵守controller `canFinish`，沿用原finish/close终态路径；手机保留暂停/retry时允许✓的现有策略。列表活动状态仅从当前未detached的recording ticket owner和phase投影，React state在这两项变化时才更新；已有100ms计时仍仅更新live卡DOM。列表红点及“录音中”、当前live卡的红点按真实采集phase显示，暂停、checkpoint保存、失败和结束停止，reduced-motion显示静态红点。当前live卡仍为view decoration，未写正文JSON/schema或历史；旧卡不添加动画。旧ticket回调在调试状态与UI投影前被拒绝，不能复活或覆盖新owner。

[develop05/suite.json](develop05/suite.json)为定向49项通过，包含真实Undo/Redo、切换B并编辑、搜索/标签过滤A后恢复、220px长标题高亮、画廊、reduced-motion、暂停checkpoint/继续、采集中真实✓与重复×并发、真实×对照、两个真实已存卡仅当前live动效、存储失败重试、正文双次失败恢复、checkpoint中关闭排队、设备拒绝与空会话重开。全部pageErrors为空。

WAV独立AudioContext解码结果见[metrics](develop05/recording-indicator-metrics.json)：✓暂停继续后333260字节、6.942秒、非零peak约0.125；×录制中关闭后76402字节、1.59079秒、非零peak约0.125。时间包含浏览器真实调度及合成clock推进，仅用作累计非零音频与最低有效录音时长检查。220px列表title右沿366、badge左沿372，画廊title右沿382、badge左沿388，均无交叠；缩略图与HTML同目录保存。

## 保留的失败与修正

- `develop01`：38项后等待正文retry超时；测试只设一次`fail.save`，产品原有ACK逻辑会自动重试一次，故实际已成功。改为双次失败，未修改产品保存算法。
- `develop02`：双次正文失败后直接点侧栏✓可完成正文ACK和session release，但已有全局error banner未清；runner idle准确报告Controlled save failure。此已有错误展示状态不扩展修复，保留原始失败证据。
- `develop03`：按已有真实错误栏“重试”成功保存pending正文，但侧栏仍为retry时，测试错误地要求聚合debug error为空。debug error包含侧栏notice；改成Playwright实际错误栏点击并等待save队列ACK、确认DOM banner消失，再点真实侧栏✓。既有两步恢复行为明确保留，未清空全局错误状态来让测试通过。
- `develop04`：保存及checkpoint均通过，设备失败测试配置误用`mediaFail.stream`而超时；实际Fake设备开关为`mediaFail.permission`。修正驱动后新增双已存卡+live场景，`develop05`49项全过。

每轮原始failure/state/HTML/PNG/suite与准确源码指纹均保留，没有覆盖失败目录。`develop05`与冻结runner相同输入hash；它运行时尚未提交，故gitDirty=true是开发状态的如实记录。冻结回归记录独立HEAD和clean inputs。

## 测试边界

使用独立浏览器context、合成440Hz PCM设备和JS协议fixture，真实运行App、Tiptap、RecordingPanel/Session/RecordingPcm、保存队列及正文ACK。测试从React fiber保留真实App `onState` callback并重放旧ticket，是测试端注入；产品没有增加调试回调入口。

本轮没有调用真实麦克风、读取或复制用户录音、启动原手机验收、修改保留的Android约13秒录音现场，也没有修改Rust Store、依赖、schema或原生窗口。浏览器结果不证明Rust原生持久化、Android WebView/系统chooser、硬件权限和音质，或Apple Notes原生像素一致；原版没有HTML，视觉仍须参考既有原版截图。

## 冻结六项回归

全部自然exit 0，输入HEAD `8fc060dd`、相同90文件指纹、`gitDirty=false`、`sourceInputsChanged=false`；五个浏览器命令的`pageErrors=[]`。原始完整输出保留在`/private/tmp/recording-indicator78-frozen-6781`。本仓库保留完整命令日志、summary/suite/catalog及本次indicator HTML/PNG/metrics；见[frozen/commands.json](frozen/commands.json)和[聚合结果](frozen/results.json)。`regression.py`为当次六项串行驱动，记录subprocess完整wall，未重试或重跑失败。

| 命令 | 结果 | 完整wall |
| --- | --- | ---: |
| `pnpm build` | 通过 | 5.548秒 |
| `pnpm debug check-production --production dist` | 全部调试API/URL/Mock标记排除 | 2.042秒 |
| `pnpm test:debug` | 11组197项（原148 + 新49） | 53.077秒 |
| `pnpm debug group notes --mobile` | 9项 | 6.679秒 |
| `pnpm debug group recording --mobile` | 43项 | 14.946秒 |
| `pnpm debug group attachments --mobile` | 43项 | 46.018秒 |

本表为开发冻结回归。后续独审、主工作区整合与Mac包资源/严格签名验证由根任务单列；不把这里的浏览器Fixture报告记成真实原生验收。
