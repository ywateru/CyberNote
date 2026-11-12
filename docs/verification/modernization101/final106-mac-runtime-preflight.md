# Final106 Mac 原生运行预检

2026-11-10，只读准备；未启动应用/浏览器，未读取用户正文、Store内容或敏感日志，未执行测试、设备操作或权限变更。继承[105最小运行清单](final105-runtime-readme-preflight.md)的媒体范围，包路径与身份以下表为准；105包不再作为此次运行对象。

| 项目 | 准确值 |
| --- | --- |
| 应用 | `artifacts/releases/20261110-modernization106/CyberNote.app` |
| 实际入口 | `Contents/MacOS/notes-clone` |
| 版本 | `0.1.0` |
| Mac builtAt UTC | `2026-11-10T08:05:59.823Z` |
| 共用 prepare UTC | `2026-11-10T08:05:15.754Z` |
| revision / dirty | `bf26dae17f972fc09276deb456b4599e1ebe5d67` / true |
| fingerprint / inputs | `74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a` / 446 |
| 主入口SHA256 | `92161da1222fc2e0095ec0dde20083023b57a512d96ea336e12429475663f71e` |

身份依据同批次`mac.json`和`source-stamp.json`。签名为本机ad-hoc，未公证。这里不重复已完成的核包，也不把核包写成实际UI通过。

## 当前进程与安全切换

只读`ps`发现一个原生CyberNote进程：PID **49451**，启动时间2026-11-09 22:49:39，本体仍为`artifacts/releases/20261109-modernization101-r2/CyberNote.app/Contents/MacOS/notes-clone`。106尚未启动。有限`lsof -p 49451 -Fn`元数据有该实际入口，未见音频命名句柄；这**不能判断是否在录音**，不读取文件内容、不据此退出。当前本机可用约7.0GiB。

后续明确runtime gate后使用CUA原生App入口读取当前CyberNote界面（`cua.getApp("CyberNote")`），先确认是否有录音/暂停录音、保存、权限或导入任务。若存在用户正在操作或未完成任务，停止换包并报告，不结束录音、不代点权限。若正常空闲，通过应用菜单“退出 CyberNote”/Cmd+Q正常退出，观察保存/录音屏障和PID49451自然消失；不使用kill、forcequit或关闭窗口代替退出。

源码`src-tauri/src/lib.rs`菜单quit进入`app.exit(0)`，`RunEvent::ExitRequested`交给`recording_window::exit_requested`保存/录音屏障。此处说明当前源码的正常退出路径，不据此假定旧r2任意当前任务可无损中断。退出不完成即停止，不绕过屏障。

确认旧进程退出、无第二CyberNote后，才执行精确路径启动：

```sh
open "/Users/water/work/2026/Apple-Notes-Clone/artifacts/releases/20261110-modernization106/CyberNote.app"
```

随后只读`ps`核实际可执行路径，并从真实设置页核版本/UTC/指纹。若`open`复用了旧路径或身份不匹配，停止，不同时直接运行第二入口。生产Store使用常规app_data_dir；没有已批准的生产隔离Store开关，不能双开同一Store。UI操控使用CUA原生接口，普通chooser可通过其UI与路径跳转选文件；不使用osascript/CGEvent/页面脚本绕产品导入。

## 最小实际运行顺序（等待gate）

1. 核设置版本一次，保存上述身份；只在明确自有`FINAL106-Mac-runtime`备注操作。若当前是用户笔记，先经正常新建入口创建自有备注，禁止改用户正文/同步或隐私设置。
2. 一份小SVG含明显中文、Latin及水平tspan，经普通附件chooser导入。确认**实际列表/画廊缩略图**文字可辨且非空；右键“在备忘录中显示”回到同一自有备注并定位。只看原件预览不能替代缩略图证据。当前未找到已命名可直接复用的小runtime SVG，后续gate可在owned artifacts目录创建一份小文件，不建新字体/大fixture。
3. 三媒体依次通过普通chooser导入并激活：`/private/tmp/cybernote-delivery/artifacts/media99-fixture/originals/long-90min.wav`（86,400,044B，5400s，目标4860s），同目录`video-faststart.mp4`与`video-tail-metadata.mp4`（各96,754,277B，96s，目标约86.4s）。此次只读已核三文件存在且大小符合，合计279,908,598B。Mac直接选择冻结原件，不复制入口文件；受管附件会产生约280MB原件副本及小型派生cache。保存播放前、用户激活后时间推进、90%seek后继续推进证据；任一实际失败如实记录，不能用短clip替代。UI时间观察不等于Range字节/零预取或RSS测量。
4. 结束停止播放，保存自有备注。只登记本轮owned记录；受管副本只能经产品精确删除，不手工清整个附件/cache/垃圾箱，不改冻结原件。原始证据和签名包保留。

现有真正约束：旧进程是否正在录音必须后续UI确认；麦克风此前授权超时，不改TCC或假称完成录音刷新已过；无物理触摸板输入即不能声称实体捏合已验证。102原Android长按格式关闭仍未解释，106针对Android平台/宽度身份修复不撤销原失败。本次不重复Android案例或Mac表格/字号全矩阵。106作者负责本轮author runtime，实际证据须交不同reviewer独立核对。
