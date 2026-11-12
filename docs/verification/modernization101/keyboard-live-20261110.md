# Android输入法现场只读诊断

2026-11-10 09:41开始（Asia/Shanghai）。针对用户当前编辑时无键盘的反馈，先从Samsung SM-G9500/API28、serial `98895a3147304c3132` 只读保存现场；随后按父级明确gate做下文有界hide/show、系统原生输入框及已启用输入法对照。没有typing、Back、安装、CyberNote/手机重启、清数据、产品修改或重新构建；最后仅按另行明确gate重启WeType一次，见末节。报告不包含标题、正文、选中文字或typed内容。

证据：`artifacts/keyboard-live-20261110/` 中的 `snapshot.json`、`detail.json`、`view-state.json`、`evidence-manifest.json`。初始现场保存一张截图；后续对照截图见各阶段。`screen-original.png` 含当前备注，仅作受限现场证据，不应在公开报告中展示。`screen-redacted.png` 遮盖了备注内容。UIA `/dev/tty` 只读尝试exit0但未返回可解析层级，不能据此推断控件树状态，未保存其内容。

## 实际状态

| 项目 | 只读观测 |
| --- | --- |
| 前台/焦点 | `com.local.notesclone/.MainActivity`，PID3298；current/focused window和inputMethodTarget均为本app |
| 已装包 | version0.1.0、versionCode1000；lastUpdateTime `2026-11-10 04:08:40` |
| 已装APK SHA256 | `42a561bbff4611738c214c7b924263e8de01f69d79af9211c1ea0053a3da8178`，对应此前v2诊断包；今天105新包未安装 |
| 默认输入法 | `com.tencent.wetype/.plugin.hld.WxHldService` |
| 输入法实际进程 | `com.tencent.wetype:hld` PID30486存活；WxHldService/WxImeInterService绑定该进程 |
| 编辑器连接 | served/next为同一RustWebView；active=true、InputConnection finished=false；current inputType `0x2c0a1`、imeOptions `0x12000001`，packageName为本app |
| 系统显示状态 | bound=true；showRequested/explicit/inputShown=true；IMEWindow Active\|Visible；mIsInputViewShown=true |
| 输入法服务视图 | mWindowVisible=true、mInputStarted=true、mInputViewStarted=true、mShowInputRequested=true；mCandidatesViewStarted=false、mCandidatesVisibility=4 |
| 锁屏 | showing=false、inputRestricted=false，屏幕on/awake |

关键几何：IME Window frame=`[0,96][1440,2960]`，高2864px；它向WindowManager上报 `mGivenContentInsets=[0,2863][0,0]`、`mGivenVisibleInsets=[0,2863][0,0]`。按该frame/insets，**WM获报的content/visible区域**仅约1px高（起点约y2959）；这不是直接测量WeType内部View高度，也不证明其布局塌缩根因（IME可覆盖onComputeInsets，touchableInsets为3）。Window同时为HAS_DRAWN、isVisible=true、isOnScreen=true。本地查看原始全屏图确认没有可见键盘或候选区，备注显示延伸至底部编辑工具栏。

因此现场不能简化为“app没有焦点/没有调用show”：焦点、连接、绑定和显示请求都有证据。准确状态是：**请求/服务状态与可视表现不一致，WM获报约1px区域，屏幕没有实际键盘。** 不能仅凭此快照证明触发源属于WeType内部、系统或app特定生命周期链。

第一阶段默认/enabled IME、`show_ime_with_hard_keyboard=1`、旋转值均只读保存；后续只短暂切默认IME，最后已恢复原值。保留的启用列表含WeType、Samsung及语音输入法；Samsung进程存在不表示当前默认已切换。

## 窄日志的边界

最近800条main与800条crash缓冲在内存中过滤，仅保存本app/WeType/输入法服务相关的固定崩溃、ANR、绑定失败或输入生命周期类别，不保存原始日志中的用户文本。没有命中相关失败事件。这个结果仅表示所读缓冲范围内未见证据，不能证明历史上没有崩溃、ANR或失联。

## 已授权的最小对照及最终结果

| 阶段 | 实际动作与观察 |
| --- | --- |
| 10:03单次hide | 先核原screen正文区像素未变、samefocus/PID；点实际底部“收起键盘”X（1320,2810）。源码路径仅session.browse→blur/NotesKeyboard.hide，无导航/文档事务。seq355、inputShown=false、Window NO_SURFACE/visible=false，app3298/WeType30486不变。 |
| 10:06重新focus | 核同Activity后点原段落右侧可编辑空白（1150,1500，非附件/画布），无typing/选字手势。seq356、同WebView和输入连接、showRequested/inputShown=true，但截图仍无键盘、WM获报仍约1px。未恢复，不重复hide/show。 |
| 10:19–10:21原生对照 | 正常am start系统Settings；UIA唯一可点击“搜索”Button精确bounds `[1028,938][1220,1162]`，仅点中心进入SearchActivity。真实原生 `android.widget.EditText` `com.android.settings.intelligence:id/search_src_text` focused=true，空输入；current inputType=0x1、imeOptions=0x18000003（区别Web的0x2c0a1/0x12000001）。同WeType30486，实际仍无键盘，WM获报同约1px。随后显式带回原CyberNote Activity，app3298未重启，不点击搜索历史/账号/网络、不打字。 |
| 10:26–10:27Samsung对照 | 保存精确default/enabled/rotation后，仅ime set到已启用 `com.sec.android.inputmethod/.SamsungKeypad`。原编辑焦点自动获得完整可见数字/字母键盘，无需额外bodytap。WM给定top1436、frame高2864，声明可见区1428px；RustWebView实际界变至y1532。Samsung22435、WeType30486、app3298均原PID。 |
| 10:29–10:31恢复WeType | ime set回精确原 `com.tencent.wetype/.plugin.hld.WxHldService`；原焦点自动请求显示，但实际仍无键盘，WM声明回到约1px。没有多点body或反复循环。default/enabled/rotation/userRotation逐项恢复原值，见binding-settings-restored.json。 |

主要证据：`recovery-action-*.json`、`recovery-after-hide/show.{json,png}`、`control-settings-focused.{json,png}`、`binding-samsung-before-focus.{json,png}`、`binding-wetype-restored.{json,png}`。每次输入/导航前核确切允许前台；未观察到用户争抢操作。只改变焦点/caret、短暂默认IME及viewport滚动，不做文本输入/选择或正文修改；没有额外DB导出/对比，因此不扩大为已验证整库字节不变。

可分享的图只保留没有备注/搜索历史的区域：`screen-bottom-strip.png`、`control-settings-bottom.png`、`binding-samsung-keyboard-only.png`、`binding-wetype-bottom-strip.png`。灰色正文遮盖图不能单独证明全屏无键盘，视觉结论来自本地查看原图；底部裁图仅补充相应区域的视觉证据。原图仅供本地独核，禁止把备注正文展示在报告中。

硬键盘只读配置：`am get-config`为`keysexposed-nokeys`；global config为`-keyb/v/h`（keyboard=NOKEYS1、keyboardHidden=NO1、hardKeyboardHidden=YES2）。InputReader只有Virtual及手机内置按钮/触板/触屏，各IsExternal=false，没有外接字母键盘证据；show_ime_with_hard_keyboard仍1。元数据见keyboard-configuration-final.json，没有记录按键。

本app近期PID日志可见InputMethodManager startInput/HSIFW/SSI类事件，已只保存类别与时间前缀，无正文。它们包含本轮主动hide/show，未建立最早故障的触发顺序，也未发现可关联该异常的配置变化证据；日志范围有限且现包未完整记录所有focus/config原因，不能把未命中当不存在。

结论：**当前WeType会话在本app和独立原生空输入框均失败，Samsung在同一CyberNote进程可正常显示；切回WeType后仍失败，默认已恢复。** 这将当前故障定位到比单一Web编辑器更广的WeType/系统输入法会话方向，不排除app曾最初触发该会话状态，不声称WeType内部根因或永久修复。临时Samsung是已证明可显示的workaround，本轮按要求恢复原默认，因此该阶段WeType仍不可见；之后父级另授权下节一次进程恢复。102长按格式问题不在本轮范围，仍保留原失败状态。

## 最后一次授权恢复：当前键盘恢复，原始触发未知

10:38–10:41仅按明确gate再绑定已启用Samsung以保持输入连接，`am force-stop com.tencent.wetype`一次（不clear-data），随后`ime set`回精确原WeType。没有重启CyberNote/手机或输入正文。旧WeType30486退出、新WeType13994，CyberNote始终原PID3298、原Activity。`process-wetype-recovered.png` 本地确见完整九宫格键盘；WM givenTop1733/frame高2864，获报可见1131px，RustWebView实际缩至y1829。`process-wetype-recovered.json`证明default/enabled/rotation/userRotation逐项原值一致。`process-wetype-recovered-keys-only.png`仅保按键区，无备注/候选文本。

这证明仅重建WeType进程后本次显示恢复；不证明原始触发因果或永久产品修复。各命令有15秒上限、实际均数秒内结束，没有循环。

一次后续只读检查在10:48，距离首次恢复392秒，画面已是本app列表/搜索UI，不再是原编辑场景；本agent期间无input。此时inputShown=false、IME invisible，PID及原settings仍相同。该检查不能证明持续键盘稳定，也不能认定故障复发，故不追加操作。所有设备动作结束，保留现场原件供本地独审，报告不披露备注内容。
