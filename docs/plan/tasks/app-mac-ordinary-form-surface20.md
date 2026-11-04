---
id: app-mac-ordinary-form-surface20
scope: Mac ordinary creation form surface, corner contour and unchecked checkbox
status: source-ready
depends-on: [app-mac-folder-form-geometry15]
---

## Objective

继续用户要求的原版视觉校准，仅修正普通Mac新建文件夹表单的平坦表面、按钮表面、角部轮廓和未选中复选框。保留geometry15已实包确认的800×414和主要控件几何。研究19有直接图像差异，不引入新业务行为；原版删除测试继续暂停。

## Context

- docs/INDEX.md
- docs/ui/smart-folders-macos.md（末尾表面校准20）
- docs/verification/mac-ordinary-form-pixels19-research/README.md 与 measurements.json
- docs/verification/mac-folder-fixes-runtime18/README.md
- docs/plan/tasks/app-mac-folder-form-geometry15.md
- docs/plan/tasks/app-smart-draft-hydration16.md
- docs/plan/tasks/app-mobile-folder-interactions17.md

## Path and ownership

最小产品边界src/smart-folders.css，仅.smart-mac .smart-ordinary作用域。若须其他产品路径，先报告证据和原因。保留现Mac智能创建/编辑及Android全部样式、hydration16、mobile17、Rust/查询/保存/取消/侧栏/正文；不得修改它们。作者只写本任务状态及全新docs/verification/mac-ordinary-form-surface20/，root维护共享计划/布局/Git。新证据不得改写已封存18/19；无平台出包、GUI/ADB、用户DB、下载/升级或共享target/cache写入，禁止Git提交。

## UI target

```text
普通Mac新建，仅本状态
+--------------------800图像px--------------------+
| 更舒展角部 / 接近原版的亮面板                   |
| 新建文件夹                                      |
| 名称 [既有焦点框；本任务不改它]                 |
| [浅灰实填方框] 制作智能文件夹                   |
|     使用标签和其他过滤方式整理。                 |414
| ------------------------------------------------|
|                       [灰取消]  [暖金好]         |
+-------------------------------------------------+
```

原图19面板RGB255/克隆247、取消236/231、好243,187,76/234,191,63、checkbox230实填/255白描边为同ICC下JPEG原始采样，不可不经核验直接当CSS/sRGB目标。先核实际WebKit颜色映射/描边与独立样式作用域，再选择最小样式。角部亮面y8内缩原24/克隆8、y16原14/克隆3，支持克隆角更紧；不得直接将它们换算成CSS radius。用实际渲染与原图轮廓作证据，不声称推得原版原生参数。

面板目标800×414；标题bbox41,45..167,69，checkbox40,192..72,224，两按钮424,326..584,374及600,326..760,374，间距16、右/下40。保留几何。未选中checkbox可以最小appearance调整，但勾选后的智能状态必须仍可见可操作，不破坏键盘toggle、焦点和可访问checkbox语义。名称输入文字左缘、暖选区/灰内边、智能标签2px偏移、标题字重及按钮字形细差留为独立项，不能在本任务顺手改。深色状态不得变成硬编码白板；原版深色样本未知，不授其像素PASS。

## Verification

基于生产React和完整CSS、可用离线WebKit受控渲染进行相关检查，不新写镜像常量测试。保存原始候选图、输入SHA、映射/颜色采样和角部比较，比较修前/修后与研究原图；局部改进不授整体pixel PASS。核普通→智能→普通名称保持与勾选语义、取消不提交、可访问角色/键盘、窄窗/长名称/错误不裁切、智能/编辑/mobile样式隔离、deep/light作用域。运行typecheck及与本改动真正相关检查一次，原失败/限制留档。SOURCE-READY STOP后不同作者审查；root将通过源提交后另行固定准确Mac11包及Computer Use复拍，源码/离屏不是实际新包交付。
