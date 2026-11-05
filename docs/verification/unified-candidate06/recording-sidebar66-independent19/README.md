# Mac19 recording sidebar66 独立只读核验

结论：**PASS（冻结输入与包身份核验）**。本目录只包含独立读取证据；没有修改产品、冻结输入、构建/封装记录、旧失败证据或应用现场。没有启动应用、构建、签名、操作界面/设备、变更权限，亦未读取、复制、导出或转写录音数据。该结论不代表运行时、音频保存、听感、WebKit 或像素验收通过。

## 绑定的源码与证据

- 精确构建源：`7c1a3e424ff0cb7343cab14559efb2a92b79140b`。两次独立审计观察到的 root HEAD 均为此提交。
- 上次独立测试产品：`f4a2fba7b5d1fda854b3bc802a629a6e1045c7f4`，其 271 项绑定输入与本次源逐字节一致。既有 17 组真实挂载 App 测试及 5 组生产 native-core 测试没有重跑；本次没有新增功能测试。
- 冻结文件：`../mac-recording-sidebar-build19/input-freeze.json`，349550 bytes，SHA-256 `b9c27e759213dd31b9ed843fd4676aa9bcb6247e76478a1f29f10e2ebe956deb`。
- 产品 358 项、完整输入 379 项；产品 aggregate `6bd522cd54a6247000cf8f3ec5b7907023fcb0438ccae347882e430bfa5f0469`，完整输入 aggregate `b160802ef3d41e33ec42d24ecca5bcc744ee5ccc48b1469d0feca640f9bb55f1`。
- 九字段授权文件：`../recording-sidebar66-preparation/mac-authorization.json`，39238 bytes，SHA-256 `b63d88fba927d3fa09ee4b822d87963f1327d4491202480c21ff75ce4aaba6be`。

`audit-freeze.py` 与 `freeze-readonly-result.json` 证明：独立重建的完整产品集合吻合，358 项均受 Git 跟踪且等于精确源 Git 对象，77 个插件文件均冻结；精确 2 个旧子窗口 capability 删除，7 项新增脚本和 21 项历史输入保留；7 个构建工具、已记录的 5 个工具版本观察、离线/jobs2 环境、2 个 overlay、701 项 Gradle 分发内容及 25 项缓存 OCR 模型均与冻结数据一致。主窗口及 note-* 原有 `notes-ui:allow-recording-access` 保留，没有缺失权限或新增授权。

## 构建尝试边界

| 尝试 | 独立确认的状态 |
|---|---|
| attempt01，nonce `ba3d3aa1909b49da8f4b06e6504f0963` | `PermissionError(1, 'Operation not permitted')`，exitCode null，无 ownedProcessGroup、build.txt、generated-outputs 或 collection。与冻结一致的前后输入快照完整。预启动的 `/bin/ps` 失败由原记录及启动代码定位，本次没有运行该命令。 |
| attempt01 prior-outputs | application 与 dist 均保留。每一文件字节/哈希/模式、每一目录模式及根 inode/device 均等于重命名前记录。旧 app executable SHA-256 `48ebb74066414c1affdf1e0077ab5a5f51cc3b899c1f11670a9a298769be4887` 与新包不同。此路径仅为此前磁盘构建输出，不是受保护的旧 Mac18 录音现场。 |
| attempt02，nonce `2cc45d3198634e1c88de9d4baa75fd82` | 唯一成功的 `pnpm mac:build`，exitCode 0，拥有的进程组 61981 已停止且无剩余成员。开始前固定输出路径为空，prior before=null，preserved 路径不存在；构建后 app 与 dist 清单均准确吻合。 |

成功构建前后及收集前后共 4 个输入快照，除时间外所有字段逐项等于冻结文件；失败 01 的 2 个输入快照亦通过。构建结果与收集记录的源、freeze SHA、aggregate、nonce、构建结果文件字节/哈希完全一致。`retry-start-attempt02.json` 引用的失败结果与隔离清单身份准确。

## 包与签名

收集目录：`artifacts/unified-candidate06/mac-recording-sidebar-build19/mac-attempt02/`。

| 文件 | bytes | SHA-256 |
|---|---:|---|
| mac-original.zip | 5076404 | `249f9bd2840ecc6b6aab64491b8ac6b25a078a06c72bcadeb60a7256be907bd5` |
| mac-sealed.zip | 5001625 | `9ad9dba1a244e470b1f91b3bc1226ae474c41fc8dbe06783cf66b978213fab43` |
| original executable | 16804912 | `42e3ce9898b6715efe53053e77128c2397f0ac4aa1e339af78e850c1993ab5a3` |
| sealed executable | 16725344 | `efaaf7239cc6d84da11779b600e38e43739df72602ff85fed3f7ffa6e3420b9d` |

`audit-package.py` 独立读取原始与封装 app 的完整文件树及 ZIP 全部文件条目；不允许重复条目，额外文件仅允许 `__MACOSX/`。原始 app 2 个文件、封装 app 3 个文件与收集清单逐项一致；ZIP 中 6/9 个文件条目均核查。构建源 app 与保留原始 app 一致，生成输出记录与当前 app/dist 一致。13 条收集命令的日志逐字等于结果中记录的 stdout。

只有收集器第 08 条命令对派生 sealed 副本执行一次既定 ad-hoc 签名。封装变更仅限 executable 签名区域与新增 `Contents/_CodeSignature/CodeResources`；37 个 Mach-O section 的名称、长度、零填充属性及实际内容哈希在原始/封装间完全一致。

本次独立执行 8 个只读 codesign 命令，分别保留 stdout/stderr：

- original display / entitlements / requirements 均 exit 0；原始 linker ad-hoc CDHash `4f1f42c4468a52fb990dca6e90b235d3c5472670`。
- original strict exit 1，准确复现 `code has no resources but signature indicates they must be present`，原始失败被保留。
- sealed display / entitlements / requirements / strict 均 exit 0。Identifier `com.local.notesclone`，CDHash `106252e7f2fff69ad2b389e7d4b0ac2fb2665f16`，Signature ad-hoc，TeamIdentifier 未设置。
- 独立审计前后 app 完整树、ZIP 身份及全部 379 项冻结输入均未变化。

这只证明本地 ad-hoc 严格核验通过；不声称 Developer ID、公证、全部系统/SDK/传递依赖的可复现构建、运行时或像素一致性。主任务另行进行 Mac19 运行验收，旧 Mac18 与 Android 未保存录音现场未被本审计触碰。

## 审计自身的尝试

`audit-package-attempt01.py` 首轮审计适配器把历史 source-binding 行误当作含 bytes 字段，因 `KeyError: 'bytes'` 退出。失败发生在只读源码身份核对阶段，未进入签名读取，未产生包变更。原适配器和 stdout/stderr 原样保留。修正为匹配历史绑定实际 schema（path/sha256），第二次审计完整 PASS；此前冻结审计的长度核对仍覆盖全部 379 项输入。

`evidence-index.json` 对本目录全部证据（除索引自身）记录 bytes 与 SHA-256。`package-readonly-result.json` 另记录全部被读取的上游证据身份、完整 Mach-O sections 和归档条目核验，便于独立复查。
