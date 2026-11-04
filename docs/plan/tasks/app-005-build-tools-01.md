---
id: app-005-build-tools-01
scope: candidate06-offline-build-and-collection-tools
status: awaiting-review
depends-on: []
---

## objective

为已通过独审的标签、录音日期及宽工具栏统一candidate06准备参数明确的离线构建/输入冻结/收集工具。旧candidate04工具绑定旧SHA及输入，不能改旧记录或直接复用旧身份。本任务只交付经审查的新工具，不实际启动平台构建；实际构建仍由app-005-unified-candidate06-01规定的准确主线冻结与整合门槛控制。

## context

- docs/INDEX.md、docs/plan/tasks/app-005-unified-candidate06-01.md
- 主工作树docs/verification/unified-candidate04/preparation/、recovery-preparation-01/、android-recovery-01/README.md
- 主工作树docs/verification/mac-candidate05-wide-toolbar-build-01/monitor-build.py
- scripts现有Android入口及构建/扫描输入契约

## path

新建docs/verification/unified-candidate06/preparation/工具、说明及本任务证据；需要时scripts新增专用文件。不要改产品、依赖/锁文件、旧candidate04/05工具或生成Android扫描注册。作者专属工作树，旧参考可只读访问主工作树，不复制target/node_modules或安装依赖。

## implementation

工具接受root显式提供的准确40位源SHA、产品输入聚合、两个平台各自完整冻结与独占输出run目录，不能默取HEAD或追随后续主线。构建前/后/收集前核完整源码、锁文件、生成输入与补充overlay身份；拒绝脏tracked源、身份不符、旧构建结果冒充本轮和任意proof flag。原输入清单及前后结果均保全。

Mac使用现有pnpm mac:build；Android显式固定已验证NDK27.2.12479018、Java17、SDK、GRADLE_USER_HOME、只读overlay、offline与并行数2，不依赖当前继承NDK28。沿用原成功恢复的完整distribution与离线cache，不下载、不升级、不复制/清理cache。自建临时offline init按inode/size/hash确认后精确清理，现有文件不得覆盖或删除。

全过程每输出阶段及轮询保留至少2GiB可用、600秒deadline；仅停止本次自己创建的进程组并等待结束，不能操作原版/其他构建/模拟器。完整记录退出码、错误、stopReason和清理失败，失败产物保留但不得通过。独立记录平台完整身份，不声称仅应用产品聚合相同就构建身份相同。

收集完整Mac原始app/zip及从该原件派生完整adhoc签名app/zip，严格验签；允许变化仅主可执行与CodeResources，并报告非DeveloperID/未公证。APK精确字节、签名/ABI/离线OCR25模型身份及证书与04升级兼容性均校验；任何签名/模型/离线marker/补充输入变化失败不能授予ready。旧collector所有成功门（含supplementalInputsUnchanged）保留。唯一新产物目录为artifacts/unified-candidate06，构建run在docs/verification/unified-candidate06下由root另定，不能覆盖旧包。

## verification

只做必要工具检查和可安全的受控runner/collector边界验证；不得借检查启动真实平台编译、Gradle或cargo。核语法、路径/显式参数拒绝、身份差异拒绝、输出独占、超时/低空间仅停自有子进程与init清理归属；不写镜像测试来代替真正原工具差异审查。保留旧工具对照及新工具完整hash/命令/结果。完成准确commit交不同作者独审，通过后root合并，之后才对新准确主线执行冻结和构建。

## delivery

已新增 `docs/verification/unified-candidate06/preparation/`，以显式平台授权和精确冻结文件SHA控制来源。开发检查仅运行Python；7项受控边界检查通过，前两次失败保留。未执行真实Rust/Gradle/平台构建、下载、安装、依赖复制或生成扫描注册。工具说明、旧参考身份、检查原始记录与工具manifest在该目录。等待不同作者审查；未自行合并或授予产品/构建ready。
