---
id: app-mac-ordinary-name-focus26
scope: Mac ordinary new-folder name input focus/selection and measured text alignment
status: source-reviewed
depends-on: [app-mac-ordinary-form-surface20, app-mac-sidebar-preference22]
---

## Objective

继续完整Mac/Android原版像素与交互目标，不缩小父目标。上一轮23/25已取得准确Mac11实际证据；本项关闭普通新建名称文字右4图像px、智能标签右2px、名称蓝选区和灰内边/细焦点环四项已证差异。不是只调整容易通过的bbox；必须看实际焦点轮廓/内边、激活选区及文字，对不能消除的差异保持开放。

## Context

- docs/INDEX.md、docs/ui/smart-folders-macos.md末尾26
- docs/research/mac-ordinary-focus24-readiness/analysis.md
- docs/research/mac-ordinary-surface25-runtime-analysis/analysis.md、measurements.json、原像素图片
- docs/verification/mac-ordinary-sidebar-runtime23/README.md、12/13准确Mac11表单
- docs/verification/mac-ordinary-sidebar23-root-acceptance.md
- src/SmartFolderForm.tsx、src/smart-folders.css、src/style.css

## Ownership and preservation

唯一产品作者仅改src/smart-folders.css，作用域必须是.smart-mac .smart-ordinary的名称input/焦点/selection和制作智能label横向gap。保留真实input、现有autoFocus/onFocus.select和所有DOM/业务事件；不以图片/叠字替代可编辑控件。不得改App/types/sidebar/Rust/native/桥接/依赖/锁/手机/智能创建编辑/整体geometry/按钮/表面20；如果CSS经真实WK证明确实不能实现，报告具体渲染限制和最小后续能力，不自行扩大路径。作者只写本任务状态及新docs/verification/mac-ordinary-name-focus26/，root维护共享文档/Git。旧证据、视频、原包、缓存不动；无GUI/ADB/用户DB/原版删除/媒体导出/下载/平台正式包。

## UI target and interaction

```text
普通Mac新建 / 原800×414图像px不变
名称： [ 暖焦点环连续、无额外灰内边              ]
         名称左缘142 / 原y125 / 原字符尺度
         活跃全选暖底；部分选区也为真实文本选择
[浅灰checkbox] 制作智能文件夹
               左缘85（旧87）；checkbox自身保持
```

上述图像坐标仅在25固定800×414参考尺度成立，不能当所有DPR的CSS参数。名称外框与金色强信号bbox保持当前目标，文字应在不改变input外部尺寸/纵向基线下左移；智能label只横移，checkbox/说明/表单/按钮不移动。参考暖选区ICC→sRGB样本252,234,193为候选依据，不直接从JPEG编码数值写CSS。原版失焦是灰选区且primary灰，00不能作为激活目标；本项先局部校准名称激活状态，并记录失焦/重新激活行为。深色需可读，原版深色未知不授其像素PASS。

不能只把灰border透明化并改outline常量就宣称连续宽环已对齐。先用当前生产React+完整CSS/真实WK对照基线复现，再选最小实现，保留测量方法/阈值/原始图/ICC转换与修前修后。部分选择、输入替换、长名称水平滚动和键盘行为保持。选择色只作用于此input，不能影响正文、手机或智能表单。

## Verification and gate

相关生产组件检查应覆盖首次默认聚焦选择、输入替换/部分选择、失焦/再聚焦、普通→智能→普通名称/checkbox语义、取消不提交、窄窗长名称/错误不裁切、智能创建编辑和手机样式隔离、深色可读。只为真实渲染/行为边界做有意义的有限检查，不写复刻CSS常量的假测试；必要typecheck一次。已有可靠离线WK工具可复用；禁止下载或写共享target/cache，若测试需新增临时cache写在本任务目录并排除封存。测试程序内focus作为受控验证，不模拟OS键鼠或切换用户应用。

记录准确源身份和受限范围，SOURCE-READY STOP后不同作者独审，root固定提交再准确Mac12标准freeze/build/collect、独立核包及Computer Use实际复拍。最终要实际默认全选、部分选择/输入替换、重新激活与取消，以及侧栏22的按钮/菜单/重启回归。原版图只有一独立样本、JPEG不是无损，不把离屏通过或金色外包相等扩大成整个产品像素PASS。task26不改Android界面；根已安排与手机28联合准确Mac12/Android07包29，各自实际验收。完整跨端目标保持active。
