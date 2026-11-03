# Mac 搜索零结果局部文字：源码候选01

2026-11-04。状态：开发源码候选冻结，等待独立审查；原生新包、AppKit真实坐标与像素验收仍为 **UNKNOWN**。

基线 `87e538c4577483c8756aa49445f47b24badd98ff`；开发分支 `task/app-001-search-zero-geometry-01`。最终提交由分支HEAD和交接消息给出，产品身份不依赖本报告自身的提交循环。两个产品文件及各自SHA-256在 `source-manifest.json`，聚合为 `c421f6b874e1aff7b8096fa0eedb04b32278702f85cc7f8421e968e1a0a5528e`，格式为排序后的 `<sha256>  <path>\n` 的SHA-256。

## 变化与边界

`toolbar.m` 仅最终文字frame区域变化。已核对 `NotesUIRoot.isFlipped=YES`，子frame的y向下，root仍依父contentView方向锚定顶部52pt。仅 `threeColumn && sidebarVisible` 并满足原有已确认零态 `folderTitle=搜索 && folderCount=0 && hasSearch && search.value非空` 时，标题从 `(titleX,9)` 改为 `(titleX-1,11)`，辅助标题从 `(titleX,28)` 改为 `(titleX-1,27)`。原titleX、titleWidth、hidden阈值、工具组排布与原生字体均保持。本轮只是按照保存截图的局部差量生成候选，没有运行AppKit，不能把frame推导当作真实ink坐标。

`style.css` 增加专用守卫 `.desktop.native-toolbar:not(.sidebar-hidden):not(.gallery-browse):not(.gallery-edit):not(.separate) .search-zero-section`：padding-top由10px变9px，系统字重由600变700作为待校准候选。分组高度40px、左右16px、line-height20px及0.5px分隔线保持，文字上移而分隔线不移。没有改App零态门禁、状态协议、搜索焦点、菜单、Editor、保存、窗口/分栏默认值、共享字体或强调色资源。

`protected-boundaries.json` 保存49个文件的基线/候选相同hash，包括App、工具栏状态/控制器/桥、搜索选择/Editor门禁、可信同步、Editor、录音、OCR、原生lib/媒体权限/配置、插件model/桥/格式菜单、依赖锁及旧测量/两张原图。源manifest也记录产品文件共同前缀/后缀的字节范围与hash，独审仍须阅读实际最小diff，不把hash清单替代代码审查。

## 实际执行结果

| 检查 | 结果 | 原始结果 |
| --- | --- | --- |
| `pnpm typecheck` | exit0 | raw-typecheck.json |
| 原App展示AST与真实toolbar投影 | 16/16 | raw-search-zero-ui.json |
| 原App启动effect/真实TrustedSynchronization | 5/5 | raw-search-zero-startup.json |
| 原搜索选择/Editor停放 | 7/7 | raw-search-selection.json |
| 原工具栏控制器/真实投影 | 13/13 | raw-native-toolbar.json |
| `pnpm build` | exit0 | raw-build.json |
| 真实CSS基线/候选差量边界 | 8/8 | diagnostic.json、raw-browser-diagnostic.json |

前端构建仅生成本worktree的dist，保留原始大chunk提示；没有native构建或新安装包，也没有使用共享target。41组原检查均复用现有脚本，没有添加断言CSS常量或frame常量的镜像测试。

浏览器诊断使用本机已有Chrome `156.0.8078.80`、1088×660逻辑viewport、DPR2。`render-section.mjs` 读取基线/候选完整生产CSS和App中原样零分组JSX，在三栏fixture渲染。它检查目标分组只改变字体及顶部内边距（含浏览器返回的padding-block-start别名），而元素rect与可见性不变；隐藏侧栏、无原生顶部回退、手机fixture、画廊浏览、画廊编辑、独立窗、普通日期组的全部计算样式及rect与基线相同。这些刻意注入的组合用于检验CSS守卫，并不声称App真实渲染这些零态。首轮诊断因未列入同一padding的逻辑别名而退出1，仅修正诊断allowlist，保留摘要 `diagnostic-attempt-01.json`；产品源码未因该失败变化。

## 字重诊断与未关闭差距

保存 `baseline-600.png`、`candidate-600/650/700.png` 为不缩放的558×80px专用分组截图；另外从旧截图各截同一 `[456,104,1014,184)` 区域保存 `original-reference-section.png`、`candidate03-reference-section.png`。后两图整窗尺寸不同，不能作整窗或等宽控件对。局部前景计算在 `[20,4,160,72)` 内按 `min(R,G,B)<128/160/180/200`，数据在 `typography-measurements.json`。

160阈值结果：原版1260像素、旧candidate03为990、本机Chrome baseline为1103；Chrome的600/650/700候选均为1103且截图SHA-256相同。Chrome基线文字边界为 `[34,27,120,55)`，9px padding后均为 `[34,25,120,53)`；相对实际旧WK候选仍有不同的字体/光栅边界。这里只证明本机Chrome下1px padding产生2物理像素上移，**没有证据证明700比600/650更接近原版笔画**。700保留为语义上更粗的有限系统候选；确切字体族、真实WKWebView的字重映射与原版笔画差距待新包同条件校准。

原版/candidate03的旧文字测量原图和报告保持原样，没有以CSS数值、源码推导、Chrome截图或功能通过宣布像素成功。标题两行的实际新ink位置、分组字形、AppKit隐藏侧栏/非零/画廊的运行态、搜索焦点蓝/金与完整窗口仍未验。后续由root串行统一包，独立取得同窗口逻辑尺寸、分栏、主题、系统比例、激活/焦点、查询/滚动位置的PNG、叠图和原值差分，再判定局部/全局结果。

## 重现

在此源码基线上提供既有依赖后运行现有五项命令/脚本及 `pnpm build`。诊断运行 `node docs/verification/app-001-search-zero-geometry-01/source-candidate-01/render-section.mjs`，使用脚本记录的本机Chrome/Playwright路径；没有下载依赖。生成source/protected身份用同目录 `freeze-source.py`。测量JSON为保留的实际PNG计算结果，输入路径、SHA、ROI、阈值均已记录。开发依赖链接与本轮Chrome进程在交接前移除/退出，不自合并，由独立worktree审查冻结提交。
