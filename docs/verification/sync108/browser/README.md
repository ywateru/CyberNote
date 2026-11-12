# 浏览器定向复验

2026-11-12，在主工作区执行。正式结果：启动桌面17项、移动4项通过；同步设置桌面与移动组各56项通过。原始失败与正式结果的路径、SHA256、源指纹、布局指标见 [results.json](results.json)。原始JSON另备份在主工作区 ignored `artifacts/sync108/browser/`，不依赖临时目录。

```sh
node scripts/check-startup.mjs --output /private/tmp/sync108-workspace-checks/startup-fixed02
node scripts/debug/cli.mjs group sync-settings --out /private/tmp/sync108-workspace-checks/sync-settings-desktop-fixed02
node scripts/debug/cli.mjs group sync-settings --mobile --out /private/tmp/sync108-workspace-checks/sync-settings-mobile-fixed02
```

复跑须使用新的输出目录。使用真实App处理器和Chrome157.0.8103.51，IPC、系统对话框与窗口为明确fixture；这不是原生桌面/安卓或网络验收。

启动fixed02在所有owned浏览器/服务清理后才保存最终JSON，桌面与移动结果均 `cleanup.passed=true`，进程exit0。独立故障测试验证：清理尚未完成时无最终结果文件、清理失败将先前成功改为失败并抛错、清理成功不能覆盖既有失败；3项通过。此项关闭工具审阅中“通过JSON早于清理”的P2，fixed01原证据保持不变。

最初两个settings组各3项后失败于启动层尚未解除inert。修复reset后手机fixed01通过56项；桌面fixed01通过38项后在1280浅色布局失败，原测试要求所有按钮44px，而既有 `interface-details.ts` 与 `design-controls.css` 统一规定桌面最少28px、手机最少44px。修正测试按实际设置布局识别平台并在断言前保存几何指标。fixed02保持手机全部44px、窄桌面手机布局44px、宽桌面28px以及无横向溢出、可达滚动检查，两组各56项通过，零页面异常。没有降低手机触达标准或修改产品样式。
