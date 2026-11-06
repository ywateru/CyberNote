# APP92 Mac 系统备忘录复制导入交付

状态：Mac30 已生成，最终独立核包进行中。目标是 Mac 从系统自带备忘录复制导入，源笔记、目录、附件不修改；Android21 和原设备现场不变。

## 使用

入口为 **设置 → 数据 → 从 Apple 备忘录导入**。读取来源，核对账户/文件夹路径并选择笔记，点击复制，查看结果详情。新内容按本批次独立“来自 Apple 备忘录”层次保存；相同来源/内容跳过，变化内容创建新副本，保留原目标内容。[使用说明](../../apple-notes-import-usage.md)。

原始 HTML/元数据保留为笔记末尾的受管 JSON 文件附件，随数据统计/完整备份管理。附件原始字节独立文件保存，不存 SQLite，也不引用系统源路径。失败附件项目明确跳过；部分格式只保留在原始记录时明确提示。

## 本轮验证

| 层次 | 结果与证明范围 |
| --- | --- |
| 实际系统来源 → 隔离目标 | real02 自然0/43.027秒；导入1、重开、重复已有1，源前后采样字段相同；原目标构造基线/设置保留。原real01失败保留。见[real02](real02/README.md) |
| 段落修复 | 3个独立冻结例修复后全通过，旧代码对照全失败；显式空块/br、inline/pre/NBSP、原始字段保留。见[独立结构验证](independent-storage/README.md) |
| 最终实际 App DOM | 实际 React/Tiptap → 同生产 core → Session/SQLite/受管文件20通过，自然0/19.204秒；OS来源、窗口/对话框是合成边界，含预览/选择/结果、取消、媒体、原字节导出、备份恢复和恢复后去重。见[最终集成](final-integration/README.md) |
| 最终主线检查 | 相关 Rust28通过/真实来源1默认ignored，typecheck/Vite/生产调试排除/新精确lean均自然0；不同代理独核55lean输入、依赖源和505宽范围输入/DOM证据。见[最终独审](final-independent/README.md) |
| 保留真实内容离线回放 | 修复后精确binary，生产worker/converter/Session/Store83检查通过/1.412秒；手工完整文档六块/四br、所有正文/日期/raw字节精确，重开/重复/合成基线保持；无新Notes调用，原real02不写。见[离线回放](offline01/README.md) |
| Mac30构建 | 340动态产品输入对批准Git字节一致；编译自然0/30.999秒。原linker签名缺entitlement/strict1保留，postprocess同raw不重编；derived明确entitlement/Info一致且strict0，ZIP已生成。见[原构建](mac-build/result.json)、[派生收尾](mac-build-finalize02/result.json) |

私有源ID、标题、正文、原始文件和目标数据库仅留本机私有目录，仓库只存安全聚合/指纹。公开界面截图使用合成来源。转换/存储、真实来源读取、离线快照、App DOM与包身份分别记账。

## 包

`artifacts/import92/备忘录-Mac30.zip`，7,031,103字节，SHA-256：`6bb2553a9514a927685f13500a7ef6a87dc1c6eca13e17c561fb8936965a4655`。

批准产品输入为 `7a602cca`（最终产品修复 `a8bc2452`），实际构建入口记录主线 `845b3f21`；两者产品路径/字节相同。后续提交仅文档及打包驱动。新驱动显式提供源 `Entitlements.plist`，保留原bundle和失败输出，最终派生包严格签名通过；是本地 ARM64 ad-hoc 包，未公证，不宣称 Developer ID 分发。

## 保留的失败与限制

- 原real01来源worker失败、UI长取消原反例、转换段落原缺陷和独立旧代码对照均保留；修复后的独立结果不会追改原运行。
- 离线首preflight因测试脚本错误假定附件后缀停止，未spawn后端/写Store；修正两个路径guard并独审后通过。原始Notes内容未再次读取。
- 原Mac构建已成功，但打包驱动首轮错误要求linker临时签名含entitlement而停止；该失败及原raw保留。只修正driver后的新阶段复用同编译原包/前端，要求最终派生包实际entitlement精确和strict0。
- 本机真实三个Notes附件导出返回-10000、无文件；不能判断对象类型/云端状态或权限原因。真实图片、音频、PDF、复杂对象导出及原生清单/表格保真尚无成功证明；合成转换/存储通过不代替这些能力。缺附件笔记明确跳过。
- 最终包自动化用途文字和签名声明检查不等于每台Mac的TCC授权或打包App实际Apple Events运行；没有进行新授权/真实麦克风/原版像素或Android设备验收。
