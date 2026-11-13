# account109 登录与双桌面验收用例

最新实际进展（2026-11-13）：双桌面核心数据场景已有实际证据，见 [本轮结果](RESULT-LATEST.md)。[full-native02](macos/full-native02/README.md) 的十项通过覆盖自动连接、双向完整 document/plainText 和 PNG/bin 原字节、暂停恢复及进程离线补齐，但该整轮仍因原生 eval 超时而失败。随后 [headless-continuation01](native/headless-continuation01/README.md) 在保留的同一对库中，用生产 Rust 功能完成既有冲突 keep-all、双端完整两分支及原始附件核对、真实退出、本地新建、重启和两向排除；三个进程全部自然退出，零强制信号。此续验为新的原生无界面候选，不重分类旧失败，也不替代 UI/浏览器验收。

| 本轮用例 | 当前可证范围 | 尚缺或限制 |
| --- | --- | --- |
| SYNC-01 | 已有真实授权恢复、同账户自动连接、两端当前 device 不同且互相连接通过 | 无手工配对；不能仅用 online 判收敛 |
| SYNC-02/03 | A/B 新笔记双向完整格式正文、引用、授权读取及 PNG/bin 磁盘原字节通过 | OS picker/物理键盘、普通非冲突的既有正文修改未单独授予整项通过 |
| SYNC-04 | B 暂停时排除新笔记，恢复及进程离线重启补齐通过 | 不等于系统断网或全部暂停本地编辑排列 |
| SYNC-05 | 两端原有两个完整冲突分支经生产 keep-all 后双方均保全，原字节一致、冲突归零 | 无界面命令绕过确认；冲突页面交互未由此验收 |
| SYNC-06 | 关闭账户 UI 时同步、原库新进程恢复授权并自动连接、B 离线重启补齐通过 | 未执行所有双端重启后修改排列 |
| SYNC-07 | A 原生退出后本地新建/重启保留，两向新笔记排除，原有全文与全部附件保留通过 | 重启前 27 次/3005.87ms、后 29 次/3009.15ms 采样；relogin01 失败在 B 启动错误检查，重新登录恢复尚未通过 |
| AUTH-07 续验 | relogin02 使用新 `10814415` GUI：原库基线和两 GUI ready，通过明确 B 刷新拒绝分类后实际执行一次 UI SignIn；两端自然退出 0。[23 项执行器独审](native/relogin-review03.md)通过 | 实际运行因 `account_auth_identity_invalid / responseMetadata` 失败；没有编辑/enable，重新登录后的补齐、双向修改和重启仍未执行。旧 relogin01 保留原未分类边界 |
| AUTH-06 部分 | 实际原生 signOut 关闭 profile/连接并禁用；B 保持 ready | 取消确认、UI 成功提示与切换另一账户不在此次实测中 |
| ANDROID-01～04 | 本地四篇合成全文保留、实际 coordinator 网络失败已有记录 | 账户三端前提未满足，手机起源附件亦未执行 |
| RELAY-01 | [独立公网实测](native/relay-live01/receipt.json) 44.639 秒通过：正常 Client::map 自动回退至真实 Quick Tunnel，64 KiB 原字节及错误指纹拒绝通过，本次 provider PID 已回收 | 本地合成协调面与身份，关闭 iroh 并丢弃 WebRTC 信令；不代表真实账户、Android 或 4G/WiFi 已验收 |

无界面入口仅在 `sync-e2e && debug_assertions && desktop` 并同时启用两项显式开关时生效。它使用正常 Workspace lease、Store/Session、账户 owner 和同步 adapter，以真实 token 回答保存协调；没有 WebView、编辑器草稿或身份注入。独立 Rust 7 项和关闭 feature 编译、Node 59 项、实际临时库 7 项烟测均通过；详见 [native 审阅](native/headless-review01/review.md)、[Node 审阅](macos/headless-node-review01/review.md)、[烟测](native/headless-smoke01/README.md)。

Android [同源 Rust 公共探测](android/public-native01/README.md) 的六次 coordinator 请求均连接阶段超时，而 Logto discovery 200；应用实际为 `account_network / coordinator`。没有修改手机网络设置，也没有定位精确路由原因。三端执行器已独审并补齐最初四篇正文保全，但实际三端用例仍未执行。净化源码全新历史候选已更新封存；GitHub 和 Actions 尚未执行，维持测试完成后的交付顺序。

历史失败：[continuation01](macos/full-native02-continuation01/README.md) 只读两分支基线通过，但 A 的 WebView `ready/documentProbe` 超时，B 未启动，未执行冲突或退出；SIGTERM 与清理失败保留。后续父级原生访问明确报告当时 Mac locked，只作当时访问条件，不追认为历史根因。下方早期记录保留原时点，当前状态以上述结果为准。

最新续验：[真实双桌面五轮记录](macos/real-account-runs01/README.md)。`90b8b28b` 两端真实登录与首次合并确认已成功；`9263ea87` 在同一对数据根恢复两个真实授权，无新授权请求。两轮均未建立自动连接，后一轮 B 返回 `account_authentication`，SYNC-01 失败，后续账户数据和三端场景仍未完成。用户已允许命令行调用真实功能进行测试；后续采用原生功能调用与必要 UI 冒烟组合，仍核对完整文档和附件原字节。下文较早的锁屏/单端登录记录保留其历史时点。

2026-11-13。状态：**产品内真实托管登录/注册、双桌面及 Android 账户自动同步尚未完成验收**。独立浏览器测试已验证托管注册/PKCE→真实服务 profile/enrollment，但不能替代产品内下述验收。`5d30f16c` 起原生应用默认开放账户入口，可显式设置 `VITE_NOTES_ACCOUNT_NATIVE=0` 关闭；普通浏览器默认隐藏。开发浏览器 fixture 仍须 DEV、DEBUG、ACCOUNT_UI 三项同时满足，其结果只验证 React、命令包装、状态恢复、布局和生命周期。

## 前置条件与隔离

- 确认真实 Logto/Vercel/Redis 配置、server enrollment、原生认证接线、常驻账户 Runtime 和 `account_command` 均已就绪；使用可追溯的桌面 App。记录服务与客户端 revision、App 构建信息、执行时间和用例结果。缺少前置条件时标记“未执行”，不得用 fixture 补作真实产品结果。
- 只使用专用合成账户 A、B，显示名如“账户验收 A/B”，不得使用个人账户。密码只由测试者在真实 Logto 托管页面输入；不写到命令、fixture、截图、日志或文档。不得复制 token、授权回跳 URL、code/state/nonce、配对邀请或密钥作为证据。
- 两个全新绝对数据目录，完全避开默认用户库；不手工填写 workspace、不复制邀请、不经设备同步页配对。先确认二进制支持已有 `--data-dir`，实际认证只能由原生系统浏览器流程启动。

```sh
# ACCOUNT109_APP_BIN 指向本次构建交付的 App 内实际可执行文件。
: "${ACCOUNT109_APP_BIN:?请指定本次验收的桌面可执行文件}"
test -x "$ACCOUNT109_APP_BIN" || exit 1
ACCOUNT109_CASE_ROOT=$(mktemp -d /private/tmp/account109-real.XXXXXX)
export ACCOUNT109_CASE_ROOT
mkdir -p "$ACCOUNT109_CASE_ROOT/desktop-a" "$ACCOUNT109_CASE_ROOT/desktop-b" "$ACCOUNT109_CASE_ROOT/assets"
python3 - <<'PY'
import hashlib, os, struct, zlib
from pathlib import Path
p = Path(os.environ['ACCOUNT109_CASE_ROOT']) / 'assets'
def chunk(kind, data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
pixels=b''.join(b'\0'+bytes([32,128,224])*64 for _ in range(48))
(p/'account109.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',64,48,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))
(p/'account109.bin').write_bytes(bytes(range(256))*16)
for f in sorted(p.iterdir()):
    print(f.name, len(f.read_bytes()), hashlib.sha256(f.read_bytes()).hexdigest())
PY
"$ACCOUNT109_APP_BIN" --data-dir "$ACCOUNT109_CASE_ROOT/desktop-a" &
"$ACCOUNT109_APP_BIN" --data-dir "$ACCOUNT109_CASE_ROOT/desktop-b" &
```

证据只保存合成数据、脱敏安全状态及附件长度/SHA256。浏览器截图须避开凭据输入和地址栏；服务器健康/目录在线/命令 ACK 均不能单独判定“同步完成”。中断或失败保留目录供排查，不通过清库消除归属或冲突问题。

## 真实托管 UI 与认证

| ID | 可执行操作 | 通过标准与最小证据 |
| --- | --- | --- |
| AUTH-01 本地使用 | 两端均未登录；在 A 新建标题“账户验收本地”，输入“合成测试文本”，关闭设置后重开笔记。 | 可以编辑、保存并重启保留；没有强制登录。记录标题和保存结果。 |
| AUTH-02 创建账户 | A 设置→账户与同步→创建账户；在实际系统浏览器核对可信 Logto 托管注册页，用全新合成账户 A 完成注册并回到 App。 | App 无密码表单；等待态有取消；仅经原生验证回跳后显示 profile；首次合并说明可见，本地笔记仍在。记录脱敏 profile/状态和托管页类型，不记录凭据/回跳。 |
| AUTH-03 登录 | B 设置→账户与同步→登录；确认真实托管登录入口，登录同一账户 A 并回 App。 | 两端账号一致，状态来自真实 Runtime；不把设备在线当数据已应用。没有复制 token/邀请等手工操作。 |
| AUTH-04 取消/迟到 | 在一个新隔离库发起登录，App 内取消，再完成先前浏览器页；重复一次“等待时关闭账户页/设置→重新打开”。 | 取消后旧回跳不可恢复旧授权；关闭页面本身不取消 native Runtime。重开显示当前权威状态，无旧错误/成功提示回写。 |
| AUTH-05 错误恢复 | 断开测试 App 的网络再登录/立即同步；恢复网络并按重试。另用受控认证负例验证过期会话/state 不匹配。 | 安全文字错误、不暴露上游原文；本地编辑仍可用；不假报登录/同步成功；恢复后无失效错误或重复登录指令。负例须有原生证据，fixture 不替代。 |
| AUTH-06 退出与归属 | A 点击退出，先取消确认再确认退出；用账户 B 尝试登录同一个 A 数据目录。 | 取消确认不退出；确认后原生连接/授权关闭，UI 仅在确实退出后提示成功；本机笔记保留。B 不得接收 A 资料库数据，归属不匹配说明明确，不偷偷重绑。 |
| AUTH-07 重启恢复 | A 重新以原账户登录，并确认开启“同步此设备”；保持登录，退出 App 后用同一数据目录重启，保持设置页关闭，再观察 B。 | 会话按已持久授权恢复，workspace/device 不变；native 不依赖账户组件挂载；刷新失效时明确要求重新登录。记录安全身份摘要和进程重启前后结果。 |

AUTH-05/07 的恢复负例须明确区分：实际请求网络失败或认证服务暂不可用时，原授权及 binding 保留，状态读取只读，用户显式“重试连接”恢复且原暂停状态不变；明确的 refresh 授权拒绝才进入重新登录。无效响应/配置/存储/归属错误不得统一变成登录失效。受控故障用例保留有限分类与本地数据证据，不保留第三方描述、token 或回跳参数；它们不替代真实产品恢复运行。

## 同账户双桌面自动同步

AUTH-02/03 完成后执行；两端均使用账户 A。首次登录默认暂停：在 A、B 分别开启“同步此设备”，核对账户与本机数据合并说明并点击“开启并合并”，确认原生状态的 enabled 为 true。该确认是首次合并授权；后续发现和配对由账户 Runtime 自动完成。首次发现/建连最多观察 120 秒，已连接后的数据收敛每项最多 60 秒；超时记失败并保留待处理/错误状态，不无限等待，也不以“立即同步已发送”判通过。

| ID | 可执行操作 | 通过标准与最小证据 |
| --- | --- | --- |
| SYNC-01 自动发现 | 两端登录并完成上述首次合并确认；不打开高级设备同步、不复制邀请，关闭两端设置页。 | 两端自动发现和连接；相同真实 account workspace、不同 device；连接属于可信同 owner/product。原生记录证明自动配对链，不只目录心跳。 |
| SYNC-02 A→B | A 新建“账户验收 A→B”，正文“中文合成第一段／第二段”，添加粗体、清单、表格；插入上述 PNG 与 bin。等待 B 自动出现。 | 完整 document 与 plainText 等价；原生只读检查或备份解析记录正规化比对结果，不能只看标题。B 导出两个附件，用 `shasum -a 256 <导出文件>` 和长度对照初始资产。 |
| SYNC-03 B→A | B 新建独立同结构合成笔记“账户验收 B→A”，同样插入资产，并修改 SYNC-02 的合成正文一处。 | A 自动收到新笔记和更改；再次比较 document/plainText 和附件原字节，最近成功时间与待处理数来自真实同步 Runtime。 |
| SYNC-04 暂停/离线补齐 | A 关闭“同步此设备”，本地新增合成笔记；确认 B 暂不收到；A 重新开启并确认合并。随后让 B 离线，A 再修改，恢复 B 网络。 | 暂停仍登录且能编辑；开启/恢复后自动补齐，dirty/inbox 无丢失；无伪成功或重复内容。 |
| SYNC-05 并发冲突 | 两端离线后分别编辑同一已有合成笔记，再恢复网络；点账户页“查看冲突”。 | 进入现有冲突页，双方版本保留且可审阅；按既有确认流程选择保留/另存，不能静默丢版本。记录冲突数及解决后双端文档比对。 |
| SYNC-06 关闭 UI/重启 | 账户页关闭期间在另一端修改；再分别重启 A、B 的同一数据目录，重新执行双向小改动。 | 关页不停止账户同步；重启保留 workspace/device、正文和附件；再次自动连接及补齐，不手工配对。 |
| SYNC-07 退出停止 | A 退出账户后，在 B 新建合成笔记；在 A 本地继续编辑。 | A 不再收发账户数据，本地保存正常；重新登录原账号后按 Runtime 权威状态恢复，未登录窗口无误报成功。 |

## 少量 Android 三端用例

同一时点只允许一个 ADB 操作者；使用独立测试 applicationId 和空数据根，不覆盖原用户应用，不复制账号 grant 或手工配对邀请。先通过 `adb devices -l` 核对授权设备与系统版本；只向 app 私有数据根的合成导出读取结果，避免整机截图/日志混入个人内容。三端均登录合成账户 A。

| ID | 可执行操作 | 通过标准与最小证据 |
| --- | --- | --- |
| ANDROID-01 登录与自动发现 | 手机上通过真实系统浏览器登录；仅确认账户同步，返回应用并关闭账户页。 | 桌面 A、B 与 Android 自动建立可信同 owner/workspace 关联；设备 actor 不同，无手工 token/邀请传递。 |
| ANDROID-02 桌面→手机 | A 新建含中文格式正文、PNG 与 bin 的合成笔记，等待手机应用后导出。 | 手机与 A 的 document/plainText、附件原字节长度/SHA 一致；B 同样收到。 |
| ANDROID-03 手机→双桌面 | 手机上新建/修改合成正文并附加合成文件，等待 A、B 应用。 | 双桌面与手机的完整 document/plainText 和附件原字节一致，不能只比较标题或设备 online。 |
| ANDROID-04 暂停与前台恢复 | 手机暂停账户同步，A 修改；手机继续本地编辑后恢复同步，再执行一次离开/返回前台。 | 暂停不收发、仍能编辑；恢复后补齐且本地版本不丢；前台恢复自动重连，未宣称系统杀进程后常驻后台。 |

## 4G 与 WiFi 匿名中转

依据 [跨网络任务](../../plan/tasks/app-account109-relay.md)。RELAY-01 已按下述受控前提独立实测通过，RELAY-02～04 尚未执行；既有双桌面数据通过不证明使用了中转。不得以 `tunnel-ready`、设备 online 或“立即同步”命令 ACK 单独判通过。读取实时 `Mapping::current_transport()`，不能使用可能在重连后过期的初始 `Mapping::transport()`。证据只记录有限传输标签、时间和合成正文/附件校验，不保留真实临时隧道 URL、证书或凭据。

| ID | 可执行操作 | 通过标准与最小证据 |
| --- | --- | --- |
| RELAY-01 自动回退 | 显式 opt-in SDK 检查中，让本地合成目录丢弃直连信令，并使用真实预置 Quick Tunnel；调用正常 `Client::map`，通过映射传输合成字节。 | 顺序记录 direct-attempt、fallback-attempt；实时传输为 `cloudflare-tunnel`；完整字节往返一致、未经放宽的设备认证生效；SDK close 后本次提供程序有界终止并确认 PID 无残留；mapping 与测试监听任务 join，SDK origin 的取消证据单列，不作全端口独立关闭声明。明确这是公网传输层实测，非真实产品账户或手机网络结果。 |
| RELAY-02 手机 4G ↔ 桌面 WiFi | 两桌面独立数据根、手机独立包；记录测试时实际默认网络。完成真实账户授权后执行 ANDROID-02/03 的双向正文及附件同步。 | 手机与至少一个桌面的实际承载映射为 `cloudflare-tunnel`，三端完整 document/plainText、附件归属及长度/SHA 一致；原四篇全文/附件保全。未观察到中转则本场景未覆盖，即使数据同步成功。 |
| RELAY-03 切网恢复 | 保留同一库和授权，在手机移动网络与 WiFi 间切换，再双向修改合成笔记。 | 记录默认网络变化、通道延续或重建及实时传输；有界恢复并补齐，身份与原数据保留。自动恢复与点“立即同步”后的手动恢复分开判定，不能混为通过。 |
| RELAY-04 中转不可用 | 受控测试中模拟 provider 启动/注册失败或远端 tunnel 未发布，保持本地编辑。 | 有界错误/重试、无假成功、无未认证降级；本地正文与附件保存正常。恢复中转后补齐并核对完整数据。受控模拟结果不替代真实公网故障结果。 |

## 解锁后新增执行记录

见 [2026-11-13 桌面实际检查点](macos/unlocked01/README.md)：两个独立桌面在 ec4348 与 11cb 两轮均曾 ready；11cb 的 A 已完成真实产品登录并保留首次暂停，B 在原生 coordinator 请求阶段失败。A 确认开启并合并后未建立连接。诊断 stage/DTO 已修正，并新增可复用真实双桌面执行器；最新 7841 候选再次受 Mac 锁定影响，停在 startup 前置，没有执行数据步骤。

AUTH-03 只有桌面 A 的局部成功，不能判定双端整项通过；SYNC-01～07 和 Android 三端仍未通过。下表旧启动/构建结果描述对应历史尝试，以本节和精确候选回执为当前状态。

## 当前执行边界

已执行的浏览器 fixture 及命令见 [UI 检查点](ui/README.md)。Android 隔离候选已完成本地编辑、更新保留与登录发起/取消的 6 项真实冒烟检查，见 [真机记录](android/README.md)；该覆盖不包含 AUTH-04 的迟到回跳等完整场景，不能将对应整项验收判为通过。上述 AUTH/SYNC/ANDROID 完整用例仍未完成，须逐项填写实际结果。正式交付必须具备产品内真实链证据，不能用 fixture 或局部冒烟结果替代。

| 用例或前置检查 | 已执行结果与剩余条件 |
| --- | --- |
| 双平台构建前置 | `d69ffbce` 经净化 root `d7f3e2a9` 完成 [macOS production bundle](macos/LATEST-CANDIDATE.md)和 [Android unsigned APK](android/sourced69-production01/README.md) 的实际本地构建及 staging，构建后源码 clean、包内身份匹配；这不是产品运行或远程 Actions 验收。 |
| 桌面可交互启动前置 | `ad18a872` debug 候选在独立数据根等待 45 秒仍为 hidden/startup loading；当时 Mac 锁定。新的默认入口 `ec4348c6` debug/e2e 候选已构建并保留，尚未启动；本轮两次原生工具复查仍为 Mac 锁定。没有执行第二端登录，桌面 AUTH/SYNC 用例未通过验收。见 [macOS 记录](macos/LATEST-CANDIDATE.md)。 |
| Android 最新候选本地回归 | `d69ffbce` debug 隔离包原地更新后，[3 项真机检查](android/d69-debug/README.md)通过：两条旧笔记完整 document/plainText 保留、默认原生账户页 signedOut、真实 UI 新建全文精确一致。未发 SignIn 或启用同步，不能将 AUTH-03、SYNC 或 ANDROID-01～04 判为通过。 |
| Android 登录前置（AUTH-03 流程、ANDROID-01） | [hosted-live01](android/hosted-live01/README.md) 单次真实托管凭据输入、提交并返回应用，原生终态为 `error/account_network`，无 profile 且同步禁用。本次登录失败，未证明回跳验证成功，ANDROID-01 的自动发现未执行。 |
| Android 最新原生复核 | [sso06](android/sso06/README.md) 已在 d69 包恰好发起一次真实 UI SignIn，未输入凭据；原生再次返回 `error/account_network`、无 profile、同步禁用。它独立证明最新包的原生失败仍存在，不以 Chrome 超时代替。未自动重试、未启用同步，AUTH-03/ANDROID-01 仍未通过。 |
| 手机端网络诊断 | [直接导航证据](android/hosted-live01/public-navigation03.json)：canonical `/healthz` 30 秒无 HTTP 结果，Logto discovery 对照约 606 ms 为 200。只证明该次手机 Chrome 的路径差异，不定位原生失败请求或 DNS/TCP/TLS 原因。没有修改网络配置或认证重试。 |
| 最新服务侧诊断 | [只读部署/API/Dashboard 核对](server/sso06-readonly/README.md)记录 READY、主机 health 200，失败时段请求/CDN 列表未见可关联 profile 行；未取得完整日志覆盖保证，不据此推断精确失败阶段。无配置或密钥变更。 |
| SYNC-01～07、ANDROID-02～04 | 账户产品链的双桌面及三端收敛尚未执行。须先完成可交互启动、成功登录及首次合并授权，再验证完整 document/plainText 和附件原字节。 |

后续恢复测试需先确认 Mac 已解锁、手机可正常访问 canonical coordinator，并核对实际候选源码身份。继续保留现有失败证据及合成数据；新尝试单独记录，不覆盖上述结果。
