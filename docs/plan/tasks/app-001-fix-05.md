---
id: app-001-fix-05
scope: mac-native-close-window-route
status: in-progress
depends-on: [app-001-fix-02]
---

## objective

修复独立窗口一次Cmd+W未关闭的F13缺口。FIX01已有一次失败，FIX02独立报告736ed9f在正式4118包上再次单次观察到窗口66795保持。自定义File/Window菜单未提供关闭窗口系统角色/对应快捷键，是可定位的静态缺口；当前不把它宣称为唯一运行根因。

2026-11-03新集成宿主默认构建（生产8ecb50a，exe b6bb05d539096f5e2b874e975738cfd9cab9e3047be813bdb794352f48d27af2）再次实际失败：PID89891主窗66908与独立窗66932，独立正文聚焦后单次Cmd+W，界面工具报App quit，CG与ps均确认整个进程及两窗消失。无新增编辑/pending，不能计作只关闭目标窗口通过。原包/前后证据保留于`docs/verification/app-001-fix-02-visual-01/runtime-8ecb50a/`；退出或崩溃原因、与本次菜单/原生生命周期的因果尚待诊断，不能先宣称已知根因或保存守卫通过。

1. 正式Mac菜单提供系统关闭窗口入口与Cmd+W，目标为实际聚焦窗口。原生搜索字段或正文获焦时均须关闭所属窗口，另一窗保持，不能由app-wide broadcast关闭全部窗口。
2. 关闭必须走既有窗口close-request与未保存队列处理；不能从菜单直接destroy、跳过flush或强制丢弃pending。保存失败/冲突时保留窗口和未保存内容并显示实际失败。既有跨窗访问/屏障与窗口消失处理不改。
3. 优先最小公开系统关闭角色，不新增一套JS快捷键与原生菜单同时响应。菜单文字/位置与原版若未实采，继续unknown，不据快捷键通过宣称整个File菜单像素匹配。

## context

- docs/requirements.md F13/F15、docs/architecture.md保存与窗口边界
- docs/plan/reviews/app-001-fix-02-01.md
- docs/verification/qa-fix-02/run-34223af/mac/cmdw-before.windows.json、cmdw-after.windows.json及AX/截图
- 冻结34223af的src-tauri/src/lib.rs菜单与src/App.tsx onCloseRequested（后者只读，不得绕过）

## path

最小`src-tauri/src/lib.rs`的desktop/Mac菜单定义；任务说明/独立证据。root可派隔离worktree先准备源码，禁止改App/Editor/存储/授权协议、目标产物或当前GUI。固定锁定依赖不升级。合入前等待FIX04源冻结，构建实际Mac宿主后再运行验证。

## verification

第一阶段核锁定Tauri公开关闭角色及实际调用目标，记录输入SHA与必要源码格式/编译检查范围；源码准备不等于运行通过。最终从正式已识别进程/路径/产物执行：独立窗正文获焦、原生搜索获焦时单次Cmd+W或实际关闭菜单，目标窗消失、main保留；输入未保存内容后关闭，等待真实保存并重开核完整正文。保存失败/冲突关闭不丢pending的边界继续沿现有守卫做实际/定向核验，未达成则unknown，不用直接调用destroy伪装快捷键。

## first-stage delivery

2026-11-03：隔离基线d5d11ce在File菜单新增分隔线和公开`close_window_with_text("关闭窗口")`，只有两行产品变化。已核锁定Tauri2.12.5→muda0.20.0的macOS Cmd+W/performClose角色以及tao0.37.2/runtime-wry2.12.3的可阻止CloseRequested静态链；不新建JS处理、广播或直接destroy，现有App关闭/flush守卫未改。

`rustfmt --check`、离线locked/no-deps metadata与缓存归档checksum检查通过；没有编译、GUI、设备或产物验证。源码SHA/公开依据/检查范围见`docs/verification/app-001-fix-05/README.md`和`prepare-results.json`。实际单窗归属、pending保存/重开、失败/冲突保全、事件时序与菜单像素仍unknown，任务保持in-progress，旧一次Cmd+W失败不在本阶段关闭。
