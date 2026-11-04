# APP-MOBILE-COMPOSE-ANCHOR34 独立窄复核

2026-11-05。审查者 native_ui_research，产品作者 develop_app；root固定提交 `e194753cdfb2edda342342ae094ec43bdc5b61ff`，样式 SHA-256 `5ceac05bf79ca9fa83e0237b909c76281c2b03993ab654dbc6bed37191060929`。

结论：**SOURCE-READY PASS，未发现本次范围的阻塞项；整体像素/交互仍partial。** 允许进入准确新包与设备复验，不将源码或Chrome模型视为Android实际交付。

独立核对作者目录相对30项索引全部匹配（索引SHA `4f61011adfe2125ea22a4e84432a5f1ec3c958f8e2b39055e4017b9a7bc0e796`）。保全完整baseline CSS与固定候选逐字只差三行 `.mobile.page-folders .folder-footer { padding-right:14px; }`，其他六项冻结产品输入保持。未改SVG、尺寸、描边、颜色、DOM或事件；局部选择器避开Mac与其他mobile路由。

一次独立窄生产App headless复现确认右按钮/SVG/两条path共同+3 CSS px，左按钮及伪元素命中区域不变、SVG位于按钮内；旧左条带不再触发，新右条带触发真实newNote，合成数据3→4并进入editor。圆加号中心/近右缘真实打开且Escape取消，外界拒绝。编辑器路由规则匹配为0，隐藏footer局部字段保持。此检查没有替换生产UI/回调或读取用户数据。

七组compose图像的14个既有mask独立复算一致：原中心208；旧Android07为206.2667；host基线205.9722→候选207.7336，独立fresh得到同样bbox。前后全图RGB差异只在compose区域，垂直范围不变。范围外仅抽取保存的desktop/稳定notes各5个节点、10项相关属性和存储，及两对PNG逐RGB零差；未重跑巨型矩阵。

Android平移模型207.9778仅为3×2.75的算术，非新设备证据；host余差−0.2664仍记录。已目视局部诊断，原低清帧的slot、路径/笔尖/圆端/开口、线重和颜色未知继续开放，不授像素或path-perfect。

作者保留的200ms动画、并行Vite端口冲突失败、baseline SVGRect空对象及首分析断言失误均已核对，没有用失败文件代替最终稳定控制。本次独立首次本机listen EPERM在入App前失败，原样保留，工具许可升级后同脚本一次成功。立即进入editor的截图有既有入场动画，未用于稳定像素结论。

全部独立证据、脚本、失败及前后身份见[独立证据报告](../../verification/mobile-compose-anchor34-independent/README.md)和[独立索引](../../verification/mobile-compose-anchor34-independent/evidence-index.json)。未修改产品或35工作树，未运行Git、平台构建、Computer Use、ADB、数据库操作或下载。SOURCE-READY STOP；由root接收后安排准确Android包、稳定/重启和真实点按复验。
