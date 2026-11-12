# Final106 本地交付入口更新

2026-11-10，父级已授权本地文档发布；未远程上传。此次只更新README相关入口/边界、两份交付manifest的validation与独立文档UTC，未构建、操作App/UI/Android或修改产品。源码身份在更新前后均为446输入、`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`，revision`bf26dae17f972fc09276deb456b4599e1ebe5d67`、dirty=true。

实际执行且exit0：

```sh
pnpm release publish --manifest artifacts/releases/20261110-modernization106/mac.json --manifest artifacts/releases/20261110-modernization106/android.json
```

publish原有gate校验当前源码、两端共用prepare与准确交付物摘要后，唯一latest-installers标记区改为106：Mac UTC`2026-11-10T08:05:59.823Z`，Android UTC`2026-11-10T08:23:18.611Z`。未重新prepare、stamp或核包。两manifest原`verifiedAt`分别保留`2026-11-10T08:39:16.792Z`、`2026-11-10T08:39:17.310Z`；新`documentationUpdatedAt`为`2026-11-10T10:10:51.665997+00:00`。

标记区外保留106 Mac ZIP及双侧OFL/来源链接，明确Android许可为APK旁随文件；链接正式106独审核包、Mac作者有限运行及父级观察、Android已装身份未确认的重连只读记录。README没有宣称完整原生验收通过，也没有把原102失败关闭、旧IME恢复写成106修复，保留Mac未公证/Android Debug签名及麦克风/实体触摸板限制。未知归属appearance-density进程没有被操作。

小型发布检查已确认：唯一marker、marker只含两106入口、14个相关本地链接存在；README标记区之前与“CyberNote桌面重构”之后的原内容逐字保留；manifest除了validation和文档时间外其余字段完全不变。证据在`artifacts/final106-readme-delivery/`：README/两manifest更新前快照、`document-update.json`及`publication-check.json`，后者含实际sourceIdentity、命令/exit、更新后SHA。检查只读文件与发布规则，不是功能测试或重新核包。本作者结果待不同reviewer只读独审。
