# task45 独立源代码与固定量图审查

结论：**PASS / SOURCE-READY / READY STOP**，仅适用于固定源代码及有限的声明映射证据。没有发现阻塞此三行 CSS 候选集成的源问题。实际 Mac14 活动选区绘制、自然字形、选区底色、完整像素和全部交互验收继续开放。

## 固定身份与范围

- 基线：`f2bc755f854938c3d6bdcf8e1f6f40fa200de0f5`。
- 唯一产品提交：`93d33f692cc3022d14dfe564db7ef460369619ff`。
- 封存作者证据 HEAD：`7675323329cd0e865b532999e66e83b0471d082c`。
- 只读审查该固定隔离树；仅写本报告与 `docs/verification/mac-ordinary-selection-ink45-independent/`。未改产品、Git、用户应用、GUI、数据库、共享依赖或缓存，未下载、构建正式包或读取 changing42 树。
- 阅读 task45、Mac UI 约定和 readiness44，并沿用 docs-sprint 的不同作者审查流程。父任务明确授权有限源码与原数据核查，未授权本轮打包。

## Findings

没有 blocking finding。

以下是任务已有验收边界，不是新发现的产品缺陷，也不授实际包 PASS：

1. **运行验收待办，非源阶段阻塞。** task45 的活动选择要求与 `src/smart-folders.css:535` 对应。作者真实隐藏 WK 的 `candidate-actual-all` 中，DOM activeElement 和 `[0,5]` 选择成立，但 `documentFocus=false`、`:focus=false`、选区背景透明，不能证明活动应用实际绘制。其后全选/部分选择明确将生产 `:focus` 声明映射到同一真实 input 的测试 class。记录、报告与结果均披露这一边界，没有将映射称为实际包验收。独审只重新分析固定图像，没有重新运行 WK 或改变宿主矩阵。
2. **视觉残差待办，非源阶段阻塞。** readiness44 与 task45 要求同时披露不利阈值。候选 sRGB160 mask XOR 从192增至196；raw160阈值右缘由268扩大到269。作者完整保留这些结果，未以 MAE 降低、覆盖增加或外包变化推断字形相同。自然差、底色差与整体像素继续开放。

## 源代码结论

Git base→product 仅改变 `src/smart-folders.css`。候选减去准确三行后逐字节等于基线 CSS；作者 baseline CSS 与 Git base blob 相同，source.patch 与准确 Git diff 相同。308 个跟踪产品输入逐一独立计算 Git blob SHA-1，与固定 product 提交对象匹配。未修改依赖、锁文件、键盘事件、37 的原生导航或42输入实现。

新增 selector 为 `:root:not(.dark) .smart-mac .smart-ordinary .smart-name input:focus::selection`，只写 `color: #000`。现有 selection 背景 `#fceac1`、原规则深灰 `#202020`、13px/400/auto、布局和事件保持。生产组件 `src/SmartFolderForm.tsx:371` 仅在 `!mobile && !folder && !draft.smart` 时赋予 ordinary class，排除手机、编辑和智能模式。`src/App.tsx:981` 起按主题与系统外观维护 documentElement 的 dark class，浅深边界与此 selector 一致。焦点条件仍为真实 CSS `:focus`，自然未选文字没有新增规则。

作者 fixture 导入准确生产 SmartFolderForm 及其依赖，HTML 逐字节包含完整生产 style.css 和准确旧/新 smart-folders.css，JS bundle 与封存内容一致。1575 项实际 bundle 输入逐项重核字节数和 SHA-256。作者12项有限 computed/rect/selection/合成 Escape 结果已核对；没有把它们描述为独审新执行的12个运行测试。

## 独立量图复核

独审没有执行作者的 measure.py。自有脚本从原 JPEG 字节重新解码，逐文件取原 ICC 独立转换 sRGB，核对44的四组 raw/sRGB 派生像素完全一致。WK 六张原 PNG 均为2176×1320、sRGB chunk0；仅按固定整数框 `[688,453,1488,867)` 裁切800×414，不配准、移动字形或缩放量图。作者六张派生表单也逐 RGB 匹配。

以固定 ROI 独立复算名称与两个标签的100/160/200阈值覆盖、外包、raw/sRGB的完整 ROI MAE、glyph union MAE、mask XOR、无字色条，以及完整表单差分，均与作者原数值相同。固定720核心坐标由原版/准确Mac13四图共同 rawRGB<80 条件重新生成，没有拟合新位置。

| 固定全选名称指标 | 基线 | 候选 | 独审含义 |
| --- | ---: | ---: | --- |
| 核心 sRGB 中值 | (32,32,32) | (0,0,0) | 原版参考(10,1,0)，选中明暗方向更近 |
| sRGB完整 ROI MAE | 12.1362737236 | 9.3780807271 | 降低，非零残差仍在 |
| sRGB glyph union MAE | 41.1191450659 | 29.1954022989 | 降低，不能等同轮廓通过 |
| raw100/160/200 mask XOR | 238/200/231 | 183/198/201 | 三阈值均原样保留 |
| sRGB100/160/200 mask XOR | 230/192/229 | 191/196/207 | 160阈值恶化4个像素 |
| raw160覆盖 | 1181 | 1215 | 原版1229，数量更近不能证明形状相同 |
| raw160外包 | [142,125,268,149) | [142,125,269,149) | 阈值右缘扩大1px，外部布局未改 |
| 无字选区色条 sRGB 中值 | (251,233,193) | (251,233,193) | 逐 RGB 不变，不关闭实际Mac13背景残差 |

完整表单全选差分1635像素，bbox `[141,124,269,149)`；部分选择差分600像素，bbox `[219,124,269,149)`，只覆盖最后两字。两种状态的名称 ROI 外、两个标签及无字色条均逐 RGB 零差。没有原版同态部分选择像素参考，故不授部分选择原版一致。

自然态完整800×414表单旧新逐 RGB 相同。名称 raw mask XOR 194/193/216，sRGB整 ROI MAE 8.9030133473 均保持。此次隐藏 WK 的193不能替换准确Mac13 JPEG自然192；捕获路径不同，自然原因 unknown 仍在。已目视作者最近邻2倍对比图，黑字组合明暗方向合理，未将放大图用作量图输入或完整像素结论。

## 身份、完整性与失败保全

- 独立断言 **2486/2486 通过**，大部分为明确列出的输入/证据身份，不能等同2486个新运行用例。
- 作者索引 **69/69** 成员及 readiness44 **20/20** 成员重核字节数与 SHA-256；作者 index SHA `bddc4ad992bc8e718d6ab71f03d2c03e29f0280d227b09eb2084d836dd964b9e`、result SHA `1bcfc1888f553499b3a7d03d5c3660a2d9e5820258c907576e87148bae1fca9b` 与授权值一致。
- 本轮 **1983/1983** 受保护输入记录在复核前后字节数、SHA-256、mtime 全部不变，包含产品、作者证据、原图与实际 bundle 输入。
- 原始真实非活动WK尝试、两次输入 freeze 失败、隔离夹具错误期望及修正记录均保留；已确认失败 isolation.json 含失败项，最终一次12项通过。没有改生产行为来迎合夹具。独审脚本首次运行即2486项通过，无独审失败或重试。

## 停止与后续

建议 root 按固定 product 和封存证据集成后，再在准确 Mac14 中使用活动全选、部分选择、自然态与原版同态图验收。真实键盘、IME、Option-Tab 与42历史语义由各自任务处理；此 CSS 审查不关闭这些目标。此次未执行无关 typecheck、整轮旧测试、宿主矩阵或完整平台构建。**SOURCE-READY / READY STOP**。
