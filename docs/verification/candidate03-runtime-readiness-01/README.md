# Candidate03 独立运行准备

状态：PREPARED / NOT EXECUTED。主线冻结源为 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`。sealed Mac 包、APK、输入与产物 manifests、正式交接身份均待 native/root 提供。本目录只是运行清单及新建无敏感附件样本，不能作为 candidate03 已运行或通过的证明。

执行优先级：新包身份核对后快速进入确切目标界面并先保存截图；先完成有界搜索→清空、真实picker、真实录音保存及正常退出冷启，再独列像素差异。只读探针仅解决当前单步必需的目标/ACK问题，不反复扩大探针或增加前提，不重复审计旧失败证据。单步环境阻塞及时报root，并继续不依赖该阻塞的可测项。

## 入场与控制边界

- 禁止使用旧 candidate02 替代新包。只在收到 sealed 绝对路径、bundle/exe SHA、构建 source/input aggregate、Mac codesign 记录后，独立重算产物身份并核实际 PID、主窗口及资源 URL。若身份不符先停，不动源或重建产物。
- Mac 所有 UI 动作使用公开 CUA API。`getApp` 可后台启动，不将取得AX绑定等同于前台激活。不存在已文档保证的activate/unhide接口，不再绑定Dock或进行旧包激活研究。
- 搜索功能入场：目标进程真实 `NSSearchField` firstResponder；fresh AX搜索字段enabled、名称/当前值正确。显式点击之后核实这两项，再允许一次固定合成查询输入；输入后核目标字段实际值与正文未变。若未获得正确firstResponder，不盲paste。
- NSWorkspace frontmost、app.active、window.key/main/onscreen分别记录。global frontmost不单独阻断全部功能验证；同态像素/激活结论必须额外满足所需可见/焦点一致，不能把上述指标混为一谈。
- CUA动作后fresh AX再决定索引；截图后如需索引重读AX。无任意sleep、无无界重试。新getApp/可能长挂调用及时向root报告，timeout请求并非实际返回上界；若长挂等待root中断并记录确切pending动作。
- 只读REA可核真实原生firstResponder、有限DOM/编辑器状态和元数据；不改DOM、焦点、selection、编辑器状态或应用行为。原版系统进程若不可附着，不绕过限制。实际对象身份只有确实观察到同一引用时才报告严格identity，不用相等JSON替代。
- Android尚未得到显式ADB输入技术答复；不重问、不mirror、不尝试native输入。APK身份/静态metadata可先核，实际native路径等待答复与正式新包。用户最新已解锁，不凭旧历史重复请求解锁。

## 独立执行顺序与证据

1. **身份及安全起点。** 重算sealed包和输入manifest；记录source、exe/资源SHA、签名、PID/窗口；只读精确synthetic QA行建立正文/document/revision基线，不导出私人DB。记录应用启动可用/错误/外部请求观察范围；不把无观察等同于无网络。
2. **搜索与F07回归。** 从明确QA A起点先完成一次真实固定zero→clear并保存首张目标截图、AX、必需的原生firstResponder与有限正文状态。核A文档保留、zero隐藏且editable=false、clear恢复且editable=true。A→B→zero→clear的对象身份/selection与真实Undo/Redo、快速shortcut路径在核心picker/录音冷启之后按受影响问题需要补充，不使这些额外探针阻塞核心实际路径。显式focus流程通过不能覆盖未执行的快速shortcut异常。任何错误输入先保全证据再在目标明确时恢复。
3. **零结果UI。** 观察可信loaded/search零态中的list头、blank editor、toolbar标题/副标题及启禁状态。loading/sync失败/barrier/gallery/mobile/真名空folder等属于不同状态，不将源码检查当原生像素通过，也不无界构造运行不支持的场景。原版与新包若能取得同几何/同搜索/主题/焦点/可见条件，才预登记ROI并计算raw差分；否则保留UNKNOWN，不比较旧A图与新zero、不缩放/平移优化/掩盖光标。
4. **真实附件picker及正文ACK。** 使用本目录新建txt/png，走新包原生真实picker。txt导入和图片分别核UI实际结果（不预设txt一定成为可见节点），记用户动作、原生dialog/选择路径、事件反馈、父接线状态、目标note ID、实际正文document及媒体引用。仅媒体文件落盘或picker关闭不算正文ACK；持久化正文中的reference、revision更新与文件hash都需对应同一note。若某文件类型被拒绝，保留真实拒绝，不用另一条接口替代picker通过。
5. **真实录音及正文ACK。** 经真实录音入口启动/暂停/继续/完成，记录实际麦克风授权与设备可用性、时间/状态、停止后最终数据、父层插入/ACK及持久化媒体引用。只有完成编码且正文引用成功才可称保存；关闭/retry/错误路径按真实发生保留。旧静音或mock blob不算真实录音、可听或设备成功。
6. **正常退出与冷启。** 在UI/本地正文ACK均完成后，经应用正常退出，再从同一sealed包冷启。重核新PID/产物身份、目标note正文、附件引用与文件hash。不能用强杀/热reload替代正常退出冷启；若正常退出阻塞，记录未完成并等待root协调。
7. **实际打开/播放及清理现场。** 分别执行附件打开/图片查看与录音播放，保留真实出现的系统/应用结果及音频是否可听的实际证据。仅播放器出现、时间变化、文件非零不能推断听到声音；若无可靠声音观察，报告“播放触发/计时观测”与“可听UNKNOWN”。查询清除与回安全QA A仅在目标/firstResponder正确时进行；正常关闭dialogs，不删除用户内容。

固定zero查询：`QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。原版现存临时查询恢复仍待可控条件，不在本准备步骤执行。

## 新证据目录与判定

正式运行使用新的 `unified-candidate03-independent-01/identity|mac|android` 等root交接后确认的目录。冻结旧baseline28项与旧candidate02独验目录。所有关键step保存原始AX/截图/有限只读状态、实际时间和错误。每项区分：observed PASS、observed FAIL、BLOCKED/NOT EXECUTED、UNKNOWN；source-ready、功能pass、身份pass、像素pass不互相替代。

最终提供执行报告、实际身份表、每条fixture/媒体/正文ACK关联、冷启结果、播放观察范围、已恢复/未恢复现场与manifest。只有仍存在新变更/失败/未解风险才拓展检查，不反复跑无关测试。

## 附件样本

- `fixtures/candidate03-picker-proof.txt`：UTF-8、3行合成文本，标记C03-PICKER-TEXT-20261104。
- `fixtures/candidate03-picker-proof.png`：240×120 RGB合成测试图片，白底、黄色方块和C03文字，不含私人内容。

样本仅写入workspace，未送入任何应用picker、正文或远程服务。manifest记录实际bytes/SHA，自身不列入files。
