# dsh-sidebar-fold

把 DSH 侧栏里各插件加的入口收进一个可展开的「更多 (n)」按钮，并在应用「设置」里多出一个 **侧栏收纳** 分区，逐项决定谁收进去、谁留在外面。

- 「更多 (n)」：点一下展开／收起（`aria-expanded` 反映状态）。
- 右侧小齿轮：直接打开 **设置 → 侧栏收纳**。
- 设置页：候选入口清单 + 「默认收起」+「全部收进去 / 全部留在外面 / 恢复默认」+「点完入口后自动收起」+ 底部「诊断信息」。

## 为什么需要它

侧栏那几排入口不是一个插件管的：

| 入口 | 来路 |
| --- | --- |
| 质量工作台 / 插件 / 技能中心 | 官方插槽 `sidebar.panellist`（`ctx.slots.inject("sidebar.panellist", …)`） |
| ElectroLab | `dsh-electro-lab` 自己用 DOM 插进侧栏列（`data-dsh-electrolab-entry`） |
| 工程流程 / 片头动画 / 余额卡片 | 官方插槽 `sidebar.footer.action`（`[class*="footerActions"]`） |

官方插槽只允许插件渲染 **自己** 那一行，没有「把别人的行包起来」的 API。所以本插件用 **DOM 包裹** 做折叠 —— **不修改任何其它插件的文件**，它们自己升级也不影响（与「打补丁改别人文件」那种做法不同）。

## 安装

- 市场：`github:NanDaDi/dsh-sidebar-fold`
- 本地目录：把本仓库放进 `~/.dsh/profiles/<profile>/node_modules/dsh-sidebar-fold`，并把 `dsh-sidebar-fold` 加进该 profile `package.json` 的 `dsh.profile.bundles`，然后重启 DSH（本地包不支持热挂载）。

## 判定口径

- **按钮类**（默认收）：一格「恰好一个真 `<button>`」且这一格文字 ≤ 24 字。
- **卡片类**（默认留在外面，可在设置里勾）：其余（费用余额卡片是 `div` + `role="button"`，**不能用 `role` 判断是不是按钮**）。
- 候选入口超过 16 个就整体收手：宁可不动，也不乱藏。
- 当前正在打开的那一行（`aria-current` / `data-active` / `panelActive`）始终露在外面。
- 只在自己那个容器范围内动手：`[class*="panelList"]` 内部、侧栏列内带 entry 标记的元素、`[class*="footerActions"]` 的子元素。`settingsArea`（设置齿轮）绝不碰。

## 数据存哪儿

localStorage（键名固定，随插件走）：

- `dsh-sidebar-fold:collapsed` —— 展开/收起状态。
- `dsh-sidebar-fold:config` —— `{ picked: { <入口标识>: true|false }, autoHide: boolean }`。
- `dsh-sidebar-fold:diag` —— 最近一次关键动作的诊断（`{ v, t, phase, shell, how|fallback|error }`），仅排障用。

入口标识用稳定键（`data-slot` / `data-dsh-*-entry`，或「父标签>标签@位置」），**不用入口文字** —— 费用卡片那种文字每轮都在变的入口不会把勾选冲掉。

## 实现要点

- 客户端半体是 `window.__ModuleLoader__.load({ id, factory })` 包装（`lib/client.js`），宿主半体是空壳 ESM（`lib/index.js`）。
- 齿轮走官方 store，不点 DOM：
  `ctx.slots.entries("sidebar.settings")[0].store.create().actions.openSection("sidebar-fold")`。
  注意插槽台账把 `store` 挂在 **entry 本身** 上（`entry.store`），不在 `entry.options.store` —— 取错地方就会退回 DOM 点到旁边的账号按钮。
- store 拿不到才退回 DOM，且只点 `aria-haspopup="dialog"` 的按钮（账号 launcher 是下拉菜单，必须排除）。
- `MutationObserver` 80ms 防抖 + `attributeFilter: ["aria-current","class"]`，只对相关节点重算 —— 避开费用卡片数字每秒刷新造成的空转；折叠开关的图标只在方向真的变化时才重画（否则图标节点在 mousedown/mouseup 之间被替换，浏览器不派发 click）。
- 匹配 CSS module 类名只用 **后缀**（`panelList` / `panelRow` / `footerActions` / `settingsArea` / `navLabel`…），不吃构建哈希前缀。

## 边界与已知风险

- DSH 大版本改侧栏 DOM 或插槽名 → **静默失效**（找不到目标就不动手，不会弄坏侧栏），需要更新选择器。
- 只声明了 `platform: "web"`。
- 折叠别人的入口只能 DOM 包裹：官方插槽 API 不允许包住别人的行。

## 开发

```sh
node --check lib/client.js     # 语法
```

- 诊断：应用「设置 → 侧栏收纳」底部「诊断信息」会列出三组候选的真实 DOM 结构。
- 排障实录（可选）：`localStorage["dsh-sidebar-fold:diag"]` 会留下 `{ v, t, phase }`，能判断浏览器跑的是哪一版、走到了哪一步。

## 版本

- **0.4.1** 齿轮改走设置外壳 store（读 `entry.store`），不再点错账号按钮；加 localStorage 诊断。
- **0.4.0** 引入 store 直开（`openSection`）。
- **0.3.x** 齿轮按钮、`autoHide` 开关、稳定入口键、小三角点击修复、设置分区成型。
- **0.2.x** 设置分区（官方 `settings.section` 插槽）+ 侧栏底部动作区候选。
- **0.1.x** 全局面板行 + ElectroLab 入口。

## License

MIT
