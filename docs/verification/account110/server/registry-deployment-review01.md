# account110 registry deployment 独立复核

2026-11-14，Socrates。结论：**PASS，限部署归档一致性、源码闭包与匿名端点边界。** 审阅输入固定为 `43e3bf712e36e7bbcf63cfca9ed71ede7a02d49c` 的 [registry-deployment01](registry-deployment01/README.md)。本次未授权访问部署平台，production 指向关系依据已归档的项目读取回执；未把匿名响应视为真实账户注册证明。

## 源码与两次部署

- 独立重算归档 `SHA256SUMS` 的全部 20 项，全部匹配，且覆盖归档内除清单自身外的全部文件。
- 最终源码清单恰好为指定 service `src/public/notices/release`、package/lock/tsconfig/LICENSE，以及 `api/index.ts`、`api/package.json`、`vercel.json`，共 **87 文件、385,518 字节**。逐文件长度、SHA-256、SHA-1 均与 `e220111362084d4c72b6d6fe2dada505b97a6df3` 的 committed blob 匹配；这些输入与已审 `74d1a891d890cd22fec4c5618a5ef6b247f2db02` 无差异。
- 对按清单顺序连接的 `UTF8(path) + NUL + ASCII(decimal byte length) + NUL + raw bytes` 重算 SHA-256，最终值为 `93b40a2e1ffaa37a2f5ce1aa2424cd20f5bb4cdebaba121afe61a908836a751f`；首轮值 `9b83173fcb7e44e035da15a8f4a96edcf9937b08d4a2490020942b36150e7f49` 也匹配。两轮部署 metadata 均绑定各自分帧 hash 和相同完整源码 SHA。
- 最终 `source-manifest.json` 文件 SHA-256 为 `92e343d68549931c802d5143343cd5d0f1d4eb5e67ff59bb2a3e07058d514b97`，与聚合 result 一致。两次清单仅差新增 **73 字节 `api/package.json`**；其余 86 项完全相同，无删除或产品源码变更。
- 上传/创建投影分别记录 86/87 次 `/v2/files` 和各一次 `/v13/deployments`，均为 2xx。最终归档 production 指向 `dpl_8Fewyd8o8HHUouDYJDULDd6XSweY`，READY、aliasAssigned；本次没有重新查询或变更平台配置。

首轮 `dpl_45Yk8kCgg2osRb74XVPuxyj3n3eB` 虽 READY，匿名烟测仍为 `passed:false`，HTTP 500 和未完成 fetch 原样保留。补齐入口 package 后的第二轮首份烟测仍为 `passed:false`：canonical health 未完成，其余 11 项按预期完成；随后独立的一次 health followup 才取得 200。聚合结论没有追认这些失败请求成功。没有 raw runtime exception/stack 证据，不能给首次失败补写具体异常或将瞬时请求失败归因于某项未经证实的原因。

## 本次独立匿名检查

上海时间 **17:04:33**，只对 `https://cybernote-sync.aixgg.com` 各 GET 一次，默认 Node TLS 校验，`redirect:error`、`credentials:omit`，无 Authorization/Cookie。每请求 10 秒期限、最多读取 4,096 字节，零重试；未保存原始正文。

| 路径 | 结果 | 正文字节 / SHA-256 |
| --- | --- | --- |
| `/healthz` | 200，无重定向 | 3 / `dc51b8c96c2d745df3bd5590d990230a482fd247123599548e0632fdbf97fc22` |
| `/api/v1/notes/devices` | 401 `INVALID_IDENTITY`，无重定向 | 78 / `6782b978ed8390086d53a7e3a5bdbad1e8fa0645c7ca57cf320b60cc9d61c043` |

两份正文 hash 均与归档最终烟测一致；notes GET 已区别于部署前记录的 `INVALID_SESSION` fallback。匿名 HTTP 结果自身不暴露 deployment ID，也不单独证明远端运行的源码 hash。

本次没有账户授权、authenticated registry GET/PUT、登录、设备内容传输、原库访问、环境/域名修改、本机构建或 manifest pin 更新。真实账户发现、认证注册、Redis 持久性、native 定向传输及签名 enrollment 连续性仍未由本次复核验证。
