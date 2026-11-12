# account109 登录与双桌面验收用例

2026-11-13。状态：**产品内真实托管登录/注册、双桌面及 Android 账户自动同步尚未执行**。独立浏览器测试已验证托管注册/PKCE→真实服务 profile/enrollment，但不能替代产品内下述验收。当前 UI 由显式测试 gate 开放；浏览器 JS IPC fixture 只验证 React、命令包装、状态恢复、布局和生命周期。

## 前置条件与隔离

- 主代理完成真实 Logto/Vercel/Redis 配置及 server enrollment；Pauli 提供认证接线，Singer 提供常驻账户 Runtime 和 `account_command`，Tesla 提供可追溯桌面 App。记录四者 revision、App 构建信息、执行时间和用例结果；缺一项时标记“未执行”，不要启用生产账户页。
- 只使用专用合成账户 A、B，显示名如“账户验收 A/B”，不得使用个人账户。密码只由测试者在真实 Logto 托管页面输入；不写到命令、fixture、截图、日志或文档。不得复制 token、授权回跳 URL、code/state/nonce、配对邀请或密钥作为证据。
- 两个全新绝对数据目录，完全避开默认用户库；不手工填写 workspace、不复制邀请、不经设备同步页配对。先确认二进制支持已有 `--data-dir`，实际认证只能由原生系统浏览器流程启动。

```sh
# ACCOUNT109_APP_BIN 由 Tesla 的本次构建交付提供，指向 App 内实际可执行文件。
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
| AUTH-05 错误恢复 | 断开测试 App 的网络再登录/立即同步；恢复网络并按重试。另由 Pauli 的受控认证负例验证过期会话/state 不匹配。 | 安全文字错误、不暴露上游原文；本地编辑仍可用；不假报登录/同步成功；恢复后无失效错误或重复登录指令。负例须有原生证据，fixture 不替代。 |
| AUTH-06 退出与归属 | A 点击退出，先取消确认再确认退出；用账户 B 尝试登录同一个 A 数据目录。 | 取消确认不退出；确认后原生连接/授权关闭，UI 仅在确实退出后提示成功；本机笔记保留。B 不得接收 A 资料库数据，归属不匹配说明明确，不偷偷重绑。 |
| AUTH-07 重启恢复 | A 重新以原账户登录，并确认开启“同步此设备”；保持登录，退出 App 后用同一数据目录重启，保持设置页关闭，再观察 B。 | 会话按已持久授权恢复，workspace/device 不变；native 不依赖账户组件挂载；刷新失效时明确要求重新登录。记录安全身份摘要和进程重启前后结果。 |

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

Singer 为唯一 ADB 操作者；使用独立测试 applicationId 和空数据根，不覆盖原用户应用，不复制账号 grant 或手工配对邀请。先通过 `adb devices -l` 核对授权设备与系统版本；只向 app 私有数据根的合成导出读取结果，避免整机截图/日志混入个人内容。三端均登录合成账户 A。

| ID | 可执行操作 | 通过标准与最小证据 |
| --- | --- | --- |
| ANDROID-01 登录与自动发现 | 手机上通过真实系统浏览器登录；仅确认账户同步，返回应用并关闭账户页。 | 桌面 A、B 与 Android 自动建立可信同 owner/workspace 关联；设备 actor 不同，无手工 token/邀请传递。 |
| ANDROID-02 桌面→手机 | A 新建含中文格式正文、PNG 与 bin 的合成笔记，等待手机应用后导出。 | 手机与 A 的 document/plainText、附件原字节长度/SHA 一致；B 同样收到。 |
| ANDROID-03 手机→双桌面 | 手机上新建/修改合成正文并附加合成文件，等待 A、B 应用。 | 双桌面与手机的完整 document/plainText 和附件原字节一致，不能只比较标题或设备 online。 |
| ANDROID-04 暂停与前台恢复 | 手机暂停账户同步，A 修改；手机继续本地编辑后恢复同步，再执行一次离开/返回前台。 | 暂停不收发、仍能编辑；恢复后补齐且本地版本不丢；前台恢复自动重连，未宣称系统杀进程后常驻后台。 |

## 当前执行边界

已执行的浏览器 fixture 及命令见 [UI 检查点](ui/README.md)。Android 隔离候选已完成本地编辑、更新保留与登录发起/取消的 6 项真实冒烟检查，见 [真机记录](android/README.md)；该覆盖不包含 AUTH-04 的迟到回跳等完整场景，不能将对应整项验收判为通过。上述 AUTH/SYNC/ANDROID 完整用例仍未完成，须逐项填写实际结果。正式交付必须具备产品内真实链证据，不能用 fixture 或局部冒烟结果替代。
