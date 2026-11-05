# Mac15授权超时：本轮只读定位54

2026-11-05，Asia/Shanghai。结论：**准确Mac15的实际Start请求进入TCC麦克风路径，并在约176.901秒后迟到返回；早先30秒原生等待已超时，不能用这次迟到回复复活失败录音会话。下一步应保持当前包身份，用新的显式Start验证放行与真实采集。** 没有采集音频、操作GUI、修改代码/签名/权限/数据库、重置TCC或运行构建测试。Android构建缓存未触碰。

## 当前包与来源

- PID33095，直接只读ps确认2026-11-05 10:42:59启动，完整路径见`process-identity.txt`；首次受限ps被拒，随后获准同一精确PID只读查询，不把工具权限拒绝当作进程消失。
- 包：`/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-window-build15/mac-attempt01/mac-sealed.app`。可执行文件SHA256本轮重算为`e727118f6bcfe0c22e325542616c276d9832a453d5cccf03bd29e84a15a89197`，与root的`recording-window54-mac-runtime/launch-identity.json`一致；源码身份为`5a147d2c5b59fcd9ca0ce4398d89cb1bb5c34a5a`。
- 本轮只读codesign明确当前adhoc CDHash为`0a258674ff1844f9fe57fc9d3619c5cd22fa7cad`，designated requirement也为该cdhash，见两个codesign文本。CDHash不同于上面的文件SHA256。
- 根CUA原始`05-start-outcome.ax.txt`明确child为`03336ddb-ea1c-49cb-a884-f98d95287a7c`、operation为`1e6dde57-4950-4458-9121-e9d1584a6adb`，00:00.00与“系统麦克风授权等待超时；可取消后检查是否仍有系统提示。”。本子任务只读该证据，没有操作窗口。
- 当前Info.plist的bundle ID为`com.local.notesclone`，包含麦克风说明“将录音添加到本地备忘录。”，不支持本包缺说明字符串的假设。

## 本次窄事务

最终证据只保留2026-11-05 10:43:00至10:49:30的`tccd + com.apple.TCC + access`，准确`msgID=33095.2`、`33095.6`，或同时包含本bundle ID与Microphone的条件比较消息，见`microphone-transactions.log`。初次只看10:47:30之前时未见末尾结果，随后按准确msgID补查而发现迟到结算；不把初次窗口截断误写成“系统从未回复”。初始应用范围查询中的其他服务记录未作为必要证据保存。

| 上海时间 | 直接日志 |
|---|---|
| 10:43:00.767–.771 | 启动后的33095.2：Microphone，preflight=yes；当前包与既有code requirement不匹配；内部authValue=1/authReason=0，随后REPLY。不能据此把内部数值直接等同公开AVAuthorizationStatus，且不将启动查询冒认成用户10:44的Start。 |
| 10:44:51.582–.585 | 33095.6：当前PID、准确完整包路径、Microphone，preflight=no。 |
| 10:44:51.587 | Failed to match existing code requirement；比较`1d215208651dd7f7443ffe2ca4641dd62d0d84fc`与`0a258674ff1844f9fe57fc9d3619c5cd22fa7cad`。第二个值由本轮codesign独立映射为当前包；第一个只称日志中的对照条件，不擅自命名为某个历史包。 |
| 10:44:51.589 | 同33095.6 AUTHREQ_PROMPTING。该消息本身不证明提示已可见或用户已选择。 |
| 10:47:48.483 | 同33095.6 AUTHREQ_RESULT，内部authValue=2/authReason=2/error=null，随后REPLY。请求到回复约176.901秒；本子任务未观察实际系统提示或用户操作，不擅自归因给某个点击。 |

这组记录将51中的旧线索推进为本轮准确包、当前CDHash和准确事务的事实，但仍不能单凭code requirement比较失败认定授权延迟的唯一根因。尤其本次事务实际上已有迟到回复，不应现在先去重置或改签名条件。

## 与准确源码相互印证的边界

固定主源5a147d2的`recording_access.m`55–60行使用公开AVCaptureDevice音频授权API；98–119行仅NotDetermined进入系统request，73–77行30秒交付code7；`src/macos.rs`58–60行将code7映射成根AX中的确切文案。公开status原值未在本轮日志中直接输出，不能把TCC内部authValue当作SDK枚举实测。

同文件`finish`的一次交付与`systemCompleted`的delivered检查会忽略已超时请求的晚成功回包，之后才清pending；Session在preflight失败时不进入getStream（`recording-session.ts`173–183行）。因此现有UI仍停在失败是安全边界，与系统随后回复不矛盾。TCC REPLY也不能证明AVFoundation completion已经在应用主线程处理，或WebKit已经拿到音轨；下一次真实预检才能确认当前状态。

该文案与源码定位的是原生授权阶段，不支持把本次00:00直接归咎于MediaRecorder、波形或WK媒体handler。没有真实getUserMedia settle/onRecording记录，不声称WebKit和收音已通过。

## root可执行的下一步

1. 保持当前Mac15包和CDHash不变，不先重建、重签或重置。root通过既有CUA流程确认上一次系统提示是否已处理；本日志只确认事务已回，不代替可见状态。
2. 用正常关闭操作结清这一个未采集成功的失败child，保留具名QA笔记，再从原owner创建新的录音窗口并只点一次Start。旧失败Session不会自动恢复，重复使用它不能证明新授权状态。
3. 记录新attempt开始时间与新的child/session。若当前公开状态已允许，应进入既有getUserMedia并以真实非零计时、波形、暂停/完成、保存后可听与重开结果验证；这些由root实际操作，不在本报告追认。
4. 若新attempt仍是busy/timeout/denied，保存准确新文案和时间，再只按新msgID补查；不要持续点Start或把旧33095.6回复当新attempt成功。需要进一步改变授权或签名策略时，另行给出准确当前包及具体影响，本次只读定位没有实施此类动作。

证据身份、窄查询和限制见`result.json`。本次交付是“系统请求迟到结算后的下一轮验证准备”，不是Mac录音成功或整体像素验收通过。
