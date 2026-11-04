# Mac sidebar optical build06 — exact delivery

准确来源 `09fee3ec05dcf3be22037e0a842ea6d2df275cff`，toolbar SHA256 `99a24b1ec902c16bb32fe9d2a5cc82887aec62424d9c00c690a464dbf66db46b`，与06独审SOURCE-READY一致；App/CSS保留既定字节。

root auth `../root-authorization-mac-sidebar-optical-build06.json` SHA256 `76537ad40ba7171f48513e1debeb539dff36e8580d26c05731afc2b582ca775b`；root执行并审过的input-freeze.json SHA256 `739e4028d29874e2dedd6d578342b700fffc7d9554d3e1aced4b7dc50c7c378a`。238产品aggregate `3ae36caf283a87e0e661b535bdffe7352af9d6b989c913c19c70bdafca298041`，302完整输入aggregate `3093bdb667ef8458c7d3f15f1f89118ec68ad77f6b0249eabb751bf41d8a207d`，canonical preparation六工具/版本/环境固定。

## Execution and preservation

仅运行原canonical preparation/run-build.py，明确授权require_escalated以保留OS进程组安全检查，attempt01/exclusive-target-and-cache；随后原collect-outputs.py同auth/freeze/attempt。固定命令pnpm mac:build，CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2；600秒/2GiB/自有进程组护栏保持。

一次构建exit0，37.921秒，最低空闲74994974720 bytes。原05固定app与旧dist原子保存于mac-attempt01/prior-outputs，命令前旧路径不存在，新app记录新inode/hash，不复用旧包。原始build.txt保留Vite既有chunk提示。

build与collection各15项inputComparisons全部true，supplementalInputs unchanged；ownedGroupStopped=true、remainingOwnedGroupMembers为空。buildNonce `4349eff6a22f4e28bce7087ddad42838`，build result SHA256 `e218be54ce5b7b53d5fd68f3394d6a5cc3f46cd22d90654d60febf1e806fd90b`。collection/result.json ready=true。没有修改tracked inputs、HEAD、工具、依赖或共享缓存，没有下载/升级/清理。

## Accurate artifacts

目录（相对项目根）：`artifacts/unified-candidate06/mac-sidebar-optical-build06/mac-attempt01/`。

| 身份 | 字节 | SHA256 |
|---|---:|---|
| original executable | 16090480 | d0f43257222db608608e20c2e07868c85200e1f5e3a75212d7e5cedcbfccee88 |
| original archive | 4823521 | 8be164891f3bc50066f32c739a86d59601d004022cf8874bbdce3c233f337bfb |
| sealed executable | 16015072 | f69b9e3856ebb62ee64c6547d55a420762a31e58ab3b9244391981fff239f8bf |
| sealed archive | 4753057 | 56907af1d0b13ee6807a4236f67644a83b41b2baacf77744ae4931627184447c |

原始mac-original.app及ZIP完整保存。原始链接器adhoc strict验证exit1（code has no resources but signature indicates they must be present），不掩盖为成功。单独派生mac-sealed.app本地adhoc后deep/strict验证exit0；仅可执行文件签名与CodeResources变动，preservedOriginalUnchanged=true。canonical collection结果含两包完整tree/aggregate、ZIP/executable身份；交付readback四个文件hash均匹配。

## Limits

仅准确构建、完整保全及本地派生签名。没有DeveloperID、公证、TCC、启动/安装、GUI、运行时、重启或像素验收；由不同作者产物核对及root真实窗口对照继续。Android未重建，沿用已独审及有限设备验证的Android03；本次toolbar仅macOS源变动。未stage/commit。delivery-manifest.json封口本run与artifact全部文件（自身除外），历史输出未改。
