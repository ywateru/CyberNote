# 普通Mac名称输入与焦点26独立复核

结论：**PASS（源码准备及有限组件验证）/ READY STOP**。没有发现阻止固定源码并进入准确包阶段的产品缺陷。真实Mac12的激活/失焦重激活绘制、取消卸载和侧栏回归仍是后续门槛，未授整体UI或跨端像素PASS。

## 实现范围

对任务26、UI文档末尾26、作者封存基线和当前产品逐字节核对。当前 `src/smart-folders.css` SHA256为 `cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c`；以已接受的基线 `f18dfeb0b6c9d52d66b4d4ad78016bd234c2763b38ae9ba0f09a4b7410881186` 重建允许变化，结果与当前文件完全相同：普通Mac名称padding-inline、该input的focus/selection、制作智能label的gap。没有额外声明变化；整体表单/按钮/表面20等规则保持。

`src/SmartFolderForm.tsx` 哈希仍为 `b2e4d60e5cbe0265b1bca7a67cd5c2d7412b3697e34152d870c0d0344770c15c`。真实受控input、autoFocus、onFocus.select、onChange、复选框和取消事件均未修改。组件仅在 `!mobile && !folder && !draft.smart` 时赋予ordinary类，因此新增选择色和焦点不套到手机/智能创建/编辑。未用叠字、图片或假输入替代编辑控件。父代理同时开展手机28，App不是本次受保护输入或差异归因依据；style.css由root明确固定至本次STOP。

## 独立验证

- 81项身份核对通过：作者索引43条、Safari预览10条、原版记录9条及各自索引和16项作者源/参考输入。开始/结束去重82项受保护输入的字节数和SHA256保持相同。来源中的固定HEAD是作者/根已封存身份，本审阅不读取Git对象、提交或构建新平台包。
- 新目录中重新生成实际生产React组件、完整style.css和候选smart-folders.css页面；Vite使用专用新cache路径且未生成cache。复用已审只读nonPersistent WK工具做一次成功受控运行，14项有限检查全部通过，JS错误和资源请求均为空；不重复作者全部23项测试。
- 新增独立实际 `setSelectionRange`/`setRangeText` 部分替换“建文”→“验收”，受控名称“新验收件夹”跨普通→智能→普通保持。首次默认全选、blur/refocus全选、checkbox语义及Escape仅取消回调不提交均通过。fixture保留表单，不能当App卸载证明。
- 普通表单及其全部后代外部rect修前修后完全相同；智能创建、既有置顶false智能编辑和深色手机的全部元素computed styles与基线一致。280px受控宽、180px高下长名scrollLeft2955，面板scrollWidth/clientWidth均238；深色文字rgb238与底rgb44保持区分。作者封存23项另外覆盖390/280空名错误及footer滚入视口、浅深手机/编辑隔离；只读接受其准确范围。
- 在本次新生成的非诊断截图，以实际面板几何得到crop `[688,453,1488,867)`，原尺度800×414；同一maxRGB<160区域独立测得名称墨迹 `[142,125,268,149)`、智能label `[85,197,262,221)`，与参考目标bbox一致。只证明有限墨迹外包，不能扩大成字体/抗锯齿/全部像素相等。
- 26项静态/证据边界检查通过。目视既有Safari全选、部分选区截图为暖色，AX分别选中“新建文件夹”和“件夹”；替换值由AX证明，光晕区域不用于轮廓/文字量图。Safari加载的作者HTML与封存SHA匹配。原版补证的部分选区/替换/Escape关闭记录与候选fixture保留严格区分。

首次身份采集器误按仓库根解析Safari目录相对索引，已修正并保留schema失败。首次受限WK在创建进程阶段终止、未执行DOM检查；失败JSON和日志保留。对同一个无可见窗口工具的受控权限重试exit0/stderr空，未发生OS键鼠、GUI或用户数据库操作。没有删旧证据、视频、APK/ZIP，未下载、平台构建或写共享构建缓存。

## Findings与后续门槛

**[P2，non-blocking源码准备；blocking整体验收] 正式包活跃状态及取消关闭仍待验证。** 任务26“Verification and gate”明确最后需要准确Mac12实际复拍。作者与本次WK均 `documentFocus=false`、真实`:focus`不匹配，app inactive、webview未附窗口且没有可见/key/main窗口；因此其灰选区不能判定候选激活失败，class-remap焦点图也不能当真实活跃绘制PASS。Safari实际暖色全/部分选择是补强，仍非Tauri准确包，03按Escape后保留表单符合fixture的onCancel只计数，不能声称生产App关闭成功或失败。失焦重激活、真实键鼠/箭头、深色激活可读及取消卸载需Mac12。侧栏22工具栏/菜单/正常与紧接退出回归亦不由本轮代替。

**[P3，non-blocking] 局部绘制与参考采样限制继续开放。** `src/smart-folders.css:522`的连续暖环和选择声明符合局部目标；作者诊断中心band平均通道差21.222→3.917，但只适用于显式class remap。诊断选区像素(251,233,193)与声明/参考中位(252,234,193)仍有平台处理差异；全环角点、JPEG边晕、字体细边未证明相同。原版全选00与runtime23参考相同，独立样本仍只有一个；Safari/原版图为有损带ICC JPEG。不可把bbox相等、局部改善或CSS常量相同写成全像素一致。

本轮允许进入固定源码和标准freeze/build/collect/独立核包流程。后续与手机28合并构建的安排由root维护，未修改本次固定task或共享计划。**READY STOP**。
