# Mac 暂停/关闭自动保存64主线整合

2026-11-05，状态 **SOURCE-READY / MAC-RUNTIME-PENDING**。新Mac18包尚待冻结、构建及Computer Use实际验收，不能以本记录宣称用户故障已在真实麦克风下复验通过。手机原现场保持，不装包、不操作、不复制未保存音频。

作者产品 `4a2cb6ad → 66cc6847 → de6e86c3` 分别合入主线 `3ff24e43 → adb5492e → abc3ee2f`。作者验证 `fe602767` 映射 `fab6a6a8`；独立审查 `5d9d3aa8` 映射 `15c99581`。独审冻结产品源 `367635a5` 与作者最终产品字节一致。根文档 `d51d427b` 对齐了旧浮窗说明与64暂停持久化、多版本和单卡投影规则。

## 接收与验证

- [独立审查](../../plan/reviews/app-mac-recording-autosave64.md)在已测范围内无剩余阻断：最终边界11组、实际App闭包/PM/SaveQueue7组、合成MediaRecorder与生产Window4组；真实Store/Session14组按20个输入字节相同复用，移动Session26/preview19组回归通过。浏览器准确源8b77与最终367的3行analyser异常差异及专门覆盖已说明，未混称同一次运行。
- [作者验证](../mac-recording-autosave64/author/README.md)：App8、Session8、浏览器8组，原生窗口路由6组及移动保存57回归17组通过。旧generic picker fixture缺依赖的失败原样保留，不能称旧全矩阵通过。
- root在产品整合后的 `fab6a6a8` 运行 `pnpm typecheck && pnpm build`，exit 0，1914 modules，Vite 3.45秒；只有既有超过500kB bundle提示。后续 `15c99581` 仅加入独审文件，没有产品变化。
- root核对完整 `src/`、`src-tauri/` 与作者de6无差异，四个作者验证脚本与fe602无差异；作者manifest的19项全部匹配。独审32项350411 bytes及backend9项71145 bytes逐项核大小与SHA通过，索引本身SHA分别为 `48579ab953bd35e17c6948cb1e4ed369241b318a12fd6d82be9a26cbfe66d0b9`、`198a872398e72469ded8178b035b58e0e750eab1059858eb35be9826b208a677`。见[result.json](result.json)。

## 行为与范围

暂停真实终结当前容器分段，累计完整WAV并等音频落盘、原A正文ACK、journal query确认后才宣布已保存；窗口保留可继续。同session首次插入、后续精确替换A最新正文里的上一确认卡。版本缺失/重复、Undo删除或归属失效则保留候选并失败，不重插、不写当前B。保存中Close排队，checkpoint不关窗，准确final ACK后唯一销毁；保存/销毁失败重试沿用同版File/operation。异常波形读取先封口采集，保留尾段。

24kHz、单声道、PCM16 WAV的100MiB上限含44字节头，约36分24秒；与原版压缩格式和容量不同。各版本不可变，旧物理音频为Undo/历史保留，会增加磁盘及归档占用，既有归档128MiB总量限制仍存在。内存与base64有副本开销。没有新增强杀后恢复未保存内存录音的承诺。

未变更CSS、DB/schema、权限/签名策略或63诊断行为。源码和合成Chrome媒体不证明真实Mac WKWebView容器、麦克风授权、后台双窗口、实际关闭/退出或像素通过。下一步按[真实运行准备](../mac-recording-autosave64-runtime/README.md)验证新准确包，旧Mac17运行结果不追认新包。
