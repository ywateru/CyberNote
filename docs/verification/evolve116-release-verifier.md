# evolve116 发布前端标记核验修复 — 作者记录

2026-11-17，分支 `codex/evolve-116-release-verifier`，基线
`1a45e88be3c2d218fce11ec8466e8584838d6c92`。本记录是小范围源码修复与定向验证，
不是116开始/通过、实际安装包验收或发版；独审另行进行，未改任务状态。

## 因果复现与修复

`verifyFrontend` 从 `dist/build-info.json` 重建传给 `validateStamp` 的对象时漏传
`sourceDirty`、`inputCount`。当前 `validateStamp` 对这两个字段与真实源码严格比较，
因此合法 build-info 也必然拒绝。

新增 `scripts/check-release-frontend.mjs` 只用 Node 标准库，首先以当前工作树真实
`releaseStamp/createBuildInfo` 生成临时 metadata/stamp/JavaScript，然后子进程调用工作树
实际 `node scripts/release.mjs verify-frontend --frontend … --stamp …`；没有复制或替换
verifier，没有 stub validateStamp。

修复前 `node scripts/check-release-frontend.mjs --expect-bug` 成功复现真实 CLI exit1，
错误为 `Release stamp is stale or invalid`；同源码默认模式要求成功时实际断言失败。
日志分别为 `/tmp/evolve116-release-verifier-before.log`、
`/tmp/evolve116-release-verifier-before-fixed-expectation.log`；初始 fixture/CLI stdout/stderr
保留在 `/var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/cybernote-release116-UYV5Ej/`。

生产修改仅 `scripts/release.mjs` 一行：转发 build-info 中原始的 sourceDirty/inputCount。
没有补默认值、类型转换或重新猜测字段；没有修改 `build-info.mjs`/validateStamp。
版本、源码、stamp时间匹配、production模式、真实UTC构建时间、生产JavaScript identity、
包内assets/启动入口及发布核验均保留。

## 实际检查

```sh
node scripts/check-release-frontend.mjs
node --test scripts/publish/build-info.test.mjs
node scripts/check-release-entry.mjs
node --check scripts/release.mjs
node --check scripts/check-release-frontend.mjs
git diff --check
```

- 定向 **54项 PASS**，日志 `/tmp/evolve116-release-verifier-after.log`。
  真实 CLI 合法 fixture exit0且返回对象与完整metadata相等；再移除JS identity，
  必须在通过stamp后以 `Build identity is absent from production JavaScript` 拒绝。
  这验证修复后没有提前绕过后续runtime witness检查。
- 临时Git fixture分别验证合法 `sourceDirty:false/true`，带/不带外部stamp均通过；
  缺失、相反、string/null dirty；缺失、错误、string/null inputCount；旧revision/
  fingerprint、错版本、schema、非production、缺失/非法时间仍拒绝。
  不同但自身合法的stamp准备时间、外部stamp字段不匹配、JS缺少任一身份字段和实际
  产品源码字节漂移均拒绝。被篡改metadata的JS同步包含篡改值，不能靠无关runtime缺失
  误判为严格校验成功。
- 最终54项fixture和receipt保留在
  `/var/folders/ll/s836stz50mg85d4h0g4xc8jm0000gn/T/cybernote-release116-WYKQRy/`。
- 既有build-info **3项 PASS**，日志 `/tmp/evolve116-release-verifier-build-info.log`。
- 既有release入口 **18项 PASS**，日志 `/tmp/evolve116-release-verifier-entry.log`；
  使用合成plist/文件/ZIP检查真实Mac CFBundleExecutable与Android Cargo主库选择，
  不运行任何native二进制。
- 两脚本Node语法检查和diff空白检查通过。Node v22.16.0；没有安装或链接依赖。

## 边界

runtime检查指现有verifyFrontend对JavaScript资产字节的身份witness检查，不是执行前端
JS、浏览器业务或验证真实安装包。未运行包含Vite构建/浏览器流程的完整
`check-build-info.mjs`，本任务使用上述无依赖定向检查。

没有构建Mac/Android、使用Tauri target、改版本/README/产品App或账户代码，没有运行
publish或改唯一包入口；112 integration树和其他树未改。最终包仍待112/115整合及实际核验。
