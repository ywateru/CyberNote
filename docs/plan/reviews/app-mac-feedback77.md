# app-mac-feedback77 独立审查

2026-11-06。初审源码 `806d34322abfb4cc3f55e25cef4c760748d7c842`，89输入SHA256 `0099747b5e39c46e22c77526c866b5cd866647cc4387d317d6752241918495ac`。

结论 **BLOCKED**。证据：[独立初审](../../verification/mac-feedback77-independent/README.md)。未授权合入或声称原版像素一致。

| 级别 | 发现 | 精确证据 | 交付门槛 |
| --- | --- | --- | --- |
| blocking | 高亮拆开flex文本后新增视觉空隙 | `src/style.css`的`.snippet-text`为flex/gap4；同“甲乙搜索丙丁”78→86px，“搜”x331.59→335.59，“丙”357.59→365.59 | 匹配前后连续字形布局不变，锁图标与手机表现保持 |
| blocking | 最窄桌面列表远正文命中被裁 | listWidth220、snippet right412；匹配第二字“索”right423.98；PNG只见首字 | 支持最窄列表中完整可见短命中，保留正确省略/上下文与原文 |
| gate | 旧contract100ms断言不成立 | 首state transport140ms正确TIMEOUT且无lastState；旧测试强制lastState存在 | 拆开deadline/async predicate/lastState的独立验证，保留late/never/stalled超时覆盖，不编造state |

初审真实App验证前25项完成但最终因独审过强锁态结果集假设退出；不是整组PASS。两个早期自编定位器失败与此失败全部原样保全。完整范围、自然退出、计时边界和pageErrors见证据。菜单真实pointer/边缘/resize/滚动/画廊路径尚未完成，等待新freeze再验。原生Mac包、原版已打开菜单精准几何、整窗像素、Android设备不在本轮通过结论。
