# 手机纸张顺序02开发验证

产品仅重排`src/App.tsx`的mobilePaperOptions：plain、lines-small、lines-medium、lines-large、grid-small、grid-medium、grid-large。手机实际DOM现在按行显示空白单独一行、密横线/中横线、疏横线/密网格、中网格/疏网格。原版契约由root对照保全录屏86秒帧与Android06当前PNG确定，本开发检查不冒称重新验收原版。

`source-audit.json`确认App除该数组块外逐字节相同；desktop数组、ID、label、key、事件、持久化及预览标记都未改，CSS与HEAD一致。同环境旧/新实际DOM七个卡片槽位rect逐项相同，只更换其对应选项。未修改Editor、存储或平台配置。

## 实际渲染与检查

`check-real-app.mjs`沿用既有离线Vite/React/Playwright检查设施，渲染真实生产App、Editor、完整CSS与未改browser-preview bridge。每次新建隔离Chrome上下文、临时Vite缓存与随机本机HTTP端口；仅合成笔记和隔离localStorage，无真实GUI、ADB、用户数据库、平台包、下载或外部请求。原App控制通过git show读取准确源码，Vite只读载入，不回写主树。

- `baseline-run02/result.json`：旧源码真实DOM顺序违反原版契约，预期失败，保留原始断言。
- `candidate-behavior02/result.json`：12步检查完成，真实DOM行序与七项aria/data-style关联正确；七项点击均写入对应paperStyle，重开只勾选该项，取消保持文档、样式和选区。Escape、背景关闭处理器及桌面真实App七项/无手机预览标记通过。背景用DOM事件调用生产处理器，不冒称原生用户手势。
- `baseline-behavior01/result.json`与`behavior-comparison.json`：同环境原App和候选七项选择结果逐项对照。完整真实失败和限制见下，不把观察模式的pass视为选区全绿。
- `frontend-build.log`与`frontend-build.json`：`pnpm build` exit0，5.885秒；构建时App字节SHA与最终产品候选相同。没有平台构建或装包。

## 保留的失败与独立风险

默认权限首次启动被拒绝本机listen（baseline-run01），未到产品断言；提升为已授权隔离代码检查后继续。candidate-run01发现fixture未等待异步blur；candidate-run02的宽选择器误匹配正文的data-paper-style，均保留失败并只修夹具。candidate-run03/04严格选区检查真实失败：首次点击已经选中的plain时，PM选区从3..8回到1..1，等待保存完成后仍发生。

父代理要求只读原App控制后，baseline-behavior01与candidate-behavior02都记录相同首次plain选区重置，其余六项均保留3..8。观察模式不对该已知失败强行置绿，而是逐项保存before/after及selectionPreserved=false；文档、对应样式、可编辑性及关闭后失焦仍通过。候选并未引入差异，也没有修选区。这个Chrome preview风险独立保留，不能泛化为Android实际选区已损坏或已通过。

candidate-behavior01还因两个独立开发页面的Vite默认热重载端口冲突出现WebSocket错误，完整失败保留；关闭前一控制后串行candidate-behavior02无页面错误、无外部请求。未为了全绿删除旧结果。

本次交付为顺序范围source-ready，等待不同作者独审和root指定后续Android构建/数据保留升级。在同一真实QA笔记内重新核对纸张行序、取消、当前选中项及Android Back/IME/选区之前，不能将此源码检查称为安装版或整体pixel验收完成。
