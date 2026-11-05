# 手机录音时间轴60独立核验

2026-11-05。独立结论：**SOURCE-READY / PIXEL-OPEN；作者原始桌面残差仍为 DESKTOP-RASTER-OPEN**。可合入本次手机局部 CSS 改善；不授整体原版像素、真实录音、媒体/native 或设备验收通过。

准确作者源码为 `b5d008a25a9424f14f2e995cfd2557400cdb4614`，作者证据为 `0db24aa9434649f2ccd011daeecd9ebbb0ff2484`。独立树 `/private/tmp/apple-notes-mobile-recording-wave60-independent-01`，base `46e45e4f85c4c0d95720ea1e3e40ca5440aded03`，源码 cherry-pick 为 `afc048137d8ac92e88eaa5e3d0d8d5ab1d2bfa38`；作者证据 cherry-pick 为 `ece5238`。准确旧59产品为 `99dbb95ed0d4f796a71fcb40d5179ed6d90eeaa6`，未混入后续63源码。

## 核验范围与身份

源码 diff 的唯一产品改动是 `src/RecordingPanel.css` 的25行 mobile 规则。完整 wave、samples、100px/s、quarter ticks、RecordingWaveform 输入、View/Session/coordinator/Panel/Dock/transport、App 与全局style均未改。检查脚本及60规格另作为准确源码提交的一部分；逐文件 SHA 见 [input-manifest](input-manifest.json) 与 [source diff](source-diff.patch)。9个保护源文件均分别和准确59/冻结60逐字节核对。

[audit-author.py](audit-author.py) 对作者 manifest 的217个文件逐个核大小/SHA，连 manifest 共218个路径与证据提交严格相等；3个源码、9个保护文件、2个准确旧输入及原图 SHA 均匹配。3个 gzip 解压后原字节/原 SHA 精确匹配，原始 status 分别 PASS / VIEW_PASS_DESKTOP_RASTER_OPEN / VIEW_PASS_DESKTOP_RASTER_OPEN。见 [作者索引独审](author-index-audit.json)。未仅依赖作者 README 或 summary。

独立真实链为 `RecordingView → RecordingWaveform → 当前实际 CSS`，通过本地无头浏览器挂载有效 props 与 action sink。基线由 Git 直接加载59 View/CSS，其余保护输入相同；没有复制组件。仅做本次受影响的有限共享视图复验，没有重跑完整59/会话/保存矩阵，没有产品改动。

没有设备、ADB、GUI、麦克风、TCC、音频、备份、安装、重启、导出、转写、Rust/Cargo/Gradle、native构建或签名操作。保留原Android13秒失败录音现场的用户决定继续有效；“已解锁”没有被解释为恢复手机设备验收。

## axis完整性及命中

独立逐个验证每态15个 span（包括离屏时间窗口的 span）的完整 padding+line box、文字 Range、major `::before` 和45个 minor tick 的上下界；均在 axis 内。13px 行高加6px顶部留白形成19px完整标签框，窄高加3px形成16px完整标签框，分别容于20px/17px轴框，底部均余1px；不是只用 axis 名义框测提示净空。

| CSS视口 | axis范围 | 全部内容范围 | notice/retry 顶部 | axis底到提示净空 |
| --- | --- | --- | --- | --- |
| 392×840 | 468.765625–488.765625 | 468.765625–487.765625 | 495.796875 | 7.03125 |
| 320×568 | 316.3125–333.3125 | 316.3125–332.3125 | 335.25 | 1.9375 |
| 280×600 | 334.25–351.25 | 334.25–350.25 | 354.140625 | 2.890625 |

三尺寸分别保存正常暂停、有retry长错误、无retry长错误的完整截图，然后只临时把 axis overflow 改 visible，再保存完整截图。九组 axis 整个内容带逐像素差为0；扩展上下2图像px的带也完整保留，其中392/280出现6/4个游标圆端 AA 像素差（max6），不是标签或刻度。全部全图原始 diff、扩展带原始 diff、完整度几何与数字见 [独立 metrics](comparison/metrics-independent.json)。没有修改图像或遮罩以获得0差。

解除clip会引起部分游标/底部红胶囊边缘绘制变化：全图0–52像素，最大通道差18，原图和raw diff均保留。这也是首次“整幅PNG必须字节相同”断言不适用的具体原因。完整文字/刻度 Range/行框与轴内容带实测共同支持不靠 hidden 裁掉真实内容通过。组件既有±12秒时间窗口仍含横向离屏标签；392视口11个、320/280视口13个未完全在视口内。这是既有时间窗口行为，不宣称所有时间标签横向均在屏内。

三尺寸真实长错误（18次重复）均实际 overflow，滚动到160px且不派发任何动作；有/无retry都验证。notice/retry/wave内部3×3命中点均命中真实元素。retry实际tap只发 `preview-retry`，其触达宽高均≥44px。axis外溢装饰区tap不发seek；原slider最下内缘 `bottom−1px` 的真实touch仍请求2400ms。原生浏览器touch从内缘拖到wave外 `bottom+20px`，向左50px仍请求1900ms，并实测 got/lostpointercapture；100px/s未变，确认投影 `aria-valuenow` 始终2.6。初始/录制/保存禁用投影的时间轴与transport不发动作，playing图形按实际props显示。仅证明View请求派发，不证明媒体执行或声音。

三尺寸旧/新 sample boxes 精确相同；独立强红阈值 R>180/G<110/B<110 下，真实输入fixture样本像素位置集合分别4136/2636/2820个，均完全相同。此计数阈值与作者不同，不能混用数字。完整samples区域仍会含游标/旧刻度位置变化，metrics保留该区域的所有差异；没有把整个区域写成0差，也没有把给定fixture振幅称为原视频音频一致。

## 原/旧/新量图

原图 SHA `ed3bb1ace0f95af2721de9d600ca077223f2a5684299fe9b48d5f9b8a606d496`。原224×480；旧/新392×840 CSS、DPR2（784×1680），整幅等比例LANCZOS到224×480，无裁切拟合、平移、遮罩或伪造振幅。见 [原/旧/新全图](comparison/three-way.png)、全幅叠图、原始diff与固定ROI metrics。系统栏、日期、转写排除项、真实波形、材质均留在全图误差内。原DPR/原生字体未知，有损边缘约±1–2视频px。

| 墨迹（半开bbox） | 原n0960 | 准确旧59 | 冻结新60 |
| --- | --- | --- | --- |
| 00:01 maxRGB<220 | [20,273,36,278] /36px | [20,260,33,264] /20px | [20,273,36,278] /37px |
| 00:01 maxRGB<235 | [19,273,36,278] /52px | [19,260,34,264] /37px | [19,273,36,278] /48px |
| 黄色强核心 | [112,104,114,268] /15px | [111,104,114,252] /12px | [111,104,114,268] /12px |
| 黄色宽阈值 | [111,104,114,269] /332px | [111,104,114,252] /156px | [111,104,114,268] /172px |

文字墨迹提取与固定ROI误差分开：原文字行带明确为y271..280，旧/新由实际文字 Range 换算行带。固定 first-label ROI `[15,255,40,282]` 不剔除刻度，其MAE7.902222→3.551111；完整 timeline ROI `[0,100,224,283]` MAE3.852207→3.552035；完整图 MAE14.334753→14.220319。三方几何和多阈值支持局部改善；宽阈值游标底部仍差1原视频px，核心宽度/字形/颜色与整体误差仍不相同，不能授整体PIXEL-PASS。

## 桌面与执行记录

独立正确 baseline-02 / candidate-02 在普通280×467、深色playing320×600两幅截图均为0像素差；DOM、每个元素所有computed、测量区域、buttons也相同。作者冻结旧/最终普通截图为0差，深色截图独立重算确有9像素差、max1、MAE0.000007378472222，bbox `[314,794,604,1147]`。两套原始diff均留存。独立此次0差不能覆盖作者历史9像素残差，因此总体仍明确 **DESKTOP-RASTER-OPEN**，没有重跑选择相同截图来改写作者结果。

作者准确源 `pnpm typecheck` / `pnpm build` 执行记录及源码绑定通过索引核验，未重复native构建。独立浏览器 baseline-02 PASS、candidate-02 PASS，页面错误/外部请求均为空；[execution](execution.json) 与各次 runner 原件均保留。完整computed原始JSON本地保留，提交精确gzip（mtime0）并记录原大小/SHA；[归档表](raw-results-archive.json) 可无损恢复。summary只便读，不替代原件。

全部首次失败不覆盖：

- baseline-01 命令漏了 `--baseline`，实际上是新60，不作为旧图使用；其过宽全图解除clip字节相同断言失败，32像素/max6均定位游标/胶囊圆边。原命令日志、result、截图、diff和runner保留。
- baseline-02 正确追加 `--baseline`，准确旧59保存且PASS；没有调整产品。
- candidate-01 在第一组真实拖动之后，检查脚本调用Playwright不存在的 `removeExposedFunction` 出现TypeError。该API错误原件保留；检查器改为在页面中记录pointercapture事件，不改产品。
- candidate-02 同一冻结源码通过有限检查，未反复筛选截图。轴完整像素差由独立离线分析器验证；runner中简写“unclipped raster equality”以本报告的完整axis带实测为准确范围，整幅变化单列披露。

无阻塞产品发现。SOURCE-READY仅限本次手机CSS局部改善与受影响共享View输入；精确原生材质、动态字体/未知尺寸、真实采集、回放音轨、保存及完整像素目标仍开放，不改变原Android现场暂停决定。
