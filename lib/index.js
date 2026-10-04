/**
 * dsh-sidebar-fold 的宿主半体。
 *
 * 这个插件所有的事都在浏览器半体里做（`lib/client.js`，纯 DOM 折叠侧栏入口），
 * 宿主这边不需要服务、工具或插槽，只保留一个空壳，让包结构跟正式插件一模一样
 * （将来要发布到 npm 时不用改结构）。
 */
export const name = "sidebar-fold";
export const inject = [];
export function apply() {}
