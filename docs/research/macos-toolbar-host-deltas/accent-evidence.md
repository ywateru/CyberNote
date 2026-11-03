# Mac 原生焦点颜色：后续校准依据

2026-11-03。仅调研公开文档；未更改系统强调色、应用资产、Info.plist或绘制代码，不证明本机Notes具体实现。

Apple WWDC20《Adopt the new look of macOS》说明：应用可在asset catalog定义命名强调色；系统偏好为multicolor时，应用自定义强调色应用于控件、列表选择、侧栏、菜单与focus ring。用户显式选择系统强调色时，仍应使用系统命名颜色遵循该选择。因此新包搜索ring为蓝、原版为金，可能涉及应用强调色配置，不能直接归因焦点mask几何，也不能用手绘金色边框代替真实焦点状态。

来源：https://developer.apple.com/videos/play/wwdc2020/10104/ ，2026-11-03读取完整transcript，重点为accent colors段（页面行264–272）。这是macOS Big Sur引入机制的官方说明，尚未证明macOS26中本机Notes使用此机制。

`NSAccentColorName`有官方Info.plist文档入口：https://developer.apple.com/documentation/bundleresources/information-property-list/nsaccentcolorname 。本轮网页只返回JavaScript占位；Markdown端点抓取失败，故不把正文细节当作已核验。

下一步仅有界只读检查原版Notes及当前克隆的Info.plist/命名颜色配置和当前偏好，不改全局设置、不复制未知资源。确认真实配置后再选择公开接入；先完成field editor真实布局修复。强调色可能影响多个控件，需要在最终候选中一并观察，不能将局部ring颜色修正称完整像素通过。
