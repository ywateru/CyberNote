---
id: app-mac-folder-form-geometry15
scope: Mac ordinary new-folder form geometry and shared control opt-in boundaries
status: source-review-pass
depends-on: [app-smart-u-platform-ui09]
---

## Problem and evidence

用户要求与苹果备忘录像素一致。准确Mac09实际图像09与原版26已确认：普通新建表单误用智能宽度，约1360×382对800×414原图像素，底部分隔线缺失。以[固定原像素研究14](../../research/mac-smart-u-native-geometry14/README.md)和JSON为唯一测量来源；JPEG边缘±2px，不能据此宣称无损像素通过。本项是原需求内视觉修正，无新交互契约。

## UI target

```text
普通新建（仅Mac）                切换智能后
+-------------------------+       +--------------------------------------+
| 新建文件夹              |       | 新建智能文件夹                       |
| 名称 [_______________]  |       | 名称 [____________________________]  |
| [ ] 制作智能文件夹      |       | [x] 制作智能文件夹                   |
|     使用标签和其他…     |       |     使用标签和其他…                  |
| ----------------------- |       | [全部] 与真实规则区                  |
|           [取消] [好]   |       |                         [取消] [好]  |
+-------------------------+       +--------------------------------------+
```

普通表单图像目标800×414：按钮160×48、间隙16、右/下40；分隔线x40..760、y约292；名称焦点环约[123,106,766,166)；checkbox本体[40,192,72,224)。必须先用现CSS/实际WKWebView尺度依据确认布局单位映射，再转换，不直接把原图px当CSS。共同标题墨迹原版126×24、clone155×29，仅本项可独立限定普通表单标题；智能公共样式继续作为另项差距。

## Ownership and implementation

开发者仅改普通Mac新建的布局、必要明确状态class；不得更改Rust、查询、持久化、取消/提交、智能编辑定义、Android视图、原生工具栏或离线工具。保留现智能宽度/行为，普通↔智能切换必须根据实际isSmart状态响应，无固定绝对高度裁切错误/长名称/窄窗。限定Mac作用域，避免移动CSS覆盖。

开发者先读取task/研究和现有实现；产出最小改动及真实渲染/布局单位依据。可使用现成离线依赖的受控浏览器/WK渲染（不操作用户GUI），验证普通/智能切换、取消、名称输入、窄窗适配及Android样式隔离；不新增为常量复刻的测试。与已有功能检查有交集时仅运行相关现检查。新目录verification/mac-folder-form-geometry15/记录原失败与作者证据。不得下载/升级、构建正式平台包、修改target/设备/用户DB、Git提交。SOURCE-READY STOP后独立审查。

## Acceptance and remaining limits

不同作者检查改动范围、映射依据、普通/智能/移动作用域、真实布局行为。root随后固定新准确源，使用已核离线工具单独授权Mac正式包并Computer Use对照；源码/受控渲染通过不等于正式包像素通过。圆角/颜色/智能表单公共控件及完整智能规则仍open；不得借本项关闭总目标或app-smart-u-device09。


2026-11-05：两文件作者SOURCE-READY，独立15项React与一次真实离屏WK核查pass，见[独审](../reviews/app-mac-folder-form-geometry15.md)。root已核两源码SHA与32项独立证据字节。仅源码/受控几何通过；准确新Mac包与原生焦点/像素仍待构建实测，未标done。
