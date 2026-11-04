---
task: app-mac-ordinary-form-surface20
reviewer: verify_app (different from implementation author)
result: pass
scope: source and controlled production-component/offscreen-WebKit checks only
---

本轮独审 **PASS**，允许 root 进入准确 Mac11 包和真实应用复拍门槛。没有发现本轮范围内阻断问题。该结论仅针对普通 Mac 新建文件夹表面、角部和未选中复选框；没有整体像素一致或实际新包运行通过的结论。

候选提交由 root 固定为 `dbb594a8e7e807e211aac2ce36156c935162f2c1`。独审未读取 Git 对象；实际读取的 `src/smart-folders.css` SHA256 为 `f18dfeb0b6c9d52d66b4d4ad78016bd234c2763b38ae9ba0f09a4b7410881186`。作者索引 SHA256 为 `14170404c6be081d4a2f2653d550acf7d8c28c5b7ec23f7dc3d36de4e51afd87`，以索引父目录解析全部67项，大小与SHA均匹配。84项受保护输入在独审结束时再次逐字节身份校验。

## Findings

- P1 blocking：无。
- P2 blocking：无。
- P3 nonblocking：无本轮新增产品问题。任务已排除的名称焦点环、暖选区、输入文字左缘/灰内边、字形和分隔线等继续开放，不能据离屏无焦点画面判定原生焦点失败或通过。

## 审查与实测依据

独立比较封存基线与当前CSS，新增声明均限于 `.smart-mac .smart-ordinary` 或其深色祖先作用域，既有宽度、padding、字号、行高、控件尺寸和主要排布声明未修改。生产组件仅在 `!mobile && !folder && !draft.smart` 时添加 ordinary 类；checkbox保留真实input语义与受控checked，进入智能状态即脱离新appearance样式。SmartFolderForm、App、style.css、smart-draft以及作者清单中的其他输入均保持给定身份。

已读取作者受控fixture，独审派生脚本继续使用实际 `SmartFolderForm.tsx`、React及完整生产CSS，回调在内存隔离。一次有效运行通过10类检查：普通几何不变、键盘Space普通↔智能、勾选时appearance恢复且智能全计算样式等同基线、名称保持和取消不提交、浅深色普通表面、浅深色智能编辑、手机浅深色创建及过滤页、390/280宽且180高的长名称与空名称错误。补充断言在每次实际toggle后立即检查activeElement，不先重新聚焦；错误和滚动后的两个按钮实际矩形均在视口内。没有页面错误或外部请求。一次 `pnpm typecheck` exit0。

独审生产React导出的baseline、candidate及dark HTML以已存在的WK工具重新渲染。工具源码已读，使用nonPersistentDataStore、未挂接可见窗口、不激活应用；新三份记录均无可见/key/main窗口及资源请求，进程完成退出。实际400×207 CSS像素对应800×414图像像素，已测主要矩形在基线、浅色候选和深色候选一致：checkbox `[40,192,72,224)`，取消 `[424,326,584,374)`，好 `[600,326,760,374)`。本轮没有重新测标题墨迹bbox。

直接读取封存runtime18原始JPEG与克隆JPEG，两者ICC字节相同且与作者保存Display ICC相同。以保存sRGB配置通过LittleCMS重新转换，原图转换结果逐像素等于作者reference-srgb。原图金色原始中值(243,187,76)转为(253,184,42)；已知旧克隆金色转换后(242,189,0)，与其WK/CSS数值一致。该映射仅约束这组输入和工具，不能泛化为全部无ICC PNG的颜色空间证明。

独立从新WK图计算四ROI中值、四角各8个采样和checkbox灰填充掩码：候选面板255、取消236、好(253,184,42)、checkbox230均与转换后原图一致；角部总绝对差基线304、24px候选76、28px候选64、26px新候选8。checkbox固定32×32区域在maxRGB<246阈值下原图和新候选均940填充像素，差0；基线差592。该结果为局部中值与阈值轮廓，非完整RGB像素一致。

目视独立并排图及新深色WK图，表面与轮廓方向符合测量，深色无白板和消失文字。由新WK实际计算颜色复算标题、输入、说明和两按钮对比度为7.324–14.665；原版深色样本未知，仅通过工程可读性。

## 失败记录与限制

首次受控浏览器启动在本地监听阶段被EPERM拦住，尚未启动浏览器；保留attempt01目录和失败说明。获准后同一脚本在新attempt02目录运行通过。独立测量初稿误对深色图运行亮面230阈值而StopIteration，原稿与失败记录保留；修正仅排除深色与浅色原图的轮廓对比，深色仍保留几何及实际对比度检查。这两项均是验证环境/脚本问题，无产品修复。

没有产品修改、Git读写、平台构建、安装、GUI、ADB、用户数据库或下载操作。仅使用现有依赖和离屏工具，写入自有新独审目录及本报告。自有Vite缓存保留且排除证据索引，未清理共享缓存。浏览器、Vite及WK进程均已随命令完成退出。

## 证据

- `docs/verification/mac-ordinary-form-surface20-independent/README.md`
- `docs/verification/mac-ordinary-form-surface20-independent/result.json`
- `docs/verification/mac-ordinary-form-surface20-independent/protected-inputs.json`
- `docs/verification/mac-ordinary-form-surface20-independent/independent-source.diff`
- `docs/verification/mac-ordinary-form-surface20-independent/run-attempt02/result.json`
- `docs/verification/mac-ordinary-form-surface20-independent/independent-measurements.json`
- `docs/verification/mac-ordinary-form-surface20-independent/independent-comparison.png`
- `docs/verification/mac-ordinary-form-surface20-independent/evidence-index.json`

独审完成后 **STOP**，后续实际包/CUA交由root。
