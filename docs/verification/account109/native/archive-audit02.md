# 本轮未跟踪归档有限只读审计 02

2026-11-13 05:59:25 UTC。**完整性通过；未发现阻塞性的结果矛盾或真实凭证/运行时账户身份泄露。公开元数据例外见下文，不能称为“零 IP 字面量”。** 仅检查所列归档，不重跑任何测试、网络、ADB/App 或 sealed-root 检查；唯一写入为本报告，未提交。

| 目录 | 自带 SHA256SUMS |
| --- | --- |
| `android/current-access02` | 7/7 |
| `android/coordinator-route-class01` | 3/3 |
| `native/gui-access02` | 2/2 |
| `native/gui-candidate-equivalence01` | 2/2 |
| `native/coordinator-alias-review01` | 9/9 |
| `native/relogin-live01` | 10/10 |
| `publish/recovery-relay-prepared01` | 24/24 |
| `server/custom-domain-proposal01` | 4/4 |

合计 **61/61 hash 匹配**；8 个目录没有缺失、漏列、重复条目或 symlink。加 3 份 standalone 审阅文档共 **72 个既有文件**，均可普通 Git 收录。Standalone 文档不自带 SHA，当前身份记录于文末。

来源与结果边界一致：手机当前 health 失败/host 200 与随后 public IPv4/IPv6 Trying、connect 错误文本映射 ETIMEDOUT 相容，未声称确定 NAT/DNS/auth 根因或 app UID 路径。GUI PASS 仅新空 store readiness；relogin01 则 baseline agreement PASS、两 GUI ready 后 B restore 报 identityRefresh 错误，被 username assertion 遮蔽为 CHECK_FAILED，尚无 SignIn/编辑/enable，两个 recorded natural exits 均 0 无信号。Runner review01 是执行器批准；review02 仅批准 fail-closed 修正，不批准旧候选进行 B recovery；auth-recovery-static01 明确是初步静态建议。无互相替代的成功声明。

GUI equivalence 的 17 组 Git object 记录已复核，结论仅针对其比较 revision `86cf971f` 的旧正常 GUI 分支，不能泛化为后续 auth 修复的新构建。Alias 的 3 个源码 hash、relogin 的 6 份 committed 工具精确字节，以及域名提案的 21 个源码 hash 均匹配各自固定提交。Alias APPROVE 仅本地固定 transport/issuer 分离，production 值未切换；较早域名提案仍是未应用草案，不构成后续部署、网络恢复或实现批准。

发布归档固定 source 为 `86cf971f`，1,771 files / 95,195,176 bytes；与 `ec4147b6` exported payload 等价，19 项测试只是引用既有证据。其 draft 状态、旧 roots 前后记录相同、initial/final seal 相同均内部一致；本次未触碰实际 sealed roots。该旧导出不包含随后 alias/auth 修复，更非最终验收。

隐私检查：未发现 SQLite/binary payload、真实 grant/token/JWT/private-key/认证头值、运行时 profile/subject/username 或手机实际 IP；JSON 无实际认证值字段，安全回执保留布尔/数量/有限标签。工具源码固有合成 fixture、loopback 和地址分类网段属允许常量。设备序列号、owned PID、私有 tmp 路径为内部过程元数据，不是账户身份。

**需保留的明确例外：** `server/custom-domain-proposal01/metadata.json:49` 与 `README.md:19` 含同一个公开 Vercel 推荐 IPv4 字面量，不是手机实际解析/尝试地址；metadata 的 production alias 列表另有一个带账号/项目命名后缀的公开部署 alias。二者不含登录凭据，也不证明 DNS 所有权或实际可达性，但并非完全匿名元数据。未在本报告重复其值，未自行修改原归档或重算其 seal；若后续要求连公开推荐 IP/命名后缀也一律删除，应由 parent 单独脱敏并同步原目录 SHA。

内部证据不进 export 的边界已核对：归档的 source-payload inventory 和其 committed manifest 均不含 `docs/` 或 `scripts/verification/`。这只证明该固定导出，未来 export 仍须保持相同排除边界。此次有限检查不是对所有潜在秘密的形式化证明。

Standalone 文档当前 SHA-256：

- `relogin-review01.md`：`de9564a3d355431689cb064e57b8cad674990cb8c95e92183ce2a99b5ce4acc9`
- `relogin-review02.md`：`4d0551112a41f27bbeb3de9ccf6465b10e2b1d6dfe82e45e051367b03d28209c`
- `auth-recovery-static01.md`：`e525373fca6ec0d57190cc6ebeeea5b519b292f9404d4bb640d4aa36af6a7775`
