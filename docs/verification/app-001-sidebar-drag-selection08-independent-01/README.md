# 分栏拖动选字08：独立源码门禁

**SOURCE-READY，无阻塞。** 本轮只支持继续准确提交、冻结和制作Mac新包；真实浏览器拖动不新增文字选区、保留用户原有正文选区，仍由root在准确新包Computer Use验证。

作者STOP后核对9/9封存文件的大小、SHA与完整集合，全部匹配。17项有限输入（10作者文件含manifest、3产品控制、2契约、package/lock）在实际重放的开场/关闭时均未变。随后root仅向08 task追加SOURCE-READY交付状态；最终封口时16项保持、task单列变化，原文完整字节前缀hash仍等开场，新增段原文保存在root-doc-append.json。契约及产品不变。作者manifest未声明aggregate拼接公式，因此不猜公式认证该字段；逐文件身份、精确集合与作者manifest本身SHA均独立固定。

当前HEAD为`8614d788745a6183542d261d1c6b6fc789084dc7`；App候选SHA为`fc5a7eba1c5a43e4f05b99142c6fc5deb35554b2e71a9b243127ba1020967894`。独立读取HEAD完整App并只在ResizeHandle pointerdown首句插入`e.preventDefault()`，得到当前App逐字节相等；当前diff与作者product.patch相等。原drag/clientX/width/min/max/onChange/onEnd/capture及其他入口均保留，CSS与native toolbar完整字节等HEAD。没有全局user-select、清空selection、正文数据或其他算法改动。

独审只读重放作者已检查的生产AST/transpile执行脚本：完整实际ResizeHandle声明及两个真实App JSX调用点在React server render中执行，React提供useRef；Node cancelable Event和capture/settings为受控边界。baseline/candidate各sidebar/list共4条生产组件运行全部exit0、stderr空、输出JSON逐项等作者。pointerdown从defaultPrevented=false变true，顺序为preventDefault后capture；两边capture均[19,20,21]。sidebar变化[248,213,180,360]、结束[248,180,360]，list变化[300,265,220,440]、结束[300,220,440]；其余结果完全相等。非活动/结束后事件、正负变化、上下限、下一轮拖动和无关settings保持通过。

这是执行生产代码的有限行为检查，没有复制拖动算法；也不是浏览器DOM默认选字手势或完整App重渲染。未验证现有编辑器选区、IME、capture取消/丢失或多指生命周期，既有语义未改变，不为一行修正扩大矩阵。作者pnpm build的exit0声明及实际成功日志匹配，原chunk-size提示保持；独审没有重复build。

本轮实际审查及重放无失败，原始stdout/stderr保留；首次最终封口因上述root task追加触发身份断言，失败记录保留，未重跑组件或修改产品。未GUI/ADB/platform build/共享缓存/改产品/stage/commit。门禁完成后STOP，准确包实测继续由root组织。
