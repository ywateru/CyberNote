# 录音中标识78独立验收

2026-11-06。结论 **PASS / SOURCE-READY**，限定源码与真实前端/隔离协议fixture链。产品freeze `206557bb`，runner freeze `8fc060dd`，开发证据HEAD `f06147c0`；90项输入SHA256 `09fb9ee8b4702499400963dbf4f16693cd5c8646565f06823aa9daeb39f4b9ce`，独立录音各次开始/结束不变，产品/公共runner gitDirty false。未改变产品、测试实现、dist或用户数据。

独立写`independent.mjs`，复用公共runtime而不执行作者recording-indicator断言。最终 **48检查，自然exit0，完整进程20.28秒**，含cleanup内部20.139秒，桌面与手机pageErrors[]。`static-layout.mjs`另作任务要求的非录音标题wrapper回归：baseline主1021547d（输入b4d046b7…）对本freeze，桌面/手机静态标题及行rect、font、line-height和整页PNG都完全相同，**自然exit0，完整13.81秒**。本轮没有重跑作者已执行的六项完整回归；根主线仍需整合。

## 独立完成范围

- idle无伪造录音角标/实时卡；开始后原A唯一“录音中”列表角标与实时卡活动标识，旧保存音频卡静态。CSS animation有running实例、currentTime经过实际两帧增加、opacity关键帧变化；不是仅检查class存在。reduced-motion下两个动效animationName均none，红点和可读文本仍保留。
- 采集中直接真实点击桌面✓，经过暂停checkpoint/继续后双击✓完成。媒体与正文ACK、登记释放、唯一当前引用、全部角标/实时装饰清理。另新B采集中真实点击×完成，同样核完整WAV与最终引用。不是只调用semantic finish绕过disabled按钮。
- 切B编辑时A标识不迁移，实时卡仍停驻A、B可编辑；搜索过滤A时无错转标识、录音继续，恢复搜索后仍A。220px长标题搜索命中与角标rect不重叠、不越界，实际page.mouse右键到badge附近仍开正确菜单；画廊同样无重叠，已独立查看PNG。
- pause后无列表采集角标/活动动画，实时卡准确“已暂停”；resume恢复。延迟store300ms期间checkpoint为静态保存态，×可用并排队完成；最终释放且原A单一引用。
- 捕获原真实production onState回调（只读React fiber引用），保存完成后模拟迟到投递，不复活A；开启新B后再次投递旧A回调，仍唯一B。没有替换App源码或直接设业务状态。
- storage fail1、正文save fail2均保留原owner和可重试媒体、动画停止；真实DOM重试成功，不重复创建附件。正文失败用现有全局错误条“重试”清正文队列，再点侧栏✓完成最终ACK/释放。
- 活动装饰未改变原documentJSON；真实编辑Undo/Redo只处理用户输入，不含recording-active/schema装饰。源审确认live卡Decoration注册/DOM更新不dispatch正文事务，App投影仅owner/phase变化setState，100ms tick不重复整个App投影。
- 手机先真实note.select取得有效目标，采集中✓仍disabled，无桌面角标/live卡，不放宽原手机完成策略。手机结束走原close链；未动实际Android现场。

## 音频和失败记录

五条重点保存链分别独立从实际backend附件字节解码：✓累计、×新B、checkpoint等待×、store重试、正文ACK两步重试。每条RIFF/data长度正确，完整解码秒数与RIFF sampleRate/blockAlign/data长度计算一致，达到明确最低活动时长，首段与后20%音轨peak均>0.01；检查最终owner和正文唯一当前引用。合成固定PCM，非真实麦克风/音质保证。具体字节、duration/frames/peak/tail与引用ID见final03/result.json，不按附件总数否定为Undo保留的旧累计版本。

保留三种独审自身失败，均不删除或追认为旧run通过：

1. attempt01错误假设累计时长必须<6秒，真实UI操作+合成advance后解码6.027625秒、首尾非零且唯一引用。改为RIFF推导与完整解码一致及最低时长；不再猜测交互总耗时上界。
2. attempt02桌面43检查全部过；手机初始尚在folder页，独审漏note.select，recording.open按产品正确拒绝“不可添加附件”。改为有效目标准备再验证。
3. layout01只等App idle，手机真实CSS slide未结束，截图baseline x43.34/candidate39.11；相对title偏移/宽高完全相同。layout02等待实际document.getAnimations().finished后两端几何与整PNG完全一致。不是更改归一化坐标或裁图隐藏差异。

命令、自然退出及完整wall见commands.json，所有原始JSON/HTML/PNG保留。正文侧栏重试成功后旧全局错误条可能仍留是已有独立错误通道限制：206557bb diff未改error清理/重试路径；本轮实际通过“全局重试→侧栏✓”路径，没有添加无条件setError清理来覆盖其他错误。不把该限制记为新录音完成能力回归。

范围边界：实际App、Editor、保存队列、录音累计编码/解码、正文ACK真实；设备/IPC/存储是隔离JS协议fixture，不证明Rust Store、系统权限、真实硬件/退出/多窗、WKWebView或整窗原版像素。新增角标是用户新要求，不冒称原版既有相同行为。未启动/停止现有Mac应用，未操作原Android13秒现场或用户笔记/录音。
