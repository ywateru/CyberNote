---
id: app-001-sidebar-optical06
scope: mac-sidebar-optical-and-hidden-three-column-surface
status: in-progress
---

## 依据与范围

用户要求桌面侧栏同原版。05准确包实际两路恢复与重启再切换均通过，剩余细小偏差来自 docs/verification/mac-sidebar-visible05-runtime-01 原图04/11/12/17/18，与独立分析目录mac-sidebar-visible05-analysis-01。原图JPEG不是lossless像素证明。原版三栏fullSize隐藏亮面约40pt@96pt，而clone36pt@94pt；原版标题墨迹与clone约313px一致，不应因扩面推右。

仅改toolbar.m，沿既有contentOffsetFor/cell偏移：newFolder内容(+1.5,-1)pt；可见toggle内容(+.75,-.25)pt，不动44pt槽与right-anchor。仅threeColumn且fullSize且hidden，sidebar surface/group/button候选x=traffic+2、width40、高36/y8/radius18保持，toggle内容(+.5,-.25)pt。该态标题保护gap24→18以保持真实right136+18=154旧标题frame；其他布局及非fullSize隐藏仍原36pt/位置/offset0，无新依据不外推。动态toggle偏移每次layout明确赋值，不累加，不新建控件。保持direct restore永不溢出、颜色/菜单/事件/版本状态与stable对象。

```text
visible228: [ traffic |     folder44 | toggle44 ]edge228
hidden3/full: [traffic94][2][ glass toggle40 ][18][title154...]
```

## 验证与交付

作者与复核分开。复用实际生产layout390态/120连续链，显式只允许目标隐藏三栏fullSize group width/x、title gap和光学偏移变化，其余字段保留；实际AppKit旧/新glass/fallback验证稳定objects/frame/background/offset切换与命中边界。strictObjC、controller、受影响构建检查即可，无无关测试。所有原始失败保留。不要修改历史证据或伪造原版frame。产品候选固定hash/patch，复核后root提交并准确Mac出包，再独立产物核对和实际窗口三态恢复/208→228检查，检查图标中心与背景近似；仍不得授予整窗像素PASS。

无GUI/ADB/平台build/共享target/cache/下载清理，不stage/commit。磁盘>=2GiB。

## 已核定的色调补充

原版fresh17/18和05局部图标中位灰77–78，克隆40–45；实际公共AppKit颜色fixture表明label/controlText在Aqua黑alpha216/255，secondaryLabel会过浅。允许仅newFolder/toggle使用公共NSColor dynamicProvider：provider按传入appearance内解析当前label到sRGB，普通Aqua使用alpha.70；Dark与高对比各appearance保留原label的RGB/alpha。不缓存Aqua解析后的静态黑色、不直接硬编码灰77，不改变selected/disabled行为或其他按钮。原版深色未有证据，不据普通Aqua推断深色色调。须验证Aqua/Dark/HC往返解析与stable button更新；不授予Dark像素通过。

## 固定候选及独审

唯一产品toolbar SHA99a24b1ec902c16bb32fe9d2a5cc82887aec62424d9c00c690a464dbf66db46b，作者app-001-sidebar-optical06与不同作者app-001-sidebar-optical06-independent-01均封口，独审SOURCE-READY。实际生产401态/122链，独立真实AppKit三binary51连续态通过；无真NSWindow。HC appearance请求被系统归一化，公开workspace守卫受控往返验证通过，不称真HC像素。仍待准确新Mac包实际三态对照。
