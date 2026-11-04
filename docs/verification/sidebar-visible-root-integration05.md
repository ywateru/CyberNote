# 可见侧栏候选05主线整合

2026-11-04。root读取作者固定报告与不同作者SOURCE-READY报告，选择提交准确toolbar SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`、UI契约及封口证据；App/CSS沿用此前已独审提交eb3ece0。root没有自行修改或重测产品。

作者112文件manifest和不同作者106文件manifest均由独审报告绑定；原始窗口与独立几何分析位于mac-same-columns-runtime05。报告明确列出无真实窗口的AppKit边界、受控fallback、旧6pt标题重叠与实际新包待验，root未扩大结论。

整批staged diff whitespace检查退出2，仅三个已封口patch证据的第14行被标：作者 `app-001-sidebar-visible-geometry05/product.patch`，独审 `app-001-sidebar-visible-geometry-independent05/product.patch` 及 `author-product.patch`。它们是unified diff的空行上下文单空格，不是产品新增尾随空格。为保留原始bytes/manifest，不修改或strip这些证据。明确排除这三个raw patch的staged检查退出0；产品与其他文档无whitespace错误。此排除只适用于这次证据格式，不放宽产品检查。

下一步在最终干净committed HEAD上分别生成新的准确Mac/Android授权和输入冻结，不复用旧包来源。Mac先新包实际检查侧栏可见右锚、隐藏与菜单恢复、拖窄/恢复与正常冷启；Android验证先前已审选纸候选。该文仅整合说明，不是产物或GUI通过。
