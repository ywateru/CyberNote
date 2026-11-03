# 暂停回放候选 02：错误重载就绪门禁

2026-11-04。修复独审 [P2](../../../plan/reviews/app-002-recording-preview-static-01.md)，基线候选 `dc3315208cbfa40049639f7748189376ad2763b6`。候选01 BLOCKED报告、失败复现与全部原始证据保留，不改写为通过。独审01跨源码变更的headless输出仍按其报告记INVALID，不用作任何旧源码通过证据。

`recording-playback.retry()` 在 mediaError 重载前，先关闭旧 ready，清理旧定位等待；然后才调用未改动的共享播放器 retry。共享播放器同步清除错误时，适配器仍保持未就绪，直到新的真实数据就绪事件且实际 readyState≥2 才恢复播放能力。定位依旧还需真实 seekable 范围。产品变更仅7行，不改采集、Panel/CSS、App/父ACK、普通播放器、Editor、Rust或依赖。

模块和组件检查的受控 load 边界现会真正清 readyState/duration/ranges，避免用保留旧就绪事实的替身漏掉这条竞态。新增检查先就绪→格式错误→重载：未收到新数据前播放不入场、±15禁用，只有metadata且readyState1仍禁用，新readyState2及真实范围后恢复。主采集未因回放重载而停止。

- [模块16项](preview.json)：新增上述重载门禁，其余snapshot/定位/晚回调范围延续。
- [实际Panel25项](browser/result.json)：在真实Panel/Session/生产播放器链中增加同一场景，页面无异常/外部请求。
- [独审原始最小复现复跑](p2-repro.json)：readyState0时adapterReady=false、playCallsBeforeDataEvent=0，原失败断言通过。
- [TypeScript](typecheck.json)：通过。

以上仍为受控媒体边界；没有新构建、设备、麦克风、编码音轨或原版像素结论。Session与共享播放器产品字节未改，候选01中原Session26和共享播放11记录保留原范围，未重复跑不受影响矩阵。

六源聚合 SHA-256 `c65623962353fceb849946c056d155aec5792e47c1f0f51e1953f4baf3723013`，逐文件身份见[source-identity.json](source-identity.json)。candidate01的14项证据逐字节核对仍一致。

更正候选01 README的一处非阻塞定位错误：普通AudioPlayer实际定义于未改动的 **src/Editor.tsx**，不在App.tsx；source identity中单独src/AudioPlayer.tsx不存在的记录本身无误。为保留旧证据身份，在此更正，不修改旧README或manifest。

作者收到P2后曾未等待独审01释放便修改共享工作树，导致其跨变更headless无效；已暂停并等待独审封存/正式释放后才冻结02。后续由root另建独立只读review工作树，避免作者修改影响审查运行。临时依赖链接和本轮服务交接前清理；独审01目录保持原样，由其作者维护。
