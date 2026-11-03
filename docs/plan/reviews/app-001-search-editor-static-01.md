# 原生搜索编辑几何候选：有限独立静态审查

日期：2026-11-03。冻结源码 `67ce948c8a50202614b781d626f8929c4950cbd7` 的 `plugins/tauri-plugin-notes-ui/macos/toolbar.m` SHA256 为 `4115f4d503e08e6d126367f40a02aff8be1f5a7df1a7009bed5b86af8083d99e`。结论：本次有限静态检查没有新增确定阻断问题；允许进入开发已排定的真实输入入口验证。不能由本报告判定搜索交互或像素通过。

完整提交还保存历史视觉/诊断证据；产品差异仅该文件49行，新增31/删除18。此前静态cell布局被改为公开view的 searchButtonBounds/searchTextBounds，已有 -6.5 / -5.75 的校准只在相应view getter中各出现一次；旧cell的 searchButtonRectForBounds/searchTextRectForBounds 覆写已移除。新增 NotesUISearchCell 的 editWithFrame 与 selectWithFrame 都使用同一 editorFrame，取实际view.searchTextBounds，按传入rect与view.bounds原点差平移后传给super。没有增加替代NSTextView、私有clip view mutation、运行时方法替换、selection/text setter或新委托协议。

直接检查本机Apple AppKit SDK头：NSSearchField.h将searchTextBounds/searchButtonBounds标记为可供子类自定义布局的公开API；NSCell.h声明上述edit/select公开入口。旧诊断实际日志（非本轮运行）显示两次selectWithFrame收到完整305.08×28，而公开校准text bounds为20.25,6,260.83,16、旧field editor仍覆盖完整控件。这为本候选提供有界依据；旧诊断没有到达editWithFrame，不能替新入口证明运行效果。

源码层没有发现重复对getter执行相同数值inset，但不能从公开声明判定super在所有入口是否再次套用自身search文字布局，也不能证明不同非零frame/bounds或重进edit/select时不存在重复偏移。候选通过同一getter重新计算目标、未基于已校准传入尺寸再扣宽，减少局部累计的可能；super的真实field-editor/clip结果仍是运行未知。应以当前候选真实键盘焦点和鼠标进入两种入口，各观察空/短查询、选区及继续输入后的相对位置，有限确认无重复偏移、magnifier重叠或cancel占位破坏。不能为测试通过直接改field-editor私有布局。

自定义focusRingMaskBounds/drawFocusRingMask也是本次产品变化，扩大bounds并画圆角mask；具体色彩/裁剪仍依赖实际系统渲染。已知blue accent及global-search快捷键与原Notes差异不由这次几何静态审查关闭。

已核未改变的相邻guards：searchSequence拒绝旧ack；hasMarkedText时拒绝覆盖现有输入；focusSearch检查disposed/window/root/enabled，并在当前field editor获焦时直接no-op；change/commit/cancel仍保留marked-text限制；send仍检查disposed/suppress/callback；WillClose/dispose与BecomeKey/ResignKey异步派发仍保留。本次冻结生产文件无NSLog、fprintf/printf或诊断环境开关；没有把历史诊断日志误当成现候选日志。

本报告未新构建、未启动新搜索包、未操作GUI、未运行输入/IME矩阵，未重做整个插件安全审计。开发新包6c1557d的实际检查归native；保全ec1的独立关闭运行另见app-001-fix-05-close-runtime-01.md，两个包不能交叉追认。只写报告，未主git add/commit，由root串行保存。
