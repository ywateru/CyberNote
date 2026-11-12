# Account109 整合候选检查点

2026-11-13。本记录区分已执行的代码检查、候选构建与尚未通过的产品验收。完整目标仍进行中。

当前能力入口已在 `5d30f16c` 收口：原生默认开放账户 UI，显式 `VITE_NOTES_ACCOUNT_NATIVE=0` 可关闭；普通浏览器默认隐藏，fixture 仍受开发条件隔离。主线 compiled capability 24/24 与 typecheck 通过。下文旧候选中的 opt-in 描述指对应历史构建；真实登录和多端验收仍须逐项完成。

## 已执行

| 检查 | 结果与边界 |
| --- | --- |
| 主线认证 crate | 空 RT 修复后的 `3bd36935` 上 18 fixture 通过，0 失败、1 项 discovery 默认忽略；此前另显式运行真实只读 Logto discovery 1 项通过。没有用测试 grant 替代产品授权。 |
| 主线原生账户 | 前台恢复修复后主线账户 9/9 通过，作者手工 adapter 7/7 通过；反例在旧实现确实失败。 |
| 主线同步 | 32/32 通过，含真实 Store/Session、加密流与附件回归。 |
| 主线前端 | 类型检查通过；默认原生账户入口 compiled capability 24/24 通过。 |
| 主线发布输入及打包策略 | `d69ffbce` 收拢 Android ELF、unsigned、compiled manifest 及 Kotlin cache 修复后，publish 测试共 19/19 通过，0 跳过。原三项 P2 经[独立审阅](publish/android-stage-review/README.md)关闭；这不是最终发布批准。 |
| 最终服务部署 | READY，health 200、固定四 scopes、公钥 JWKS 200、匿名 profile/enrollment 401。详见工作区检查点。 |
| 真实 Rust owner | `b5df1e53` 的显式 live-smoke 进程退出 0，14 阶段全部成功；真实授权、强制 refresh、owner 重开、3 次部署 profile 连续性、logout 后 restore None。详见 [真实 Rust owner 验证](auth/RUST-LIVE-OWNER.md)，不替代产品 Runtime 或多端验收。 |
| Android 产品冒烟 | `6537b74b` 隔离候选在真实手机通过 6 项检查，包含完整本地 document/plainText、更新保留及真实 UI 发起/取消授权；[真机记录](android/README.md)保留初始失败和修复后结果。后续真实登录失败另见下项，不能用冒烟通过替代认证验收。 |
| Android 当前默认入口候选 | `d69ffbce` 隔离 debug APK 已原地更新，ACCOUNT_NATIVE/UI 均未设置，[3 项真机本地检查](android/d69-debug/README.md)通过：两条旧笔记完整 document/plainText 保留，真实账户页 signedOut/无 profile/error/同步关闭，真实 UI 新建笔记全文精确一致。未发 SignIn；此重启后的 signedOut 不代表先前登录成功或恢复。原应用和合成数据保留，owned forward/reverse/lease 清理已核对。 |
| Android 真实托管登录 | [hosted-live01](android/hosted-live01/README.md) 已执行一次真实凭据输入和提交，返回原生应用后权威状态为 `error/account_network`，无 profile、同步未启用；未证明原生回跳验证成功。没有自动重试。 |
| Android 公共端点诊断 | 同一次后续直接导航中，canonical Vercel `/healthz` 在 30 秒内无 HTTP 结果，Logto discovery 对照约 606 ms 返回 200。此前 opaque-origin fetch 均在 15 秒截止；直接导航排除了该方法的 CORS 歧义，但不能定位 DNS/TCP/TLS 或原生失败阶段。见 [原始诊断](android/hosted-live01/public-navigation03.json)。 |
| Android 路径复核 | [public-recheck04](android/public-recheck04/README.md) 再次重现 canonical health 30 秒无 HTTP、Logto discovery 约 708 ms 为 200；同时间段[主机独立检查](android/hosted-live01/host-public-recheck02.json)为 200/200/401。未发登录重试或修改网络配置。 |
| 历史净化 macOS 包 | 独立新历史 `59dea828` 的 opt-in 包和 `6906f10d` 的默认账户入口包均完成本地构建及独立实物复核。旧包保留各自身份，未运行 App。详见 [macOS 候选](macos/LATEST-CANDIDATE.md)。 |
| 当前同源双平台生产包 | `d69ffbce` 导出新 root `d7f3e2a9`，从两个独立副本完成 macOS arm64 production bundle 和 Android arm64 unsigned APK 的完整构建、正式 staging，构建后源码均 clean。两包对应相同 fingerprint，默认原生账户门控、无 debug fixture/测试 feature；各有 1,200 项 notices。见 [macOS](macos/LATEST-CANDIDATE.md)及 [Android](android/sourced69-production01/README.md)；[独立实物复核](publish/final-package-review/README.md)有限接受，无新增 P1/P2。这是本地构建与静态验证，未运行生产包或远程 Actions。 |

## macOS 候选与实际启动尝试

已另从干净主线 `ec4348c6` 构建不设置 ACCOUNT_NATIVE/UI 的 debug/e2e 候选，默认账户入口、实际嵌入身份和 24 项能力检查通过，二进制保留供后续真实双桌面验收。该候选尚未启动；本轮两次原生工具检查仍返回 Mac 锁定，未绕过可见性或 startup gate。详见 [最新 macOS 候选](macos/LATEST-CANDIDATE.md)。

后续已从干净主线 `ad18a872` 重新构建包含最新修复的 debug 候选，前端及原生构建均通过，二进制已保留。本次 Mac 仍锁定；新候选在一个独立根进行有界 ready 检查，页面为 hidden 且 startup=loading，45 秒后未进入可交互状态；只关闭本次持有进程，未继续第二端登录。身份、结果及边界见 [最新 macOS 候选](macos/LATEST-CANDIDATE.md)。下文保留旧候选的原始尝试记录。

候选源码 `c7b18541a6d86adcb6b7c755c6a4a96aaa5f8fc8`，静态前端源码 fingerprint `90e542d5a1dd28efbacfab85b84a160e181dd01fce7e5f6f5f83f9d12b212f1b`，512 个产品输入，构建时 Git 工作区干净。

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 VITE_NOTES_ACCOUNT_NATIVE=1 pnpm build
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-target CARGO_BUILD_JOBS=2 \
  CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 \
  cargo build --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e,tauri/custom-protocol --locked --offline
```

两项构建均通过。二进制 SHA256 为 `c651bb3e529f608c71554a9c386b1307f3a8d12553fc57aa9586d3185ac85ae4`。这是显式启用原生账户入口和既有 sync-e2e 驱动的 debug 测试候选，不是正式发布包。Vite build-info 的 `mode=production` 仅来自 build command，不能据此宣称前端 debug API 被排除。原生授权与同步走真实模块，未启用 JS IPC fixture。

已创建两个空的独立桌面数据根，避开默认用户库。第一次启动实际原生进程后，驱动在规定 45 秒内未收到可交互 ready，返回 TIMEOUT；没有继续第二端登录或发起授权。关闭阶段也返回 TIMEOUT，随后确认候选进程已退出，未留下后台进程。该尝试不判定为 AUTH-01 或其他真实用例通过。

同一时点原生桌面工具明确返回：Mac 已锁定且自动解锁失败。因此真实可见交互验收需要用户解锁；锁屏状态本身不是代码功能通过或失败的证据。独立网络探测当时还显示，正常主机解析访问 Logto discovery 为 200，但 canonical Vercel 域名 TLS 连接被本机网络路径重置。仅使用当前公共地址、canonical hostname 和正常 TLS 校验的独立 curl 探测成功；产品没有加入 IP pin、DNS 或 TLS 绕过。该网络路径随后已恢复，真实 Rust owner 以系统 DNS 和正常 TLS 连续三次访问部署 profile 成功，详见上述记录；桌面产品交互验收仍未完成。

候选构建之后若认证修复或许可闭包发生变化，需要记录更新后的源码身份并制作新候选，不把旧二进制记录套用到新源码。

## 独立审阅闭合与许可收拢

- 空 refresh token：`3bd36935` 拒绝把空字符串保存成 owner；初次授权回退撤销非空 access token，刷新保留旧的非空 refresh handle 并隔离无效响应，不交付新 access token。新增测试检查实际撤销表单、失败保留、重启清理及普通缺省 RT 继承。原审阅者 Tesla 已按原作者提交 `e15920c7` 与主线文件哈希重新静态复核，接受关闭；主线独立运行 18 项 fixture。静态复核没有被写成真实登录执行。
- 发布工具三项 P2：主线 `3273b739`／`efb10f8b` 逐段 NOFOLLOW 验证 notice 的路径和字节，ZIP 使用已验证 bytes；重新计算当前 source identity 并核对实际包内 raw/Brotli build-info；拒绝 stale stamp 的 dirty/count 不一致。原审阅者 Pauli 在对应作者提交 `15eea91a`／`38646405` 的精确快照运行 8 项定向测试，并独立复跑原 traversal/hash/symlink、旧包身份和 stale dirty 反例，接受三项关闭。该复核不包含新历史验收或真实包构建。
- SDK 许可：`69a9e336` 原样保留固定上游 `f2a3961536e5c69b13c7dbc661953d9243becbae` 的 1,139 个 SDK notice/license 文件，共 4,617,475 bytes。主线逐文件核对路径、长度、SHA256 和 Git blob 身份全部通过；完整来源清单见 `native/sdk-license-closure.json`。provider 和 SDK 自身许可分别保留，原始上游字节未格式化。
- 新增集成依赖许可：另从 Cargo.lock checksum 验证通过的 crates.io `.crate` 归档提取 oauth2 5.0.0、openidconnect 4.1.0、opener 2.7.3 和 deep-link 2.6.3 的 9 个原始许可文件。它们保留在独立的 `scripts/publish/notices/rust/`，来源和哈希见该目录 `NOTICE.provenance.json`；没有修改 SDK pin 或把外部依赖称为项目自有代码。该补充只覆盖明确列出的新增直接依赖，不宣称整个项目传递依赖法律审阅已完成。
- 后续真实准备发现并修复两项原生问题：`be930dfb` 在 bootstrap 的远端 proof 验证等待结束后，重新检查 gate/owner 代际再创建邀请，主线 3 项定向测试通过；`6537b74b` 对未启用同步的新资料库只返回零指标，避免首次读取账户状态访问不存在的同步表，主线 fresh-status 反例修复测试通过。两项均保留作者 red/green 证据，不能用旧候选二进制代替修复版本。
- `c74bfdf4`／`a717a58a` 收拢了 source snapshot `57d1d91f` 的显式清单及上游许可目录 `.github` 路径兼容修复。作者在独立新历史的本地准备导出中验证 1,769 文件、publish 15/15、1200 项 notices ZIP 逐字节匹配；独立审阅者 Plato 检查清单、Git blob、许可与路径负例，有限接受且无新增 P1/P2。这是该 snapshot 的源码准备，不包含后续两个原生修复与 live_smoke 文件；正式导出前仍须 refresh 并复验。
- `bda6b7de` 已更新至 source snapshot `ad18a872`：刷新 6 个既有哈希，显式增加 live_smoke 文件，未放宽路径或来源政策。独立新历史导出共 1,770 文件，publish 15/15、认证库 18 通过/1 忽略、示例 5 通过，及 notices 1,200 项字节检查通过；Pauli 独立复核源码、new-root 与许可边界后接受。后续完整 macOS 本地构建另行记录，不能覆盖初次 web 准备记录，也不代表已向 GitHub 发布。
- `2860372d` 仅刷新默认原生入口对应的 src/account-client.ts 哈希；当前主线 export dry-run 1,770 文件通过，debug/verification 工具和过程记录继续排除。新的 `6906f10d` 净化 root、publish 15/15、默认 production 门控 14 项及完整 macOS 包构建经作者验证，并由 Pauli 定向复核实际包和源码后接受。
- Android 内存传递测试 helper 修复了异常透传、确认后有效期复核及虚假 submitted 回执三项 P2；`a33e2e60` 仅报告 consumer-completed，真实提交及 Native 认证终态须独立观察。Plato 复核关闭，主线与共享 lifecycle 合计 24/24 离线测试通过。该结果不证明真实凭据输入或认证回跳通过。
- Android source5d30 实际 production build 退出 0，但 deep-link 生成器追加重复 Manifest 声明，正式 staging 正确拒绝 dirty source；[原失败](android/source5d30-baseline01/README.md)保留。`287d7153` 改为唯一一份固定生成块，已验证[字节幂等](android/manifest-idempotence/README.md)；`e5344b68` 仅排除精确 Kotlin session 缓存目录，手写平台源码继续参与身份。`45b4560f`／`df7babfe` 补齐实际 ELF、unsigned 与 framework ID 绑定的 compiled manifest 验证，独立审阅关闭原三项 P2。`d69ffbce` 刷新 7 个现有清单 pin，无新增或放宽来源政策。
- 新 root `d7f3e2a9` 的 Android 首轮构建因跨 source 复用 Tauri codegen 缓存而失败；仅在本轮独立 target 定向失效 tauri 包，正常生成后重试通过，未手工复制生成类或改产品源码。Mac 与 Android 新生产包身份均为 clean、1,619 个输入、fingerprint `3f3b76ebfe6c8a146cb35ffad5b4daeff2696c05612dc8846a55a2d450de2058`。历史包及失败尝试未被覆盖。

## 尚未执行或尚未完成

- macOS 产品内真实托管登录、双桌面账户自动发现和完整 document/plainText/附件原字节比对。最近可见启动尝试受 Mac 锁定限制；继续前须重新确认解锁和候选身份。
- Android 隔离账户测试包已尝试真实托管登录但失败；成功登录、原生回跳验收及三端同步尚未完成。继续前须确认手机可正常访问 canonical coordinator；当前证据未确定网络故障层级。原用户应用及旧 Sync108 合成测试包保持原地。
- 当前精确源码清单、新历史本地导出及双平台生产包均已完成，见上文 `d7f3e2a9`。远程 GitHub 发布和 Actions 实际包构建尚未执行；若后续产品源码调整，须刷新清单和重做对应验证。

验收操作与通过标准继续使用 [ACCOUNT-TEST-CASES.md](ACCOUNT-TEST-CASES.md)。原开发仓库没有被直接推送，未执行最终发布。
