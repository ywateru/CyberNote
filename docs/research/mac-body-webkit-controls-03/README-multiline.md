# 六控制03多行JSON变体

打开`controls-multiline.html`。既有`controls.html`、清单、验证文件及runtime原件均未修改。

只替换`serializeBounded`函数：顶层每个字段占一行，字段值仍用紧凑JSON表示，因此逐字符数组不展开；完整成功结果及超长错误块都以`{\n`开始、`\n}`结束。仍严格要求每块小于16000字符，超限可见FAIL，不截断。页面六变量、文本、CSS、摘要固定高度、测量顺序和实际computed记录完全相同。

`multiline-static-validation.json`记录源/变体SHA、全部既有文件SHA未变、仅函数差异、JS语法、roundtrip及15999/16000/16001字符边界核验。开发代理没有执行GUI；多行格式能否让本机Safari AX导出完整值，仍需root实际采集后逐块JSON解析，不能从静态通过推断。

原页面实测负结果和AX单行占位问题继续保留为旧证据，本变体只改善结果传递，不改变排版实验。
