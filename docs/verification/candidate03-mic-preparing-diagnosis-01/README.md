# candidate03 Mac 麦克风 preparing 有界诊断

日期：2026-11-04（Asia/Shanghai）。执行者：verify_app。只读基线为 `/private/tmp/notes-unified-candidate03-mac-sealed.app`，构建源 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`。本轮遵守停止 GUI 扩探、禁止权限修改/重置和不扩大私人数据读取的边界。

结论：**本轮未重新进入录音，也没有新的录音成功证据。精确候选包仍在运行；唯一一次 CUA 重绑定超时。当前进程只读音频授权原值为0，历史限定日志明确显示 WebKit 到达 action:Prompt、TCC 针对麦克风的既有 code requirement 与本包 cdhash 不匹配并记录 prompting。这是明确的权限路径线索，仍不足以解释 preparing 与界面工具超时的全部原因。** 没有更改任何授权、设备或系统设置。

## 已有事实与本轮边界

前序冻结报告 `docs/verification/unified-candidate03-independent-01/README.md` 及其13–16保存真实录音面板操作：点击开始后界面保持“正在准备麦克风…”，时间00:00.00，暂停/完成禁用，随后通过实际取消恢复正文。没有录音文件、正文 ACK、播放或可听性证据。其29还记录实际文本附件点击后的 CUA 超时；不能把该次打开尝试当作外部打开成功。

本轮先检查了项目和各级祖先的 AGENTS.md，未发现文件；没有发现项目 .agents/.codex 规则文件。遵守会话当前 CUA、只读诊断、包身份与用户授权边界。一次过宽文件路径搜索被及时中止且没有返回内容，后续仅检查明确项目祖先，不据此读任何无关文件。

01在03:58:17（UTC+8）确认唯一候选 PID39665，路径与前次冷启动一致。exe15,575,712 B，SHA256 `f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56`，没有换成旧包。Info bundle id com.local.notesclone、版本0.1.0；麦克风说明“将录音添加到本地备忘录。”与相机说明存在。缺少 usage description 不是本轮证据支持的解释。

## 唯一一次 CUA 重新绑定

02逐项保存工具、原始代码、15,000ms预算和结果。只对确切 sealed 路径调用一次 getApp；实际工具耗时18.7362秒，返回 `js execution timed out; kernel reset, rerun your request`，没有新 AX 或截图。

之后停止所有 GUI 操作，没有再次绑定 clone、Dock 或其它未知应用，没有进入录音、点击授权、取消系统提示或改变前台状态。本轮没有可见当前授权提示/窗口的证据；不能将“未能观察”写为“提示不存在”，也不能把工具超时本身写成麦克风拒绝或 app crash。root后续如观察系统 inventory 属另一段证据。

## 当前进程只读授权原值

03为完整观察脚本，04为完整 REA返回，Evidence `ev_4f446d8b472ae38299ae8be52672c4a70cc02aee8d745391252b526c9f0d0aad`。04:00:10（UTC+8），PID39665/arm64，AVCaptureDevice类已加载，AVFoundation、AVFCapture、CoreAudio、WebKit模块已存在。脚本只调用现有 `authorizationStatusForMediaType:`，媒体类型字符串为 `soun`，返回整数 **0**。没有加载框架、调用requestAccess/getUserMedia、申请授权、创建采集输入、hook或改变UI。

10另保存本机 Apple SDK `AVCaptureDevice.h` 的明确枚举片段（起始2008行，头文件SHA256 `a706042cae2ba4029eeb8f7934832146447837eb31d3e6397a8df9f7736709f0`）：其中 `AVAuthorizationStatusNotDetermined = 0`。这是本机SDK符号映射，不是本轮在线官方文档核验；关键原始观察仍是04的整数0。它只描述**该时刻/该进程/所查询媒体类型**的返回，不证明历史03:31请求状态、系统提示是否可见、用户曾作何选择、或底层异步promise为何未settle。尤其不能把0写成已授权、已拒绝或完全没有发起请求。

REA `cleanup_error:null`，工具声明这是观察窗口结束后分离的ephemeral流程；normalized字段仍为running，原样保留，不据此构造额外的持续附着或分离状态。目标身份由01另行补证，不抹去REA通用identity/环境局限。

## 限定持久化日志中的实际线索

06使用获必要读取权限的 `/usr/bin/log show`，时间限定2026-11-04 03:30:00至04:01:00，过滤该候选历史PID37803/38987/39665的audio/microphone/permission/capture消息，或tccd中明确含com.local.notesclone的消息。命令exit0，完整原始stdout/stderr、参数与时间保全；共131条。没有查询TCC数据库，没有扩大到原版Notes或其它应用正文。11只从同一原始输出投影关键事件，没有再发更广日志查询。

历史PID37803与前序真实点击开始录音的时间/路径相符：

- 03:31:33.009851，WebKit `requestUserMediaPermissionForFrame`；03:31:33.010049记录 persistent access:false。
- 03:31:33.053960，WebKit valid request明确 video:0 / audio:1；紧接03:31:33.053963记录 action:Prompt。
- 03:31:33.032419与03:31:33.056338，tccd记录 `Failed to match existing code requirement`，subject com.local.notesclone、service kTCCServiceMicrophone，比较的cdhash为既有 `f5ada7aca7dbb1c472ce7c7761aac4ccd88b5a98` 与当前 sealed `73012dfbca39e3617d77fce2c167f029129b7ab5`。
- 03:31:33.056934，tccd记录 `AUTHREQ_PROMPTING`，service kTCCServiceMicrophone，subject/责任进程明确为该sealed路径/PID37803。
- 后续新进程38987与39665的限定日志仍出现同一麦克风code requirement不匹配线索。

这些记录把已知 preparing 的边界推进到“WebKit识别音频请求并进入Prompt、TCC有prompting及既有签名条件不匹配”。**不能据此宣称系统UI实际已弹出/被用户看到或接受，也不将cdhash mismatch断言为全部根因。** 本次predicate会遗漏不含bundle id的某些TCC响应消息，没有按事务id补全，因此不以“此筛选没有结果行”断言从未有grant/deny响应。

同一原始日志另在03:43:11.974780记录 PID39665 的 `kTCCServiceSystemPolicyDownloadsFolder` AUTHREQ_PROMPTING，时间接近前序文本附件点击/超时。它是实际的另一权限边界线索；没有当前系统界面截图，不能把它定为CUA超时原因，也不能混同于麦克风授权。

原始日志还有WebContent/CoreAudio服务lookup被拒/连接invalidated等消息，保留其原样；当前诊断没有证据足以区分所有环境访问限制、WebKit辅助进程约束与产品错误，不据这些“Permission denied”字样直接定为应用实现失败。此前root以必要权限只读设备枚举已见默认麦克风和扬声器，受限枚举空列表不支持硬件缺失推断。

## 原始 linker 签名与完整 adhoc 封签分账

05和09分别用只读codesign display/verify检查保留原始构建与当前运行sealed派生包；没有重新签名或编辑entitlements。两份exe仍保持各自冻结SHA。

| 项目 | 保留原始 linker 包 | 当前运行 sealed 包 |
| --- | --- | --- |
| 路径 | notes-unified-candidate03-mac-149d7769.app | notes-unified-candidate03-mac-sealed.app |
| exe SHA256 | 149d7769cdd926f621642e586a83adf32d6bbdc0e32e8f7922e5a5c213591b5d | f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56 |
| codesign identifier | notes_clone-29a7fa566064265e | com.local.notesclone |
| flags | 0x20002 (adhoc,linker-signed) | 0x2 (adhoc) |
| CDHash | e3bc365103fcfcacc334c01f8a9950fb26289703 | 73012dfbca39e3617d77fce2c167f029129b7ab5 |
| Info.plist / resources | not bound / none | entries16 / sealed resources v2 |
| TeamIdentifier | not set | not set |
| strict deep verify | exit1，资源签名不完整的原始报错保留 | exit0 |
| separate entitlements display | exit0，未输出entitlement字典 | exit0，未输出entitlement字典 |
| designated requirement | cdhash H"e3bc…" | cdhash H"73012…" |

原始/封签的payload比较此前已保全于 `docs/verification/unified-candidate03/build/mac-signature-payload-comparison.json`，本轮只引用，没有再做remove-signature比较或改保留文件。签名的实际差异与历史TCC比对中的“既有f5ada…”是三个不同标识，不把旧TCC条件误认作本轮原始linker包的e3bc CDHash。没有根据未输出entitlement字典直接断言缺少某entitlement是录音原因，也没有推导用户应给应用增加私有entitlement。

初次组合display命令的 `--requirements :-` 被codesign解释为输出文件，曾在项目根产生名为 `:-` 的67B自有文本。确认内容仅当前sealed designated requirement且SHA256 `d484d9d40169691fb12c475687683966a07c51d419c29651c9832a1774d0d6cb` 后，已精确移到07，08记录来源；根目录没有遗留该文件。后续09使用分别的 `--entitlements -` / `-r-` 正确display语法，避免重复误输出。此修正没有改产品或签名。

## 诊断完成边界

本轮新增的是可复核权限/签名/日志线索，没有新录音或新GUI可见状态。当前原因仍 **部分定位/未确诊**：已知请求到达Prompt/TCC路径，当前授权原值0，历史code requirement匹配失败；不知道系统提示当前呈现位置、请求最终结算、或CUA绑定超时具体原因。

未修改TCC/权限/hostmic/系统设置、未申请新权限、未采音/保存录音、未重启/终止候选进程、未构建、未改产品/主Git、未操作原版私人正文、Dock或Android输入。独立诊断目录冻结后交root，旧Mac/Android有限报告保持不变。下一步如需可见系统提示观察应单独保留新证据，仍不能追认本轮录音成功。
