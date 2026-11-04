# Mac29 实际证据独立静态复核

PASS / READY STOP，496 项有限静态检查通过，无新增 P1/P2。报告 `docs/plan/reviews/mac-name-focus-runtime29.md`。391 个去重保护文件初末未变，包含58项runtime证据、16项量图输出、17固定输入、303当前产品及准确包/先前独审链。

`review.py` / `review-command.json` 保存本轮只读证据复核，`result.json` 保存完整断言和范围，`roi-recalculation.json` 保存六张既有图在同整数裁框、ICC和固定ROI的独立重算。`visual-review.json` 记录目视的已有图及有限判断；没有新GUI或应用渲染。`input-initial.json` / `input-close.json` 为初末身份，索引从仓库根解析，包含本报告，不包含索引自身。

18误切画廊已排除，19恢复sidebar；21无变化diff不作菜单证据，21b全文标签有效。名称操作与观察后正常退出显隐偏好支持有限通过。未做跨App失活、立即退出竞态、数据库或完整数据验收。JPEG/ICC/光晕与重复原版样本限制保留；文字覆盖、选区颜色和环角残差仍开放，不授全应用像素PASS。
