# Account109 工作区整理与提交

2026-11-13。按用户本轮要求，检查主工作区和当前开发工作树，将已有工作整理为可审阅的本地提交。本轮不扩大登录、部署或发布实现范围。

## 已收拢内容

| 提交 | 内容与边界 |
| --- | --- |
| `737a9dcc`（此前已有） | 账户同步架构、UI 设计、任务拆分与外部服务调研。不是完成实现。 |
| `7c9fb901` | 原生 CyberGrid SDK / Logto 调研、账户 owner 与 workspace 绑定、enrollment 和持续授权缺口、原生任务检查点。没有新增原生登录代码。 |
| `9988a5db` | 忽略本地环境文件、Vercel 状态和签名材料；不改变已跟踪历史。 |
| `2f44391b` | CyberGrid 协调服务源码与许可、固定身份验证的账户 profile、稳定 workspace 派生和 Vercel 入口配置；没有执行真实部署。 |
| `1165633b` | 账户 UI 与显式开发测试能力门控、严格 IPC DTO、fixture 用例和设置回归；默认关闭账户能力。 |

服务作者原提交为 `9a0c7f15`，经 cherry-pick 收入 main。来源 pin 与具体检查见[服务作者记录](server/author.md)。根项目补充 Node `22.x` engines，与协调服务运行要求一致。

UI 作者原提交为 `4cc18c1c`，经 cherry-pick 收入 main，细节与复跑入口见[界面检查记录](ui/README.md)。

## 检查与修正

- 服务独立审阅发现所有用户共用认证限流桶的问题。已改为仅在 Vercel 环境严格接收平台单值 IP，其他环境使用 socket 来源；独立复核接受修复。主工作区重新执行 profile 与平台 IP 定向测试，6/6 通过、0 跳过。
- 主工作区服务 `build:vercel` 通过。作者完整回归在限流修正前 149/149 通过、0 跳过，使用隔离本机 Redis；修正后重新运行构建和上述 6 项定向测试。不能把两次覆盖写成最终版本全量回归已运行。
- UI 独立审阅发现取消失败提前释放登录事务、取消/退出未确认即提示成功、状态恢复后旧错误及重试操作残留三项问题。已修复并补充 fixture 检查。作者桌面/手机账户组 27/28 项、默认设置组 146/159 项、手工同步设置 56 项及生产 debug 隔离检查通过；测试均有明确模拟边界。
- 服务限流修复与 UI 三项修复均由原审阅者在最终合入版本重新只读检查，接受关闭；审阅者未重复作者运行，运行结果仍分别归属作者与主工作区复验。
- 两部分合入主工作区后，重新运行 `pnpm typecheck`、`pnpm build`、`pnpm version:check` 和 `git diff --check`，均通过。前端构建仅有既有大 chunk 提示，未因此增加本轮优化范围。
- `.env`、`.env.local`、`.vercel/project.json`、签名文件和 `artifacts/account109/private/` 的忽略规则已验证。新增源码按精确文件提交，不纳入 node_modules、生成的 Vercel 静态目录或 Android 构建缓存。
- 新增文本做有限密钥模式检查，未发现私钥块、GitHub token 或带真实认证字段的 Redis URL。该检查只针对本轮变更，不是旧历史的发布批准。
- 当前有效工作树中，其他旧任务没有待提交的已跟踪源码修改；旧 Android 工作树残留为插件构建缓存，保留原地，不纳入提交。

## 功能与交付边界

账户界面在原生 `account_command` 实现前仅供显式启用的开发测试，生产和默认开发入口关闭。原设置分类、未登录本地编辑与手工同步保持可用。界面测试使用明确标识的 JS IPC fixture，不等于真实登录或同步验收。

原生授权、账号 enrollment、自动发现和动态映射接入仍待实现；本轮没有重做双桌面/Android 设备验收。既有 sync108 手工同步结果仍按其原记录读取，不能作为账户同步证明。

当前仓库没有 remote，本轮提交只留在本地 main。旧开发历史包含过程材料，后续 GitHub 发布仍必须使用经审计的源码白名单与全新历史，不直接推送本仓库。Vercel 真实部署、真实 Logto 登录及 GitHub Actions 编译打包尚未完成。

## 后续整理检查点（2026-11-13）

本节更新上方早期检查点的状态。主线已继续收拢以下工作，提交仍留在原开发仓库；远程发布继续使用独立的源码白名单和全新历史。

- `73e1c598` 至 `19740840`：独立 Rust 授权 owner 及其 consent、refresh、撤销、持久化和 RFC 9207 issuer 修正。主线认证测试 15 项通过；另显式运行只读真实 Logto discovery 测试，1 项通过。真实 discovery 不等于产品内登录验收。
- `8f968bef`：签名 enrollment、共享 Redis 限流和账户测试用例修正。服务全量回归 155/155 通过，0 跳过；独立限流复核 8/8 通过。`4183af8b` 收敛 advertised scopes 后，相关定向回归 20/20 通过，类型检查与服务构建通过。
- `c1741e80`：固定来源的 CyberGrid SDK、双平台 provider、许可材料和 Noise 持续授权 gate。provider 的上游 notice/module 清单保留原始字节，未为消除空白提示而改变来源指纹。
- `61c3f934`：原生账户 owner、独立 `.account/noise` 凭据、设备发现、签名 enrollment、动态 TCP mapping、生命周期和平台回跳接线。主线原生账户测试 8/8、同步测试 32/32 通过。该提交中的编译与契约检查不替代实际 App 和设备测试。
- UI、发布工具和测试用例的其他已审阅提交已在主线保留；具体测试边界见各自验证文档。生产账户入口仍待原生整合后的候选构建验证。

服务已部署到 `https://cybernote-sync.vercel.app`。本次部署 ID 为 `dpl_7NemtV61Qu94ACyn97jGvxjgSHYo`，状态 READY；部署源码来自 `4183af8b39efb1096d77a254a4a78aa164a89b24`，显式 staging 的 116 个文件摘要为 `8ee35edee965bbfc50e0ecb49b1cd50a7537c28fe277ef518fce47fbecbbcaad`。最终部署复验 health 200、四个 scopes 正确、仅公钥 JWKS 200、匿名 profile/enrollment 401。因本机 fake-IP 路由问题，这组独立 curl 检查仅在测试进程中解析到当前公共 IP，仍使用 canonical hostname 和正常 TLS 校验；产品未添加该绕行。

真实浏览器与独立服务 harness 已验证托管注册、PKCE、profile/enrollment、刷新轮换及撤销；它们没有注入产品 grant，也不构成双桌面/Android 账户同步通过证据。产品内真实用例继续按 [ACCOUNT-TEST-CASES.md](ACCOUNT-TEST-CASES.md) 记录。

主工作区唯一未跟踪项原为 `services/coordinator/node_modules` 临时软链接，已精确移除该链接，依赖源目录保留。私密配置和过程产物仍位于被忽略的目录，不纳入本次提交；没有推送旧历史。当前 Mac 的原生 UI 工具明确返回锁屏且自动解锁失败，真实可见桌面交互验收需要恢复解锁状态。
