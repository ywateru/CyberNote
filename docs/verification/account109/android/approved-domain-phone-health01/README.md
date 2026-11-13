# 手机新域匿名health单次检查

2026-11-13 北京时间21:14:18–21:14:22（UTC13:14:18–13:14:22）。**PASS，仅ADB shell的匿名HTTPS health连通。** 未安装、未启动产品或授权流程、未改变网络/设置/原库。

先用指定serial只读确认device authorized，再在设备端过滤active-default网络元数据，结果仅保留CELLULAR类别。已存在curl 7.58.0与timeout，未安装或复制工具。随后仅对`https://cybernote-sync.aixgg.com/healthz`执行一次GET：curl exit0、HTTP200，DNS2.518777s、TCP2.619358s、TLS2.911271s、总3.944328s；响应3字节，匹配源码预期ok换行，SHA256 `dc51b8c96c2d745df3bd5590d990230a482fd247123599548e0632fdbf97fc22`。完整有限字段见result.json。

curl首参数--disable禁用curlrc，未使用insecure/凭据/认证头；正常CA与主机名验证启用。tlsSeconds>0、exit0及ssl_verify_result=0共同确认本次已完成验证的TLS握手，非仅依据verifyResult零值。无--location且max-redirs0，retry0，connect5s/max10s；设备timeout12s、host guard15s、响应上限4096字节。未覆盖DNS/IP/proxy/网络或环境，未请求canonical旧端点、独立DNS/TCP探针、host control、config或JWKS。

原始响应、stderr、dumpsys、IP/SSID/网络ID均未存储；响应只在RAM中与ok匹配并摘要。当前旧phone error、原preflight及baseline目录内文件前后SHA一致，未读取设备grant/数据库/笔记。检查结束，ADB归属释放。CELLULAR是active-default系统类别，不能外推为产品UID路径、Logto授权成功、enrollment或peer/relay验收。

check.py与network-command.txt为实际执行脚本；result.json绑定执行脚本SHA与既有证据SHA。SHA256SUMS覆盖本目录除自身以外文件。本记录不把DNS父级观察当作本作者独立验证。
