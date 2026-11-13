# Canonical coordinator route-class diagnostic 01

2026-11-13 **05:24:06–05:24:09 UTC**（北京时间 13:24:06–13:24:09），checkout `ca08c3b548a50a15f9349a07c9ec4b38d724c906`。

**本次手机 curl 可识别的尝试地址是 public IPv4 与 public IPv6；未观察到 benchmark-reserved 地址。** 因此，本次证据没有支持“手机也尝试连接到 198.18/15 保留地址”的推断。它仍不能确证连接失败根因或 app UID 的实际路径。

## 单次执行与既有证据复用检查

先只读检查 fresh `current-access02/phone-health.json`、`current-access02/result.json` 及 `goal-network-recheck01/result.json`。它们没有本次所需的解析/尝试地址类别或具体 connect errno，且原始输出此前已丢弃，故无法复用 verbose 信息。随后只执行以下 **一次** canonical curl；没有 host control、独立 DNS/TCP probe、重试或新域名请求：

```sh
timeout 12 curl --verbose --silent --show-error --output /dev/null --connect-timeout 5 --max-time 10 https://cybernote-sync.vercel.app/healthz
```

由 ADB shell 调用，host guard 15s，正常 TLS 验证；不跟随重定向、不附带凭证。保持前次手机环境，未置空/变更手机 proxy/env、未改 DNS/IP/VPN、未 pin IP。仅另外执行一次只读 `id -u` 确认 UID。

## 有限归约结果

| 字段 | 本次证据 |
| --- | --- |
| Android shell UID | **2000** |
| 尝试地址类别 | **public IPv4；public IPv6**（2 条可识别 Trying 观察） |
| benchmark-reserved 类别 | **未观察到**；分类器明确包含 IPv4 `198.18.0.0/15` |
| 单独解析列表 | curl verbose 未匹配到独立 IPv4/IPv6 resolved-list 行或 canonical host resolved marker；**未取得完整 DNS RRset** |
| Connect 错误 | 4 条匹配的 connect 错误文本，均归约为 **ETIMEDOUT**；不等同于 4 次独立 curl 或不同目标尝试 |
| 数字 errno | verbose 没有显式数字 errno；标签来自有限 OS 错误文本映射，**不是 syscall trace** |
| curl exit | **7**；host guard 未超时，host 侧 2886ms |
| proxy marker | 未识别到 proxy-env notice 或 HTTP proxy tunnel marker；不据此证明不存在透明代理/VPN |

错误记录中的 attemptAddressClass 关联最近一条可识别 Trying 类别，不能当作每条错误的完整地址关联证明。本次不保留或复述任何实际 IP、解析器 IP、上游响应正文、原始 stdout/stderr 或 verbose 行。只在内存中解析，完成后丢弃 raw streams。

## 解释边界与清理

这是 **ADB shell UID 2000** 的单次观察；app UID 可能有不同的 DNS、路由、VPN/proxy 或防火墙策略。未运行 app 请求、登录、读取用户 store、复制授权或变更网络。Public 类别不能证明解析权威性、地址所有权、到目标服务的正常路由或没有拦截；未取得完整解析列表，也不能证明所有可能地址均非保留地址。

本次没有查询 parent 提议的新 hostname，也不能由此判断其 DNS 是否存在。Parent 主机对该新 hostname 的 benchmark-reserved 系统解析观察是独立证据，不能套用为本次手机 canonical 域的结果。未验证 SDK peer/tunnel。

`current-access02` 与 `goal-network-recheck01` 全部既有文件的前后 SHA 相同，映射记录于 `result.json`。无设备进程留驻，无重试或后续探测；**ADB 已释放**。只写本归档，未提交。

`diagnostic.py` 为实际执行脚本，`result.json` 仅含有限字段；`SHA256SUMS` 绑定全部归档文件（除自身）。所有文件可普通 Git 收录。
