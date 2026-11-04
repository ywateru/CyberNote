# APP-003 tags candidate03 独立证据

候选 `6ce6033d845d15f1b45e074da9171db0c5ffb488`，结论 **BLOCKED**。报告 `docs/plan/reviews/app-003-tags-static-03.md`。

`blocking-stale-target.json` 为最小产品阻塞终态，来自完整 run03。生产 TagComposition 通过 CDP queryObjects 只读检查；pending=true、finalText/rangeText相同而postEndTransaction=false；实际最终raw合法且Store保存后，view.composing=false，空筛选的旧Editor仍可写。随后普通键盘文字继续保存到同一失配ID。run03的pass=true只表示阻塞复现断言通过，不能记作产品通过。

`composition-run01-result.json` 保留原02独立复现通过和新浏览器引擎停车超时；其后场景未执行。run02保留完整真实事务及最终状态，但检查器错误预期CDP end为trusted，原错误断言和脚本不改写。run03修正观察，记录start/update/input trusted=true、end trusted=false，未伪造结束事件或事务。所有脚本版本、失败与执行输出保留；合并输出字段限制见tool-output-clarification.json。

脚本scaffold复用作者的App/服务/transport准备，独立场景和只读对象观察由审查者编写。未替换产品模块、onUpdate、queue、matcher或TagComposition；只改测试entry暴露原类prototype以供只读heap查询。浏览器引擎输入不等于系统IME，preview action到真实Store CLI也不等于native IPC/Session。

`identity-before/after.json` 固定12产品文件、CLI及未变依赖；完整Rust未变，无编译，host target已立即释放。旧02证据保全路径在身份记录与报告中。自己的依赖链接已解除，作者树clean，产品未修改。

manifest按Path组件排序，以UTF8 `<sha256>  <relativePath>\n`聚合，排除自身；报告hash单列。另给全相对路径字符串排序聚合。合成Store目录保留在原review树artifacts/tags-independent03，证据包含完整实际actions/responses，不含用户笔记。
