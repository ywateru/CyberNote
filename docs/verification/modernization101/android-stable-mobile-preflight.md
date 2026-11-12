# 原生Android稳定移动交互身份：只读窄方案

2026-11-10。仅源码分析/建议，没有产品修改、构建、浏览器或设备测试。原FORMAT102现场仍未解释；本次旋转前没有打开format，不能记为复现。

## 已有平台入口与缺陷边界

- `src/bridge.ts:33` 的native来自Tauri `isTauri()`，不是单凭UA。`src/native-toolbar.ts:15`已有macNative的Mac平台/UA排除，`src/platform/system-events.ts:191`在native分支使用Android UA注册系统Back；`src/App.tsx:4088`也已有Android UA能力投影。可以复用这些事实收敛唯一同步平台适配入口，避免用屏幕宽度推测OS。
- App303 initialMobile与994 resize均是 `innerWidth < 700 && !separate`。同一Android手机横屏越过700时，mobile身份翻转；711 configure传给session，controller156把mobile变化当navigation，295 invalidate清format/书签并blur/hide。4007还同时换desktop类。这条源码因果明确，但原r2现场是否经历旋转未知。
- initialMobile还控制navigation初始状态（311）与恢复选中笔记（882/891）。只修resize或仅加CSS不能保证横屏冷启动和首屏恢复一致。

## 最小行为设计建议（待代码gate）

同步计算稳定的 `nativeAndroid = native && /Android/i.test(navigator.userAgent)`，与可用width分开。initial与resize共用同一个layout决定函数；建议规则为 `!separate && (nativeAndroid || width < 700)`。原生Android普通主窗口无论自然横屏、IME可用高度或分屏width均保持mobile交互身份；可用宽高仍用于尺寸/滚动计算，不丢底栏、44px触控及format所有权。不得以NotesKeyboard桥存在与否推断平台，因为桥注入时点及诊断环境不保证一致。

保持Mac和普通Web原有宽度规则：宽度699为mobile、700为desktop；Mac原生工具栏原有native/macNative条件不改。Android UA的普通Web页（native=false）也保留原响应断点。`separate`既有独立窗口排除先保留，不顺手扩张Android独立窗口产品行为；必须列入测试防回归。Android平板也会采用mobile交互，是否需专用平板视觉布局是后续明确需求，本窄修不以重新切desktop解决。

不删除controller的真实失效门禁：note变化、Editor更换/销毁、导航、授权丢失、blocked/不可见继续清面板/旧焦点。稳定Android身份意味着自然旋转不再触发previous.mobile变化，不能用“忽略所有reconcile”或setEditable绕权限。若旋转实际造成Editor重建，须先查其owner/实例生命周期并明确迁移同owner书签；不应隐去销毁安全门禁。

## 必要且有因果的验收建议（本轮未执行）

1. 纯布局决定表：native Android宽度320/699/700/740/1024保持mobile；Mac/Web699→700保留旧规则；Android UA但native=false仍按宽度；separate保持排除。初始与resize使用同逻辑。
2. 真实App以同一授权owner/Editor建立非空选区并打开format：native Android从portrait360切landscape740再切回，面板仍open、selection命令目标相同、底栏/44px命中仍移动规则，无文档事务/误弹IME；IME高度变化与分屏宽度同样验证。截图和session close reason同时保留。
3. 同一打开面板场景下真实换note/目录、撤权、blocked或destroy依然invalidate，旧focus代次不得落到新owner；不以保留format为由放宽任何门禁。
4. 横屏冷启动仍走移动导航/恢复语义，Mac宽窄窗口及其原生toolbar可用性不改变；保留已有移动编辑/session/menu回归。
5. 最终非诊断同源Android包真实旋转验收，并单独记录输入法是否实际可见。源码测试不能宣称原102根因已解决或设备通过。

当前ADB唯一复核：原Samsung缺席，另一serial unauthorized；未授权另一设备、未重启server、未再轮询，无设备mutations。准确连接记录见 `artifacts/keyboard-recurrence-20261110/01-connection-recheck.json`。
