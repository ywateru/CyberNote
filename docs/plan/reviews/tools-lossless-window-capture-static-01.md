# 只读窗口 PNG 工具：独立源码审查01

结论：**SOURCE-READY**，无阻断发现。冻结提交 `744a9247a571d7569351e428e50db579b9031187`，基线 `d8f832e83349c7503b872e0e88853d1ab7b0713a`。独审目录 `/private/tmp/apple-notes-window-capture-review01`。本结果允许后续由主任务安排有限实测；不等于已取得真实窗口PNG、原始背板、无重采样或像素一致。

## 身份与范围

4工具源逐字节核验，聚合 `838726b3629f53135c4da187002f94ab704295cc82b5d4bd541bedcec7130ff3`。聚合算法：完整相对路径字符串排序，拼接 UTF-8 `<sha256>  <path>\n` 后SHA-256。222个既有App/插件/原生/依赖产品文件与基线Git字节相同，检查前后hash保持一致。未修改工具、产品或主树，未运行真实list/capture/preflight、GUI、权限或设备操作，未使用共享Rust target/Gradle cache，未下载。

阅读了docs-sprint技能、任务合同、用法、作者报告/API研究和4工具源。main任务补充状态仅用于了解调度，不纳入作者冻结源身份。独审保留开发/验证分离，没有自修或自合并。

## 实现核查

| 边界 | 独立核查结果与源码位置 |
| --- | --- |
| 只读与白名单 | `scripts/window-capture.swift:39–79`只接受list/capture及固定选项，bundle严格限两值；无AX/任意shell/UI动作参数。`:280–292`在输出前按目标bundle、layer0、on-screen过滤，未读取窗口标题。没有启动、激活、移动、缩放、输入或目标数据写入路径；只读取目标可执行文件作身份校验。 |
| 精确身份 | `:163–229,269–275`校验bundle/PID/launch、规范exe路径、常规文件dev/inode/size/mtime/SHA及读取期间ctime稳定；CGWindow与SCWindow owner/ID/layer/onscreen/frame一致，窗口完整处于唯一显示器。list identity token还覆盖filter范围/比例/请求尺寸；capture前后重新取样并要求相同。实际采样边界明确，未宣称形式化消除瞬时复用。 |
| 单窗与权限 | `:253–268,296–313`先检查已有Screen Capture授权与console/login，使用desktopIndependentWindow filter；无请求权限、系统设置、私有锁屏key、全屏回退或自动重试。截图API只调用一次，不创建音频流。锁屏证明与OS隐私UI竞态诚实留UNKNOWN。 |
| 真实API与比例 | `:134–141,221–229,296–312`按filter.contentRect×pointPixelScale请求整数尺寸，有限内存边界，不以逻辑bounds直接冒称2×。非整数或实际CGImage尺寸不符拒绝；无后处理缩放。已独立读取本机SDK三头并核hash，确认属性、版本及像素/点语义；`scalesToFit=false`仍可缩小，作者没有把它当无缩放证明。 |
| PNG身份 | `:144–160,314–327`从返回CGImage直接用ImageIO的PNG destination编码，无JPEG中间文件；核PNG签名/IHDR、UTType、解码状态/尺寸、byte count/SHA，并读回验证落盘字节。manifest记录返回颜色/alpha/位深/ICC与范围限制。实际PNG成功路径仅用合成CGImage受控验证。 |
| 输出安全 | `:85–125,279–280,317–338`全新目录mkdir0700、fd锚定写入、固定文件名O_EXCL/O_NOFOLLOW、0600、fsync；先PNG后manifest，commit前普通错误只清理本次创建文件。已有目录/文件/symlink拒绝，不覆盖旧证据。SIGKILL可能留下文件，不伪称一定清理；外部调用器拒收该次全部输出。 |
| 有界过程 | `scripts/run-window-capture.py`固定构建observer、核当前源/build/binary身份，不接受任意命令；15秒默认、30秒上限，communicate超时SIGKILL并回收，返回124与acceptOutput=false。Swift监督环境/父PID检查是正常调用约束，不是对抗恶意同用户的安全隔离。编译器/helper调用没有应用目标启动路径。 |

公开API声明没有证明SCK内部无重采样、原始背板等价、同进程同几何瞬时窗口ID复用，也没有原子锁屏/权限状态。实现将这些固定UNKNOWN，`--require-unscaled`在输出目录、进程、窗口与权限访问前拒绝。这符合本次有限合同，不作为要求扩成系统级证明框架的阻断项。真实窗口范围/阴影/边框/色彩、权限主体、取图成功及采样比例仍须实测。

## 独立执行的必要检查

在全新 `/private/tmp/notes-window-capture-independent-build01` 运行已有build helper；Swift6.3.3、SDK26.5、arm64-apple-macosx14.2。observer及离线test两次编译均exit0，各编译stdout/stderr为空；build调用的版本查询另外输出`swift-driver version: 1.148.6`，保留在调用记录，未称整次调用输出全空。私有module-cache已清理。独立binary SHA-256 `ffb6c5908ef6344dde0e5ef0946b2ea912998a47d8d86c9c8b7cc1572878deea`。它与作者binary不同是重新嵌入构建目录/时间/源码路径身份的结果，不要求跨构建逐字节相同。

- 既有离线10组全部通过：参数/拒绝、原生尺寸、真实ImageIO合成CGImage→PNG、JPEG前缀/截断/错尺寸、独占输出及失败清理、strict提前拒绝。测试仅调用纯参数/合成图/临时文件与strict短路，未触真实进程/窗口/权限。
- 7个CLI检查通过：help、非法bundle、缺identity、非法UI动作、已有输出先拒绝、strict先拒绝、仅help进程的强制deadline。fixture PID/window/path未到达后端；旧manifest原字节不变，strict目录不存在。deadline只证明调用器能强制终止自己的help observer，不假称已经模拟真实SCK挂起。
- SDK三头实际字节/hash复核并留存相关声明片段；`git diff --check d8f832e HEAD`通过。

未扩跑产品矩阵、真实窗口list/capture或权限preflight，没有新增镜像常量测试。无修复需要。

## 交接

证据目录 `docs/verification/tools-lossless-window-capture-independent-01/` 包含前后身份、独立build-info、离线原始输出、完整CLI调用与输出、SDK片段、diff检查和结果。manifest按相对Path组件排序聚合，并另列完整路径字符串排序聚合；排除清单自身和外部报告，另存报告hash。

后续主任务应在解锁、目标确认且同几何条件下按已有用法运行一次metadata及选窗取图，保存监督报告与PNG/manifest，再核真实PNG签名/尺寸/比例、颜色和范围。只接受acceptOutput=true且PNG与manifest复核一致的有限证据；超时/中断文件全部拒收。此SOURCE-READY不追认历史JPEG或派生PNG为原始无损，也不关闭产品像素差异。
