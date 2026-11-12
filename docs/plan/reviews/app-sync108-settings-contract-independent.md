# SYNC108 sync-settings 尺寸契约独立复核

日期：2026-11-12；主工作区 `/Users/water/work/2026/Apple-Notes-Clone`。只读核对未提交 `scripts/debug/sync-settings.mjs` 的小改动，不重跑正在执行的fixed02，不操作设备/用户App/测试进程，不改源码或暂存。取样HEAD：`6c45119d8feb638e830c9364eade60c756da2c5f`。

**结论：改动有现有产品契约依据，未发现P1/P2阻塞；没有降低移动布局的44px断言。** 这是静态契约结论，不能代替fixed02双平台实际结果。

## 具体依据

1. `src/interface-details.ts:89–102` 的共享 `interfaceDetailVariables(value,mobile)` 明确以桌面28、移动44作为floor：`Math.max(mobile ? 44 : 28, ((mobile ? 44 : 28) * hitScale) / 100)`。默认desktopHitScale/mobileHitScale均为100。它保证移动floor不会随缩放降到44以下，桌面不会降到28以下。
2. `src/design-controls.css:10–16` 对button等控件的min-height/min-width以 `var(--interface-hit-min) !important`实施，尺寸是统一产品规则，旧测试全平台44px与现有桌面产品floor不一致。
3. `src/App.tsx:4001–4004` 将同一个mobile状态传给共享变量；`4837–4838`又将该mobile传给Preferences；`src/Preferences.tsx:122`据此渲染preferences-mobile或preferences-desktop。因此测试 `node.closest('.preferences-mobile')` 使用的是产品实际布局身份，与变量使用的mobile一致，没有只依据runtime.mobile去把窄桌面算成28px。
4. `src/platform/layout.ts:5–12` 显式区分native Android与响应式宽度：native Android维持mobile，其他非separate窗口width<700使用mobile；App resize更新相同mobile状态。测试320/390窄布局采用44；1280桌面布局采用28。若某一平台运行仍渲染preferences-mobile，即便宽度1280，该断言仍为44。
5. `scripts/debug/sync-settings.mjs:423–431` 使用 `minimumHit = mobileControls ? 44 : 28`，对每个有client rect的button仍同时检查width和height；mobile分支的两个44都保留。没有新增跳过手机按钮或只测某一轴的过滤。
6. `445–452` 在check之前将width/theme/geometry（含minimumHit和smallButtons）写入sync86-layout.json；原无横向溢出、边界越界和overflowY=auto条件保持。若1280 light等失败，当前失败项已进入诊断JSON，不再只有之前成功项。

上述五个产品源文件本次工作区字节均与HEAD一致；只有sync-settings脚本不等于HEAD，验证“既有产品契约”而非为了测试临时修改产品尺寸。脚本当前SHA256：`4b3784f607c2518fcc873433d51bd9e230a84e167cad561767fefc3073fc61ab`；本次未提交diff SHA256：`3a287ffb282711ab74aed7dcc7a463ed2e578e1de6c001395212f2c97bccac22`。后续提交若改变这些字节需要重新核对。逐文件观察记录：`/private/tmp/sync108-sync-settings-contract-state.json`。

## 范围

本次验证的是**最低尺寸floor**；自定义hitScale放大后的更高实际最小值仍属于界面细节功能测试范围，不能从这个floor测试外推所有缩放配置都通过。这个范围没有因小改动扩大或缩小。

用户告知fresh startup fixed01为17+mobile4，sync-settings mobile fixed01为56pass、desktop因旧44px断言失败；这些是用户提供的已有执行结果，本审阅未重跑或改写。正在执行的正式fresh fixed02仍待实际结果，不能提前宣称双平台通过。旧失败证据须保留，28/44契约修正不把旧failed报告覆盖为pass。
