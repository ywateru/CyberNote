---
id: evolve-116-release-verifier
scope: release-verification-preparation
status: in-progress
depends-on: []
---

# 发布前端源码标记核验修复

## objective

修复只读审查发现的实际发布阻塞：`scripts/release.mjs`的verifyFrontend重建stamp时遗漏sourceDirty/inputCount，而validateStamp严格要求两者，导致合法当前前端被拒绝。保留全部现有源码、生产模式、时间、运行时及包内assets核验，不通过降级validateStamp绕过。此独立准备任务可在112/115期间执行，最终包构建仍待它们合入。

## context

- `docs/architecture/build-delivery.md`
- `scripts/build-info.mjs`、`scripts/release.mjs`、`scripts/check-build-info.mjs`

## path

- `scripts/release.mjs`
- 必要的定向build-info/release回归及本任务开发记录

## verification

真实verifyFrontend入口接受合法fixture并继续完成运行时核验；缺失/错误dirty及inputCount、stale revision/fingerprint、不同stamp和非生产前端仍拒绝。保留fixture与真实安装包检查的边界，不构建Mac/Android、不改版本或账户源码、不写唯一包入口。提交后由独立agent复核再合入。
