# APP-SYNC84 持久同步核心

状态 ready。根规格：[sync](../../architecture/sync.md)。主线起点 f4caa90e。开发与独审分离，冻结源码commit之后再独审，不操作设备、不用真实麦克风、不push。

实现委派的边界：生产 Store同步扩展schema+触发dirty原子捕获、raw wire版本向量/摘要/冲突删除、文件blob/staging、确定性投影和完整性验证、显式冲突解决。新增 `src-tauri/src/store/synchronization.rs`及子文件、`src-tauri/src/sync/model.rs`，必要的Store/open接入和sha2依赖。网络另85，不实现JS网络fixture冒充核心，不修改UI。schema初始化必须兼容旧库并对坏扩展schema拒绝，只有用户开启sync才bootstrap。

建议接口（均Result，参数可改但需及时报告冻结契约）：sync_enable(workspace:Option<&str>)->SyncIdentity；sync_flush()->()；sync_inventory()->Vec<VersionSummary>；sync_version(digest)->WireVersion；sync_receive(Vec<WireVersion>)->SyncReceiveReport（仅持久inbox，含missingBlobs/pending/durable/applied）；sync_apply_pending()->SyncApplyReport（86安全屏障后业务应用）；sync_blob_path(hash)->PathBuf；sync_store_blob(hash,size,reader)->()；sync_conflicts()->...；sync_resolve(entity,chosen,keep_all)->...。使用BTreeMap规范JSON。Sync模型归84所有，85独立于Store通过trait实现，只使用JSON opaque wire/摘要直到正式接入。

必须验证生产事务回滚、真实Store跨重启、A→B→A、并发头/删除恢复墓碑、重复及同向量异内容、locked原始sealed无解密/无历史明文复制、媒体摘要和半文件不发布、目录乱序收敛/断环、设置/Session/journal不外传。可用独立Rust test crate引用真实Store减少Tauri编译，但不能复制算法。单模块不标完整同步完成。

提交源码+作者必要测试（不覆盖根正式规格），记录准确命令/自然退出与边界，给根最终commit、API、未解决问题。不得自行merge主线。旧任务全部结束，本任务不是77/81 UI。
