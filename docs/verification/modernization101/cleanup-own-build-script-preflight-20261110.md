# 自有构建脚本缓存清理候选

2026-11-10T10:42Z，仅只读盘点，**尚未删除**。精确清单在`artifacts/modernization101/cleanup-own-build-script-preflight-20261110.json`，每个候选记录path/type/size/allocatedBytes/mtime纳秒与UTC/dev/inode/nlink/SHA256。

在`src-tauri/target/release/build`仅检查本项目`notes-clone-*`及本地`tauri-plugin-notes-{ui,scan,media}-*`目录的一层文件，未递归out、未跟随symlink。候选为18个Cargo生成的`build-script-build`/`build_script_build-<hash>`可执行缓存，逻辑275,855,008B、记录分配275,865,600B（约263.1MiB），18个独立inode。对应4份第一方build.rs均在源码中保留，可由Cargo重新生成；不要求它们与签名包字节相同。

同一时点精确命令名检查未发现Cargo/rustc/clang/Gradle构建；对18个文件执行lsof exit1、stdout/stderr均空，未见打开句柄。可用空间13,567,819,776B。APFS共享块及其他进程写入可能使实际df回收量不同，不将st_blocks和数直接当作必然净释放。

此前6项自有.a/.rlib已清未重选；当前检查的owndeps主要剩真实entry/dylib/so，均保留。所有out/codegen/frontend/原始证据/签名包/实际入口/冻结fixture/第三方deps及共享node_modules不列候选；未知appearance-density产物与进程未操作。此清单只授权准备，父级明确18文件allowlist后仍需重新核活动进程、lsof和元数据，才能删除；任何变化则停止。没有UI、设备、构建或大产物新增。
