# APP-001-SEARCH-ZERO-UI-01：开发源码候选 01

2026-11-04，隔离工作树 `/private/tmp/apple-notes-search-zero-ui-01`，基线 `7ef7975c26021051dd1041b40eb8af570b88bd84`（已含附件前端和录音 state 合入）。此候选等待独立源审；没有原生编译、统一包、GUI、设备或新像素结果。

## 已实现展示

```text
当前桌面主窗、view=list、非空查询
  且 loading=false、同步未进行/失败、无授权遮挡或operation、实际listed=0
      原生标题/浏览器回退：搜索
      原生辅助文字/浏览器回退：无结果
      列表起始：备忘录
                ───────────（整列分隔线）
      列表无note行、无中央“未找到备忘录”
```

`desktopSearchZero` 是纯展示谓词，不参与 `listed` 过滤、`projectSearchNote`、noteId、Editor gate、保存或动作目标。App 为该状态生成 `listTitle=搜索`、`listSubtitle=无结果`，原生投影继续发送原有 `folderTitle`、数字 `folderCount`、`search.value`。没有新增协议字段或改类型/校验。

原生 `toolbar.m` 只将辅助文字改为条件呈现：`folderTitle=搜索 && folderCount=0 && hasSearch && search.value非空` 时为“无结果”，否则仍用原数字计数。标题和辅助文字的可访问 label 仍来自实际显示字符串。App 仅已确认列表零态发送该标题信号；loading/同步失败/授权遮挡/画廊时发送原“搜索结果”。普通空文件夹恰好名为“搜索”时 query 为空，原生分支不会误判。原搜索 ACK/组字门禁在该文字逻辑前面保持原样。

App 列表在该谓词成立时单独渲染文本“备忘录”及 CSS 横线，不进入原中央空提示。手机、独立窗、画廊、普通空文件夹、filter-only、唯一/多结果、清空查询均保持各自原展示。这里只调整已获原图的三栏列表；画廊零态未经补证不扩展（经root明确并同步任务契约）。原生 title/count 字体与 frame 本轮未改。

## 有限原图测量

源为已有 `unified-fabafcf-independent-02/mac/pixels-zero/list-common-original.png`；原始窗口为1392×903逻辑点，裁剪列 x=228..508，背板倍率2。AX 原文确认“搜索 无结果”及列表文本“备忘录”。[original-measurement.json](original-measurement.json) 保存原图/AX的大小与 SHA256、阈值与半开墨迹边界，未遮盖或对齐图片。

| 原图局部 | 实测逻辑点（从既有列表crop起算） | 本候选处理 |
| --- | --- | --- |
| 标题墨迹 | x20.5..44.5，y13.5..25.5 | 仅改文字，保留既有原生字体/frame |
| 副标题墨迹 | x20.5..52，y29.5..39 | 同上 |
| “备忘录”墨迹 | x16.5..59.5，y65..79 | 独立 `.search-zero-section`，水平padding16、顶部padding10、font15/600、line20 |
| 分隔线中心样本 | raw y182为241灰、183为221灰，即91..92逻辑点 | native预留52后采用section高40、底边0.5px |

墨迹不能反推出精确字体元数据或 line box。上述 CSS 为有限校准起点，未声称已经渲染到同像素；没有据旧不同高度截图估算中央提示的绝对位移。该独立选择器不改日期组或录音样式。

## 已运行检查与保护边界

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| `pnpm typecheck` | exit0 | 最终源码 |
| `node scripts/check-search-zero-ui.mjs` | 14组通过 | AST抽取实际App展示声明、header、list条件与真实toolbar投影，React静态渲染；含真名“搜索”空文件夹、loading、同步/失败、授权/operation、手机/独立/画廊、唯一/多结果、clear/filter |
| `node scripts/check-search-selection.mjs` | 原7组通过 | 生产F07投影/gate、真实Tiptap/PM文档与Undo/Redo |
| `node scripts/check-native-toolbar.mjs` | 原12组通过 | 生产controller的ACK/合并/窗口/绑定/revision/组字/生命周期与状态投影 |
| Prettier定向检查、`git diff --check` | exit0 | App与新增脚本格式及差异 |
| [boundaries-manifest.json](boundaries-manifest.json) | 24文件与基线相同 | Editor、bridge、附件/授权/同步、F07、controller/state、录音组件/样式/会话、宿主、插件Rust、依赖 |
| [protected-bodies.json](protected-bodies.json) | 15片段与基线逐字相同 | App过滤/选笔记、saveDoc/恢复、附件capture/validate/submit/retry/cancel、完整RecordingPanel props；ObjC focus body与C入口 |

新脚本的非零结果行是受控渲染边界：只验证走原结果分支，没有重测实际整行UI。脚本不执行AppKit；原生辅助文字条件只做源码审查，未编译/运行此ObjC改动。没有使用Rust target或运行无关存储/媒体矩阵。临时依赖链接会在冻结前移除。

## 冻结与下一步

[source-manifest.json](source-manifest.json) 包含3项产品源码和1项定向脚本，aggregate `2881c002bb9e0e7d8e15ad1e910847184f398a46e65ab2fdeeaab415729af8fa`，算法在清单中明确。产品精确差异见 [product.diff.patch](product.diff.patch)。`evidence-manifest.json` 对本目录其他11项证据给出hash，不包含自身。

独立源审后进入下一统一Mac包，再做真实唯一→零→clear，确认标题/分组/中央提示、停放/恢复与完整正文身份。像素复采先统一窗口大小、分栏、屏幕位置、主题、语言和焦点，保存原图、逻辑映射、叠图与未改原值差异。旧两窗尺寸不同及既有pixel FAIL保持，顶部蓝/金焦点、快捷键立即粘贴异常、完整页面/原版一致都不由本源码候选关闭。
