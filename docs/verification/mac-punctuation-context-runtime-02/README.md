# 原版与当前克隆标点上下文控制

2026-11-04，root 使用 CUA 在原版 Notes 的专用 `Notes Clone UI 对照` 文件夹新建 QA-PUNCT-20261104-02，明确以纯文本粘贴 `corpus.json` 中全文；克隆通过原生新建按钮创建合成笔记，读取当前状态、点击空正文后同样纯文本粘贴。原版目录计数8→9，克隆4→5；没有改写已有私人笔记，没有数据库注入或格式调整。

01 原版与02 克隆均窗口 Fill，原始 CUA JPEG2786×1806，正文焦点、完整同文可见，指针在正文测量区域之外。原版显示14:52，克隆14:53。克隆准确包为 `artifacts/unified-candidate06/mac-body-build03/mac-attempt01/mac-sealed.app`，源码a90e55f；上一轮和随后 `../mac-sidebar-final-04/05-identity.json` 均确认相同PID89698及exe SHA b3c9013f…，但本组拍摄时未另取独立进程采样。

冻结文本包括连续8标点、同一组标点用汉字隔开、七行相同Ag中文以及一个空段。图像分析见 `../../research/mac-punctuation-context-geometry-02/README.md`：三阈值下连续标点行宽多61截图像素，间隔行多5/4/4；重复行早期偏高逐步消失，末3行已对齐。它支持继续调查上下文定位，不证明具体字体feature，不支持统一缩放或移动正文。

只有新建和纯文本输入，没有修改字体设置、现有内容或存储格式。JPEG观测不构成无损或全窗口像素认证。
