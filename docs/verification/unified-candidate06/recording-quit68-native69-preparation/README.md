# Mac21：退出68与原生普通退出69的准确输入准备与冻结

2026-11-05。root指定准确最终整合源 `bd51ae6aae37cf2f9576bf50e44e568c67a17427`，已包含68/69产品、作者证据、组合独审与状态文档。本阶段仅获准整理授权与冻结；尚未收到构建START，也未运行构建、签名或应用。

完整保留Mac20准确361产品/382输入作为union，加入5项新产品与输入：原生`termination.m`和68/69各2份检查脚本。产品为366项、聚合`cd01c9943be7fe95dacb108716f723f0dcdf8963d375788e91e529aca63a273c`；完整输入387项、聚合`22cbefc567271d7b74fd5e1dc905c21fb53733b2c64e1e460c9cd4396df434e1`。迁移为378 unchanged、4 modified、5 added、0 removed。4个既有修改为src-tauri/src/lib.rs与notes-ui插件build.rs、src/lib.rs、src/macos.rs。78个插件文件、既有smart-projection09产品fixture例外均完整纳入。21个历史input-only逐项大小/SHA未变：2个store-probe清单、5个patched ProseMirror依赖、14个Android生成输入。两份已删除child capability继续absent/tombstone，没有恢复或纳入不存在路径。

九字段授权mac-authorization.json为40074字节，SHA256 `f7c697d0c152a0b1eba877dd733612e918deeea64fb18aa6355a52cfb7e508b1`。input-plan.json保存完整union、387条迁移前后行、双聚合及产品Git对象核对。command-capability-audit.json逐份核对3份capability、两组完整application handler、插件handler与build命令声明、权限资源、旧local/quit guard。上述权限grant与handler均未变。69确实改变插件setup/退出释放和原生recording_access就绪检查；这些改动单独记录，不能误写为插件实现整体未变。68自有菜单/CmdQ与69正常AppKit退出均接入既有可取消退出保存门槛，原强杀/注销不在本轮覆盖声明内。

input-freeze.json位于`/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-quit-build21/input-freeze.json`，为353304字节，SHA256 `5a01650d4a621540eb03f3f99b2a37bae366cfaa7cdcc23fef0d1f575f98c1f4`。现有freeze工具成功退出，只运行版本、环境与补充输入身份检查。freeze-review.json的33项核对全部通过：授权/计划/freeze/当前行一致，准确HEAD与tracked工作树/index不变，七工具、版本、六环境值、OCR与补充输入均与Mac20一致。此审核不代替root直接读审准确freeze SHA。

最初空间回升原因未知，未做CoW或压缩实验。用户随后明确要求清理无用编译中间文件，root与本执行者按授权分别完成清理，记录在docs/verification/build-cache-cleanup-20261105。scratch-cleanup.json精确记录17个Vite临时缓存、3树dist及7个测试二进制，全部先核无tracked且不跟随symlink，合计201572540逻辑字节；实际观测空余增加206200832字节，HEAD不变。源码、原始日志/结果/manifest与387项冻结输入保留。input-plan内spacePreparation为首次准备时事实，后续清理事实以此记录及独立清理文件为准。

后续仍须root直接核准此准确freeze SHA并给出START，才可使用原run-build.py与collector。run目标为`/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-quit-build21`，artifact目标为`/Users/water/work/2026/Apple-Notes-Clone/artifacts/unified-candidate06/mac-recording-quit-build21`。复用固定pnpm mac:build、Mac六环境、offline/jobs2、2GiB/600秒守卫、独占锁、旧固定.app/dist原子保全；原监控所需只读/bin/ps沿既有已授权执行权限，不删除检查或改变工具。失败attempt完整保留，重试采用新编号；完整原包/ZIP与一份独立adhoc派生包维持原策略。本轮尚无attempt或artifact目录。

root告知Mac20此前PID82098已在无活动录音时正常CmdQ退出；本执行者未操作GUI、麦克风、真实音频、Android、历史包或应用数据。旧Mac18停止原因和时点仍未知，不声称未保存音频已保全/恢复。Android原失败录音现场未动。冻结不代表真实退出保存、TCC、首显、回放、像素或移动端验收通过，也不追认Mac20修复了当时失败的K录音场景。

执行更新：root准确START后唯一attempt01以原工具/策略完成正常构建，elapsed 138.18秒、exit0；collector ready=true，原包与一次独立派生签名包完整保留。准确执行与产物身份见`/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-quit-build21/README.md`。input-plan、授权、权限审计与freeze保持冻结时字节；新包独立核包和真实运行结论另出。
