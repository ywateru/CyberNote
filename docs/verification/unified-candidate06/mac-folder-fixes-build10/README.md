# mac-folder-fixes-build10 — accurate build and collection

2026-11-05，**BUILD/COLLECT READY；STOP，等待不同作者包独核及root实际验收**。仅使用已审canonical run-build.py和collect-outputs.py、attempt01。Mac10构建及收集完成后才执行Android06；独占共享target/cache。

- 精确source：`de372d31e0578a7f2619413c0abde6a8439bb3c6`。
- 产品301项聚合：`5cf86b16c5dc6f122b9789ee1b5181000616a533a211b8f6099881feab9b6a74`；完整320项聚合：`f8f53954584ba4c7712dc271ddcb515c9faf8be51fcb64838e4ab7236684ad0e`。
- Freeze SHA256：`fe317d0ab73b237370e50f48d3c681b2927b47efc69ca77353da5141660d9a87`。
- Build exit0，elapsed 37.523s；600s/2GiB门槛保持，无下载停止或错误。ownedGroupStopped=true、无残留组成员。
- 旧application和dist由工具原子rename到本attempt的prior-outputs；固定原路径在命令前为空，命令后生成新产物。见`mac-attempt01/output-isolation.json`及`generated-outputs.json`。
- 构建及收集的输入比较全部true，补充输入保持；原始日志及签名记录保留在attempt和artifacts相应目录。

产物目录：`artifacts/unified-candidate06/mac-folder-fixes-build10/mac-attempt01/`。

| 产物 | 字节 | SHA256 |
| --- | ---: | --- |
| mac-original.zip | 4938690 | `203b30d09c6d165fd4f28eb22e513ac32a2fc305f58169a5264e5ee44be6c3e3` |
| mac-sealed.zip | 4866538 | `6961ea84ef4f9c047a72c119f3417218400a0beaa2bda6d42beef05351b4dc29` |
| 原可执行 | 16375584 | `10ad498b545db7d3ffee0c3df384ae40c8c25ea1454fbe05c8658e0ddd9cabb1` |
| 派生可执行 | 16298512 | `56742e3842b3e3aca03a3bbd3f7fed92f017d5446578334dd7a6cf1b861e1d67` |

完整原bundle聚合`42bd3c314c1b1c39fa75e176acb0582e5f8e7a0f2e1e231b1ac1fafdb4a9b107`，完整派生bundle聚合`4017aed7be556f1774aca7acc401d6656ac24bcbd6a9120adde1fd69db8fd4f8`。原件保全未变；原始linker-adhoc签名deep/strict验证exit1如实保留，未称原件签名通过。另存的mac-sealed.app已adhoc签名及deep/strict验证exit0，差异仅主可执行与CodeResources。派生件不等于DeveloperID、公证或设备运行通过。

只新增本run/产物证据；没有源、工具、依赖、锁或环境变更，没有清共享缓存、GUI、ADB、DB、安装、启动或Git mutation。ready仅上述来源/字节/模型/签名门槛；设备、正常/冷重启、实际选择交互及原版像素仍待root验收。
