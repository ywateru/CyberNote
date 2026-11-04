# Sidebar optical06 — author source-ready evidence

此候选仅修改 `plugins/tauri-plugin-notes-ui/macos/toolbar.m`，依据root已授权 `docs/plan/tasks/app-001-sidebar-optical06.md` 及 `docs/ui/macos.md` 06契约（包括最终普通Aqua色调补充）。原版依据为05真实运行JPEG/AX与独立分析；JPEG局部阈值不是原版内部frame或整窗像素认证。

## Fixed source

基线HEAD `093986d170ef279fbce0f66e59891fd5f94aecad`，保存的05 `baseline-toolbar.m` SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`。

最终toolbar SHA256 **`99a24b1ec902c16bb32fe9d2a5cc82887aec62424d9c00c690a464dbf66db46b`**。`product.patch` 固定完整差异。App仍 `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4`，CSS仍 `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`。

## Scoped behavior

- 沿现有cell contentOffsetFor绘制路径，newFolder内容(+1.5,-1)pt；可见toggle(+.75,-.25)pt。44pt可见槽宽、right anchor及overflow策略不变。
- 仅threeColumn/fullSize/hidden，sidebar组与按钮40pt宽、x=traffic+2=96；仍y8、高36、radius18。toggle内容(+.5,-.25)pt。标题保护间隔18使真实right136+18=154，保留原标题frame。
- 其他隐藏布局、非fullSize隐藏仍原36pt、原位置、offset0；每次layout显式赋offset，无累加，也不创建新button。
- sidebar仅两动作使用公开NSColor dynamicProvider；provider按传入appearance内解析label到sRGB。系统高对比开关为false且外观确为普通Aqua时用alpha.70；其他外观/高对比保留当前label RGB/alpha。toggle保留其原不因selected变黄规则；newFolder selected仍走原systemYellow，disabled仍由原NSButton enabled行为处理。其他动作tint不改。
- 背景/按钮/content/search、菜单/事件/revision逻辑及数据不变。无IPC/字段/状态副本/平台或依赖改动。

## Production geometry

`geometry04/` 执行准确production widthFor/layout，复用05记录端口（不是复制布局算法）。**401状态、122链通过**：原390/120矩阵包含三布局、700/1088/1394窗口、160/208/228/273侧栏、fullSize有无、隐藏恢复、181.999/182边界、独立窗和6条拖变链；再加同一controller跨布局/fullSize连续链，以及newFolder selected/侧栏disabled链。

仅21个目标hidden3/full状态的sidebar x/width相对05变化；标题、计数、搜索、其他group/overflow逐字段相同。其余状态的布局输出完全保留。新组无交通灯侵入或新增重叠，直接toggle永不进入overflow，前后恢复相同。旧700/273标题与view重叠6pt仍是同值范围外限制，在结果中单列。

## Actual AppKit

`appkit06/` 四套完整生产源binary：05基线、06玻璃、06强制fallback、06受控系统高对比属性true。每套**401状态/122链**，实际build/apply/layout/placeGroup及真实AppKit button/search/glass/visual effect运行，匹配记录端口；实际父视图不flipped，root y848独立核对，其他坐标匹配。

检查全部稳定button/content/group/root/title/count/search/background身份；背景显示、同级关系、精确frame/style；实际AX label、target/selector、selected/enabled和局部/根命中；绘制偏移翻转适配；每态额外5次layout确认偏移不累加。newFolder selected黄色保持、其他动作tint保持。两个sidebar tint在Aqua→Dark→请求HC_Aqua→请求HC_Dark→Aqua→Dark→Aqua往返解析，实际RGB随label，普通Aqua为.70，其余按实际外观/系统属性保留原alpha。

实际系统的HC请求会归一化：`appearanceNamed:HC_Aqua`对象实际name为Aqua，HC_Dark实际name为Dark（见tint-diagnostic-run.json）。不能声称真正HC外观已运行。第四套仅把公开NSWorkspace的accessibilityDisplayShouldIncreaseContrast属性受控为true，确认两个sidebar符号所有外观均保留label；没有切系统设置/GUI。fallback仅对NSGlassEffectView class resolver返回Nil，不是旧macOS实际运行。

未构造真实NSWindow；AppKit控件隐式初始化NSApplication，窗口数始终0。search currentEditor始终nil，因此不是IME/field editor/真实窗口焦点证明，没有真实菜单/事件/GUI验收。

## Tint measurements and preserved failures

`tint-colors.json`：普通Aqua label/controlText均黑、alpha216/255，白底算术合成39；secondary黑alpha127/255、白底128；text黑alpha1。Dark label/controlText白alpha216/255。换controlText无效，secondary太浅。alpha.70白底算术76.5接近原JPEG中位77–78，但不是实际按钮像素通过。

直接在Aqua创建 `[labelColor colorWithAlphaComponent:.70]` 再解析Dark仍为黑；公开dynamicProvider按appearance解析解决该问题。早期全外观.70实验仅用于研究，最终产品只普通Aqua.70，保留原Dark/系统高对比。无硬编码RGB灰77。原始tint-colors/provider/production/diagnostic fixtures与输出保留，production旧实验文件不代表最终产品。

原始失败保留：geometry01基线提取的unused offset函数被-Werror拒绝；appkit01所有实际控件运行成功后因geometry结果尚不存在而失败。appkit03/04四态断言发现HC请求归一化，保留候选修前源码、诊断和日志。appkit05全四binary运行成功，比较暴露跨mode记录端口未清理旧actionStates；修复端口以模拟实际apply每次清理，不改生产来迎合端口。geometry03旧跨mode输出保留，最终geometry04/appkit06一致通过。所有失败generated m/compile/run和脚本快照保留。

## Checks and limits

`strict-objc.json`：完整toolbar+format，ARC/blocks、min12、Wall/Wextra/Werror，exit0。

`native-toolbar.json`：现有13项控制器受控transport检查通过；`build.json` pnpm build exit0，保留既有chunk提示。检查前均>=2GiB。source-audit对开始tracked输入和05作者manifest做完整对照。root另维护INDEX、plan README及macOS契约三文档；初始只预期macOS文档变化的审计断言被保留，最终单列这些文档变化，不将其当产品漂移。

没有运行平台build/freeze、GUI/ADB/安装、共享target/cache操作、下载/升级/清理或stage/commit。作者证据固定后由native_ui_research独审，再由root提交与准确Mac新包、独立产物/真实窗口验证。Dark/高对比实际原版没有像素依据，所有候选仍不授予整窗像素PASS。
