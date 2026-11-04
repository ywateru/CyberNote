# Mac11 普通表单与侧栏偏好准确构建

2026-11-05 执行已授权 canonical Mac attempt01 build/collect，源码固定为 `94fbbb36fe94a7f291edf34e618091a0cec8da63`。只生成此 run/artifact 证据；未改产品源码、构建工具或依赖，未运行 GUI、Android 构建、设备、用户数据库或音频流程。

产品302文件聚合：`2f2c55e776312df3dcaa1ff5bdf87b20f17fe6f127027577cfb57e5bb8ce87b7`。完整321输入聚合：`86f2fe89729abeeb69b58875a34e55d67ca7e68d2442e494fbaa861a77dc6332`。冻结 SHA256：`aef21d9d46cd578c44a4eed72479da545f343fb52c02b466e81b29e809b1d68b`。

构建 `pnpm mac:build` exit0，elapsed37.911s，离线Cargo与jobs2沿用冻结环境。构建前后、收集前后所有15项输入比较均true，补充输入未变化。原先正式输出与dist按canonical流程原子移动到 `mac-attempt01/prior-outputs/` 并保持；该目录明确排除本轮证据索引，原始快照位于 output-isolation.json/result.json。

原始完整包保存在 artifact 的 `mac-original.app` 及 `mac-original.zip`，原 executable SHA256 `5d29577346501daa1496184986e57a8704d52dd16473b1452883f59627ee4c0a`，bundle aggregate `0b1a835117a6c031c66a4c2204a78f956cf8f4504ed925febba8fb9c6cea3b7f`，zip SHA256 `2452151186f269f928e9765d6b46521eab4f7808fac0b909c50d14935aeae900`。

原始包 linker adhoc 签名严格校验 exit1：`code has no resources but signature indicates they must be present`，原始失败及签名明细保留 command03–06。canonical collector 仅在独立 `mac-sealed.app` 副本执行 adhoc 密封，strict/deep 验证 exit0。仅 executable 签名区和新增 CodeResources 变化，原始包与source输出未变。sealed executable SHA256 `3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d`，bundle aggregate `9521aae5d2dd816709d3d5ee39488619ea6ff61dec43e2d3e2b319cfa67c5b28`，sealed zip SHA256 `d09aab449229a517b78302ac22ba6794a451abb2679441dc8035b7eeef660d9d`。sealed CDHash `30a555fd0b70e2460bb7cb2d99c40e83eb725daa`，identifier `com.local.notesclone`，arm64。

本轮前端：CSS `index-7S15VAm6.css` SHA256 `e16b00146284d9615f0728209648a09d218166c15a1c025a8155dfe77991db85`；JS `index-CwmrhNLP.js` SHA256 `7b3cb476e4bed148d7d8f33163772f7d280c1daf1afef9d8409c42a93ece5701`；index.html SHA256 `8de73adbdb9da2a1aabe05a9d4d2c922532deb27cda846f9a612acc58ac0de16`。完整身份见 collection/result.json，原始命令日志见 artifact command01–13。

collector ready=true 仅代表构建、保全与本地adhoc密封门槛通过。没有 DeveloperID、公证、TCC、启动、持久化、UI或像素验收声明。完成后 STOP，等待不同作者独立准确包复核，再由根代理决定 GUI 验收。
