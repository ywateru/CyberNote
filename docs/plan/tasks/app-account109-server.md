---
id: app-account109-server
scope: CyberGrid Node/Vercel coordinator and verified account workspace API
status: ready
depends-on: []
---

## objective

基于冻结CyberGrid服务实现可部署Vercel的CyberNote协调服务，验证LogtoNative用户并返回稳定账号workspace。不保存/转发笔记或附件。保留第三方原代码许可，依赖锁定，运行配置全部环境注入。

## context

`docs/architecture/account-sync.md`、`docs/plan/analysis/account109.md`；参考只读`/private/tmp/cybernote-account109-cybergrid/server`、api/index.ts与vercel.json，冻结f2a39615。Redis实际使用TLS TCP，不改他人namespace。

## path

独占`services/coordinator/**`、`api/**`、根`vercel.json`；可新增`config/account-public.example.json`，不得改客户端src、Rust、根package/lock、.github或真实secret。源码复制只含服务必需文件，不复制上游过程docs/截图/keys。Vercel使用root api入口，静态资源定位须与新services路径一致；Node22，Function30s，内部预算维持上游限制。

## verification

服务typecheck/build/test；原CyberGrid关键服务回归、profile JWT issuer/audience/alg/client/scope/expiry/机器token拒绝、匿名拒绝、稳定workspace同账号一致/跨账号不同、seed缺失拒绝、schema/body/header约束、不打印token和配置。测试fixture明确，不冒称真实Logto/Vercel通过。提交冻结后交独立审阅；主代理单独管理真实配置/部署与现场验证。
