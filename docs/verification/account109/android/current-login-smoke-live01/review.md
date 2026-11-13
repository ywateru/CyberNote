# 独立证据复核：APPROVE（运行仍FAIL）

Erdos只读确认五份JSON与原始/private/tmp文件逐字节相同、receipt哈希一致，私有截图SHA匹配；执行器及六相关模块匹配精确 `d3ad490f0acc504811e2c59b8744298998afb58c`，原TAP为314/314、零fail/cancel/skip/todo。

原首轮仅baseline-preserved通过，3次/3593ms，随后embedded/authorizing及CHECK_FAILED，无native-form/取消/重启通过记录，owned资源已释放。旧failureCode会折叠未列入集合的错误，不能恢复第一异常具体原因，不归因为产品或锁定问题。

manual continuation开始时已error/account_authentication，ERR_ASSERTION与Back前guard拒绝一致，不是取消通过。有限状态缺timeout stage/reason，故父级按建议收窄“自然超时”措辞，不将时间经过直接当作认证错误原因。

三later probe分别33/无XML、40/无XML、11936/有效hierarchy；最后为主WebView、无dialog/form。第一仅检查lease不存在，后两由父级取得/释放lease；它们不能追认第一事件的根因或native-form PASS。截图观察也属于后来时点。未知附件来源和原历史gate不变，重开保全必须另作独立用例。

未修改源文件、操作UI/ADB、联网或清理。以上由父级根据独立返回归档，建议措辞已修改。
