# Mac 普通新建表面校准20

状态：SOURCE-READY STOP，等待不同作者独审。产品仅改 `src/smart-folders.css` 中 `.smart-mac .smart-ordinary` 及其深色祖先作用域；没有出包、安装或原版GUI操作。按已有 docs-sprint 开发/独审分工交接，root后续固定Mac11准确包并复拍。

普通新建的面板改为跟随 `--paper`，保留1px边框占位、将可见边框设为透明；面板圆角26 CSS px，取消浅灰 `#ececec`，好按钮暖金 `#fdb82a`。未选中真实checkbox使用灰色 `#e6e6e6`、5 CSS px圆角；勾选即退出ordinary样式，继续使用既有智能表单控件。深色仅本作用域使用原有纸面/文字变量及局部灰色按钮、checkbox和输入背景，保持可读，无原版深色像素结论。

## 输入与色彩方法

固定输入来自封存18/19，SHA见 `source-manifest.json`。原始普通表单为800×414 JPEG，克隆全屏为2176×1320 JPEG；两者嵌入同一Display ICC，4064字节，SHA256 `2b131b3ddbafff098096955b9e3a868ed9c261e5829a83704206086ca754c7bf`。保留 `reference-display.icc` 和最初生成的 `comparison-srgb.icc`，后续测量复用其字节。通过Pillow/LittleCMS将Display ICC转换到sRGB；原始金色RGB(243,187,76)转换为(253,184,42)，不能把原JPEG原始RGB直接当CSS。

既有克隆实际CSS `#f2bd00`=(242,189,0)，其离屏WK PNG数值也是(242,189,0)，封存克隆经同一ICC转换后也是(242,189,0)。这是本组输入/工具的数值校准证据，不声称证明所有无ICC图像的颜色空间。WK PNG无嵌入ICC，派生比较图统一附带保存的sRGB ICC。JPEG噪声、截图色彩管理和合成边界限制均保留。

四处固定平坦ROI的通道中值如下：

| 区域 | 转换后原图sRGB | 修前WK | 最终WK |
|---|---|---|---|
| 面板 | 255,255,255 | 247,247,247 | 255,255,255 |
| 取消 | 236,236,236 | 231,231,231 | 236,236,236 |
| 好 | 253,184,42 | 242,189,0 | 253,184,42 |
| checkbox实填 | 230,230,230 | 255,255,255 | 230,230,230 |

## 轮廓与几何

`prepare-attempt01/` 保留基线、24/26/28px面板候选、5px checkbox候选的原始HTML/WK PNG/JSON和运行记录。亮度230角轮廓在距顶/底 `[4,8,12,16,20,24,32,40]` 图像像素处采样，五像素水平中值过滤。原图左上内缩为 `[32,24,19,14,11,8,4,2]`；最终为 `[31,24,19,14,11,8,4,1]`。四角×8点总绝对差由304降至8；24px为76，28px为64。26px是实际渲染最接近的候选，不声称还原原生圆角参数。

固定checkbox图像bbox `[40,192,72,224)` 中，以 `maxRGB<246` 取灰填充掩码：原图940像素，修前描边348且掩码差592像素，4px候选976且差36，5px及最终均940、掩码差0。这是一个阈值下的轮廓一致，不是整块原始RGB全像素一致。

最终实际WK表单400×207 CSS px，裁图800×414图像px；所有已测主要矩形与修前相同。checkbox仍为上述bbox；取消 `[424,326,584,374)`，好 `[600,326,760,374)`，间距16、右/下40。标题行框、字号、行高、输入左缘和其他主要矩形未改；本轮未重新量标题文字墨迹bbox，不代替geometry15实包证据。见 `measurements.json` 的 `geometryComparison`。

## 有限验证与证据入口

- `verify-attempt01/result.json`：实际生产SmartFolderForm与完整生产CSS、隔离回调；普通尺寸相同；真实可访问checkbox经键盘Space来回切换；勾选时原有appearance恢复、完整智能样式与基线相同；焦点仍存在、自定义名称保留、取消不保存。
- 同记录：浅/深色普通面板；已有智能编辑、手机浅/深色创建及过滤页完整计算样式隔离；390/280宽×180高下长名称无横向溢出、空名称显示错误且不保存、按钮可滚动到达。无页面错误、无外部网络请求。
- `typecheck.json`：一次 `pnpm typecheck` exit0。`source.patch`通过空白检查。
- `verify-attempt01/*-wk.json`：使用geometry15已存在的只读工具，WK未挂到窗口、nonPersistentDataStore、应用未激活；可见/key/main窗口均false（有的进程内部创建不可见TUINSWindow），无资源请求。没有构建/修改该工具。
- `final-surface-comparison-native.png`：原图、修前、最终的800×414并列图，已目视。
- `final-checkbox-comparison-nearest8x.png`、`corner-comparison-nearest2x.png`：轮廓放大；全部原始候选保留。
- `verify-attempt01/candidate-dark-form.png`：最终深色WK图，已目视；仅由同一生产React序列化HTML添加已验证的dark祖先类，非另造表单。`dark-contrast.json`保存实际生产fixture的深色计算颜色和对比度，正文/说明/按钮约7.32–14.66，仅证明工程可读性。
- `source-manifest.json`：产品/工具/参考输入SHA。`evidence-index.json`：本目录全部交付证据SHA，不含索引自身。

复核生产交互可设现有 `PLAYWRIGHT_CORE_PATH` 和 `CHROME_PATH` 后执行 `node docs/verification/mac-ordinary-form-surface20/check-surface.mjs <新的本任务输出目录> verify`。每次输出目录必须不存在；过程只运行本机自包含受控fixture，结束关闭浏览器和Vite。运行 `python3 docs/verification/mac-ordinary-form-surface20/measure-surface.py` 可从已保存WK记录重算测量；它只写本目录并复用保存的ICC。

## 仍开放的范围

本轮没有完整像素PASS。原生名称焦点环、暖选区、输入文字左缘/灰内边、智能标签2px偏移、标题字重及按钮字形、分隔线等仍依原任务边界保留；离屏导出的表单没有活跃焦点/系统选区，不能用其无焦点画面否定或证明已安装包焦点行为。未触碰智能业务、Rust/保存/查询、手机、侧栏、原版数据或删除实验；16/17源码身份保持。此次没有准确新包或CUA复拍，等待root独审及后续实包接受。深色未知原版样本，不授像素通过。
