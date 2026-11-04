# 独审01两项阻塞的修复候选

作者树 `/private/tmp/apple-notes-candidate06-tools-01`，父工具提交 `b5c0aef86edec3988691c73dfe5c83bd1dc0363f`。先完整读取并核对了独审提交 `c4125411e09655eb14f6c1092e761d561403b798`：报告 `docs/plan/reviews/app-005-build-tools-01-independent01.md`，证据 `docs/verification/unified-candidate06/tools-independent01/`。其manifest SHA `b7526846e202c59876eb2969e79809f5fc181106122806d6417f1196453131f7`、结果SHA `92414508a2a077194a8d5e42c41e88946b4cb7f8122920fdc5e12c0753a1fcb1` 匹配。旧作者/审查冻结、失败记录均未改写。

P1原行为：leader exit0后仍活的同组child输出下载marker，monitor记录停止却不发信号，残留写入者仍可能继续。本次在本工具创建的Popen/session归属内查询活pgid成员；停止/异常/正常结束均核组，残留child触发失败并TERM/KILL有限等待，保留leader退出码及组清理错误。确认无活成员后才标记ownedGroupStopped；该条件进入success门。不能确认则保留offline init并失败。仅读取pid/pgid/state，不读取命令参数；只信号本轮Popen创建的group，不接受外部PID。启动前先检查进程状态读取可用，避免无法核清理时先开始构建。僵尸无法写入或被终止，由其父回收；未将其算为仍活写入者。

P2原行为：Python noop可让预置假app/dist被runner记录成功，未证明真实pnpm曾这样故障。本次由root明确选定来源门，无需用户再次确认：在独占锁内验证当前固定平台最终输出与dist的全字节/类型/内部链接及同文件系统，原子rename到本次新attempt/prior-outputs，不删除、复制或触碰中间target/cache。根/祖先symlink与外部bundle symlink拒绝。先保存来源隔离记录、确认原路径为空，再启动命令。命令成功后两处必须新生成非空正确类型输出。相同字节允许；不是强制hash变化或单mtime判断。失败保留旧件和新失败，不回滚覆盖。collector同时核旧件保全、新生成身份、来源JSON与结果一致，及收集前后仍未变化。

`check-review-fixes.py` 仅Python与TemporaryDirectory样本，隔离authorization/capture/lock，用真实monitor执行Python no-op或写回相同字节；记录请求但从不执行pnpm。Mac/Android各验证noop失败、新生成相同字节成功、旧件inode/字节保全，collector来源门拒绝noop/后改dist。另验证leader已退出的下载marker与无marker残留child都被清理，无关进程仍活；外部symlink拒绝且外部字节保持。不运行真实Mac/APK模型/签名collector，不把假产物来源检查当作候选包ready。

`recheck-attempt01.json` 保留默认工具权限下`/bin/ps`执行被操作系统拒绝的失败；未涉及真实构建或缓存。经自动审核允许的进程读取/自有Python进程控制后，`recheck-attempt02.json`针对当时补丁通过。增加启动前进程读取检查及正常退出残留child后，`review-fixes-final-command.json`/`review-fixes-final-result.json`记录受控复验，`existing-suite-final.json`记录必要7项既有回归；随后补齐空目录/目录mode身份和特殊文件类型拒绝，再以`review-fixes-final02-command.json`/`review-fixes-final02-result.json`针对最终源码通过相关复验。旧结果均不覆盖。`fix-manifest.json`纳入当前工具/说明、原冻结manifest及新证据，排除自身；它是修复候选身份，原`evidence/tool-manifest.json`仍只描述b5历史冻结。

此次没有真实Rust/Gradle/版本命令/平台构建/签名/安装/GUI或真实target/cache/最终产物变动，未修改侧栏候选树。操作来源仍由root准确主线SHA、产品聚合、平台冻结控制。工具修复待不同作者复审，不自行SOURCE-READY或合并。
