/**
 * dsh-sidebar-fold —— 把侧栏里那几排插件入口收进一个可展开的「更多」按钮。
 *
 * 为什么折叠要走 DOM：官方插槽 API 只让插件渲染**自己**那一行（`sidebar.panellist` 是单行插槽），
 * 没法把别人的行包起来。所以找出那几行、套一个折叠开关 —— 一个字节都不改别的插件。
 * 而**设置界面走的是正规插槽** `settings.section`（技能中心、规则管理、内置浏览器、市场自己都这么挂），
 * 不是 hack：应用「设置」里会多一个「侧栏收纳」分区，**所有插件往侧栏加的东西都在里面**，
 * 想收哪个勾哪个。
 *
 * 候选入口（DSH 0.2.0-rc.2）：
 *   1) 侧栏中部的全局面板行：容器 `[class*="panelList"]` 内、官方行 `button[class*="panelRow"]`
 *      （质量工作台 / 插件 / 技能中心…）；隐藏的是「该容器里的直接子节点」，被 Tooltip 包一层也认。
 *   2) 侧栏列内任何深度、自带 entry 标记的插件入口（ElectroLab 的 `data-dsh-electrolab-entry`），
 *      **只隐藏它自己**。
 *   3) 侧栏底部动作区 `[class*="footerActions"]` 的**每一个子元素**（工程流程、片头动画、费用卡片…）。
 *      默认口径：只有「恰好一个真 `<button>` 且文字很短」的那格默认收（按钮类），
 *      卡片类（费用卡片是 div + role="button"）默认；想收它就在设置里打个勾。
 *      `settingsArea`（设置齿轮）不在这个容器里，绝不碰。设置齿轮在隔壁。
 * 安全线：任一组都只在自己那个容器范围内动手；候选超过 16 个就整体收手（宁可不动，也不乱藏）。
 * 当前打开的那一行（aria-current / data-active / panelActive）始终露在外面。
 *
 * 配置存 localStorage：`dsh-sidebar-fold:collapsed`（默认收起）+ `dsh-sidebar-fold:config`
 * （{ picked: { 入口名: true|false } | null } —— null = 按默认口径；一旦在设置里动过手就变成显式名单）。
 */
window.__ModuleLoader__.load({
	id: "dsh-sidebar-fold",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = typeof require === "function" ? require("react") : window.React;

		const COLUMN_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]';
		const LIST_SELECTOR = '[class*="panelList"]';
		const ROW_SELECTOR = 'button[class*="panelRow"], [data-dsh-panel-entry]';
		const ENTRY_SELECTOR = '[data-dsh-electrolab-entry], [data-dsh-panel-entry]';
		const FOOTER_SELECTOR = '[class*="footerActions"]';
		const ACTIVE_SELECTOR = '[aria-current="page"], [data-active], [class*="panelActive"]';
		const TOGGLE_ATTR = "data-dsh-sidebar-fold";
		/** 版本号：跟着诊断一起写进 localStorage，一眼看出浏览器跑的是哪一版。 */
		const VERSION = "0.4.1";
		const DIAG_KEY = "dsh-sidebar-fold:diag";
		const HIDDEN_ATTR = "data-dsh-fold-hidden";
		const STYLE_ATTR = "data-dsh-sidebar-fold-style";
		const BAR_ATTR = "data-dsh-fold-bar";
		const GEAR_ATTR = "data-dsh-fold-gear";
		/** 设置分区在设置导航里的名字（和注册时的 label 保持一致）。 */
		const NAV_LABEL = "侧栏收纳";
		/** 设置分区的 id（注册与「跳转到本分区」两处共用）。 */
		const SECTION_ID = "sidebar-fold";
		const STORAGE_KEY = "dsh-sidebar-fold:collapsed";
		const CONF_KEY = "dsh-sidebar-fold:config";
		const MIN_ROWS = 2;
		const MAX_ROWS = 16;
		const SHORT_TEXT = 24;
		const DEBOUNCE_MS = 80;

		const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5"/></svg>';
		const CHEVRON_UP = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5 8 5.5 12 9.5"/></svg>';
		const GEAR_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.1"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4"/></svg>';

		const CSS = `
[${HIDDEN_ATTR}]{display:none !important}
button[${TOGGLE_ATTR}]{cursor:pointer}
/* 图标和文字不接收点击：目标永远是按钮本身，免得点击正好落在被重画的节点上 */
button[${TOGGLE_ATTR}] > *{pointer-events:none}
button[${TOGGLE_ATTR}] .dsh-fold-label{margin-left:8px;text-overflow:ellipsis;overflow:hidden}
[class*="collapsed"] button[${TOGGLE_ATTR}]{justify-content:center;padding:0}
[class*="collapsed"] button[${TOGGLE_ATTR}] .dsh-fold-label{display:none}
.dsh-fold-bar{display:flex;align-items:center;gap:2px;width:100%;min-width:0}
.dsh-fold-bar > button[${TOGGLE_ATTR}]{flex:1 1 auto;min-width:0}
button[${GEAR_ATTR}]{flex:none;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);cursor:pointer;opacity:.72}
button[${GEAR_ATTR}]:hover{background:var(--dsw-alias-interactive-bg-hover);opacity:1}
button[${GEAR_ATTR}] > *{pointer-events:none}
[class*="collapsed"] button[${GEAR_ATTR}]{display:none}
.dsh-fold-settings{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--dsw-alias-label-primary);padding:2px 0}
.dsh-fold-settings h3{margin:0;font-size:14px;font-weight:600}
.dsh-fold-settings p{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.6}
.dsh-fold-list{display:flex;flex-direction:column;gap:4px}
.dsh-fold-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer}
.dsh-fold-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-fold-row .k{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-fold-row .dsh-fold-tag{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:1px 5px}
.dsh-fold-actions{display:flex;gap:8px;flex-wrap:wrap}
.dsh-fold-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:8px;padding:4px 10px;font:inherit}
.dsh-fold-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
`;

		let collapsed = readState();
		let conf = readConf();
		let observer = null;
		let timer = 0;
		/** 插槽账本（apply 时拿到），齿轮要用它直接打开设置分区。 */
		let slotsRef = null;

		function readState() {
			try {
				return localStorage.getItem(STORAGE_KEY) !== "0";
			} catch {
				return true;
			}
		}
		function writeState() {
			try {
				localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
			} catch {}
		}
		function readConf() {
			const empty = { picked: null, autoHide: false };
			try {
				const raw = localStorage.getItem(CONF_KEY);
				if (raw === null) return empty;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return empty;
				if (parsed.picked !== null && typeof parsed.picked === "object") {
					const picked = {};
					for (const key of Object.keys(parsed.picked)) picked[key] = parsed.picked[key] === true;
					return { picked, autoHide: parsed.autoHide === true };
				}
				// 兼容 0.2.x 的 { foldAll, labels } 老配置
				if (Array.isArray(parsed.labels) && parsed.labels.length > 0) {
					const picked = {};
					for (const label of parsed.labels) if (typeof label === "string") picked[label] = true;
					return { picked, autoHide: parsed.autoHide === true };
				}
				return empty;
			} catch {
				return empty;
			}
		}
		function setConf(next) {
			conf = {
				picked: next.picked === null || typeof next.picked !== "object" ? null : next.picked,
				autoHide: next.autoHide === true
			};
			try {
				localStorage.setItem(CONF_KEY, JSON.stringify(conf));
			} catch {}
		}

		function ensureStyle() {
			if (document.querySelector("style[" + STYLE_ATTR + "]") !== null) return;
			const style = document.createElement("style");
			style.setAttribute(STYLE_ATTR, "");
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		function column() {
			const el = document.querySelector(COLUMN_SELECTOR);
			return el instanceof HTMLElement ? el : null;
		}

		function shortText(el) {
			return (el.textContent || "").replace(/\s+/g, "").length <= SHORT_TEXT;
		}

		/** 候选入口：{ row（判断是否当前打开、取名字）, target（要隐藏的元素）, label, defaultFold }。 */
		function rowEntries() {
			const root = column();
			if (root === null) return [];
			const raw = [];
			const seenRows = new Set();
			const seenTargets = new Set();
			const push = (row, target, defaultFold) => {
				if (row.getAttribute(TOGGLE_ATTR) !== null) return;
				// 我们自己的东西（折叠行、右边那个小齿轮）永远不算候选
				if (row.closest("[" + BAR_ATTR + "]") !== null || target.closest("[" + BAR_ATTR + "]") !== null) return;
				if (seenRows.has(row) || seenTargets.has(target)) return;
				seenRows.add(row);
				seenTargets.add(target);
				raw.push({ row, target, defaultFold });
			};
			// 1) 真·面板列表容器里的行
			for (const list of root.querySelectorAll(LIST_SELECTOR)) {
				if (!(list instanceof HTMLElement)) continue;
				if (list.querySelector('button[class*="panelRow"]') === null) continue;
				for (const row of list.querySelectorAll(ROW_SELECTOR)) {
					if (!(row instanceof HTMLElement)) continue;
					let target = row;
					while (target.parentElement !== null && target.parentElement !== list) target = target.parentElement;
					if (target.parentElement !== list) continue;
					push(row, target, true);
				}
			}
			// 2) 侧栏列内任何深度、自带 entry 标记的插件入口（ElectroLab 这种），只隐藏它自己
			for (const row of root.querySelectorAll(ENTRY_SELECTOR)) {
				if (!(row instanceof HTMLElement)) continue;
				push(row, row, true);
			}
			// 3) 页脚动作区的候选。注意外壳往这里插的是**一个容器**（插槽壳，里面装着各插件的格子），
			//    所以先判断这一格是不是容器（带 data-slot 标记 / 里面不止一个按钮），是就往下钻一层。
			//    默认口径：只有「恰好一个真 <button> 且这一格文字很短」的那格默认收（按钮类）；
			//    卡片类（费用卡片是 div + role="button"、没有真按钮 / 文字很长）默认在外面，
			//    但用户可以在设置里把它勾上。
			for (const box of root.querySelectorAll(FOOTER_SELECTOR)) {
				if (!(box instanceof HTMLElement)) continue;
				const items = [];
				for (const child of box.children) {
					if (!(child instanceof HTMLElement)) continue;
					if (child.matches("button")) {
						items.push(child);
						continue;
					}
					const buttonCount = child.querySelectorAll("button").length;
					const isSlotShell = child.hasAttribute("data-slot") || child.querySelector('[data-slot="sidebar.footer.action"]') !== null;
					if (buttonCount >= 2 || isSlotShell || (buttonCount >= 1 && child.children.length >= 2)) {
						for (const grand of child.children) if (grand instanceof HTMLElement) items.push(grand);
					} else {
						items.push(child);
					}
				}
				for (const item of items) {
					if (item.getAttribute(TOGGLE_ATTR) !== null) continue;
					const buttons = item.matches("button") ? [item] : Array.from(item.querySelectorAll("button"));
					const isButtonish = buttons.length === 1 && shortText(item);
					push(isButtonish ? buttons[0] : item, item, isButtonish);
				}
			}
			raw.sort((a, b) => (a.target === b.target ? 0 : a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
			// 取名字（显示用）与稳定键（配置用）：没名字的给个稳定序号
			let unnamed = 0;
			const used = new Set();
			return raw.map((it) => {
				let label = rowLabel(it.row);
				if (label === "") {
					unnamed += 1;
					label = "(未命名入口 " + unnamed + ")";
				}
				let key = entryKey(it.target);
				while (used.has(key)) key += "*";
				used.add(key);
				return { row: it.row, target: it.target, label, key, defaultFold: it.defaultFold };
			});
		}

		/** 类名去掉构建哈希前缀（`_2H3hWW_panelRow` → `panelRow`），跨版本也认得。 */
		function bareClass(name) {
			return String(name).replace(/^_?[A-Za-z0-9]{4,}_/, "");
		}

		/** 诊断/键用：`<标签.类名>` 简写（类名去哈希前缀）。 */
		function tagOf(el) {
			const cls = String(el.className || "")
				.split(/\s+/)
				.filter((c) => c !== "")
				.slice(0, 2)
				.map(bareClass)
				.join(".");
			return el.tagName.toLowerCase() + (cls === "" ? "" : "." + cls);
		}

		/**
		 * 配置键：绝不能拿入口上的**文字**当键 —— 费用卡片那种文字每轮都在变，勾选会丢。
		 * 优先用插件自己留的稳定标记，其次用「父级 > 自己 @ 位置」。
		 */
		function entryKey(target) {
			for (const attr of ["data-slot", "data-dsh-panel-entry", "data-dsh-electrolab-entry"]) {
				const value = target.getAttribute(attr);
				if (value !== null && value !== "" && value !== "true") return attr + ":" + value;
			}
			const parent = target.parentElement;
			let pos = 0;
			if (parent !== null) {
				for (const el of parent.children) {
					if (el === target) break;
					pos += 1;
				}
			}
			return tagOf(parent === null ? target : parent) + ">" + tagOf(target) + "@" + String(pos);
		}

		/** 诊断用：一个节点的长相（标签、按钮数、文字长度、子节点数）。 */
		function describeNode(el) {
			if (!(el instanceof HTMLElement)) return "(非元素)";
			const text = (el.textContent || "").replace(/\s+/g, " ").trim();
			return (
				tagOf(el) +
				" | 按钮 " + el.querySelectorAll("button").length +
				(el.matches("button") ? "（自身就是按钮）" : "") +
				" | 文字 " + text.length +
				(text === "" ? "" : "：「" + text.slice(0, 24) + "」") +
				" | 子 " + el.children.length
			);
		}

		/** 诊断用：把侧栏各容器的层级骨架写成文本，供设置面板回显（看不懂也能截图给我）。 */
		function describeDom() {
			const root = column();
			if (root === null) return "没找到侧栏列（选择器 " + COLUMN_SELECTOR + "）";
			const lines = ["侧栏列：<" + tagOf(root) + ">"];
			const list = root.querySelector(LIST_SELECTOR);
			lines.push("面板列表容器：" + (list === null ? "没找到" : "<" + tagOf(list) + ">，直接子节点 " + list.children.length + " 个"));
			if (list !== null) for (const child of list.children) lines.push("  · " + describeNode(child));
			const boxes = root.querySelectorAll(FOOTER_SELECTOR);
			lines.push("页脚动作区：" + boxes.length + " 个");
			for (const box of boxes) {
				lines.push("  <" + tagOf(box) + ">，直接子节点 " + box.children.length + " 个");
				for (const child of box.children) {
					lines.push("    · " + describeNode(child));
					if (child.querySelectorAll("button").length >= 2 || child.hasAttribute("data-slot")) {
						for (const grand of child.children) lines.push("        - " + describeNode(grand));
					}
				}
			}
			const entries = rowEntries();
			lines.push("候选入口：" + entries.length + " 个");
			for (const entry of entries) lines.push("  - " + entry.label + (entry.defaultFold === true ? "（默认收）" : "（默认不收）"));
			return lines.join("\n");
		}

		/** 入口的名字：优先后天挂的可读名。 */
		function rowLabel(row) {
			const aria = row.getAttribute("aria-label");
			if (aria !== null && aria.trim() !== "") return aria.trim();
			const title = row.getAttribute("title");
			if (title !== null && title.trim() !== "") return title.trim();
			const text = (row.textContent || "").replace(/\s+/g, " ").trim();
			if (text !== "") return text.slice(0, 24);
			// 壳里有可读名的，借来用
			const inner = row.querySelector("[aria-label], [title]");
			if (inner !== null) {
				const a = inner.getAttribute("aria-label");
				if (a !== null && a.trim() !== "") return a.trim();
				const t = inner.getAttribute("title");
				if (t !== null && t.trim() !== "") return t.trim();
			}
			return "";
		}

		function isActive(el) {
			if (el.matches(ACTIVE_SELECTOR)) return true;
			return el.querySelector(ACTIVE_SELECTOR) !== null;
		}

		/** 这一格现在收不收：动过手就按名册（先认稳定键，再兼容旧版按名字存的），没动过就按默认口径。 */
		function isFoldable(entry) {
			if (conf.picked !== null) {
				if (Object.prototype.hasOwnProperty.call(conf.picked, entry.key)) return conf.picked[entry.key] === true;
				if (Object.prototype.hasOwnProperty.call(conf.picked, entry.label)) return conf.picked[entry.label] === true;
			}
			return entry.defaultFold === true;
		}

		function setFoldable(key, on) {
			const picked = {};
			for (const entry of rowEntries()) picked[entry.key] = isFoldable(entry);
			picked[key] = on;
			setConf({ picked, autoHide: conf.autoHide === true });
		}

		/** 折叠开关：克隆原生行的类名（长得跟原生入口一样），右侧再挂一个「打开设置」的小齿轮。 */
		function buildToggle(sample) {
			const bar = document.createElement("div");
			bar.setAttribute(BAR_ATTR, "");
			bar.className = "dsh-fold-bar";
			const toggle = document.createElement("button");
			toggle.type = "button";
			toggle.setAttribute(TOGGLE_ATTR, "");
			const classes = String(sample.className || "")
				.split(/\s+/)
				.filter((c) => c !== "" && c.indexOf("panelActive") < 0);
			toggle.className = classes.join(" ");
			const glyphSample = sample.querySelector('[class*="panelGlyph"], [class*="panelIcon"]');
			const labelSample = sample.querySelector('[class*="panelTitle"]');
			const glyph = document.createElement("span");
			glyph.className = glyphSample !== null ? glyphSample.className : "";
			glyph.setAttribute("aria-hidden", "true");
			const label = document.createElement("span");
			label.className = "dsh-fold-label" + (labelSample !== null ? " " + labelSample.className : "");
			toggle.appendChild(glyph);
			toggle.appendChild(label);
			const gear = document.createElement("button");
			gear.type = "button";
			gear.setAttribute(GEAR_ATTR, "");
			gear.setAttribute("aria-label", "打开「侧栏收纳」设置");
			gear.title = "打开「侧栏收纳」设置";
			gear.innerHTML = GEAR_SVG;
			gear.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				openFoldSettings();
			});
			bar.appendChild(toggle);
			bar.appendChild(gear);
			return bar;
		}

		/**
		 * 诊断：把最近一次关键动作写进 localStorage。
		 * 我（agent）能从磁盘上的 Local Storage 读出这段，判断浏览器到底跑没跑这段代码、走到哪一步。
		 */
		function diag(patch) {
			try {
				const prev = JSON.parse(window.localStorage.getItem(DIAG_KEY) || "{}");
				window.localStorage.setItem(DIAG_KEY, JSON.stringify(Object.assign({ v: VERSION, t: Date.now() }, prev, patch)));
			} catch (error) {
				/* 诊断写不进去也不影响功能 */
			}
		}

		/**
		 * 取设置外壳 store 的实例。
		 * 关键：插槽注册时 `store` 挂在 **entry 本身** 上（插槽台账 `entry.store`），
		 * 不在 `entry.options.store` 里 —— 之前就是取错地方，导致 store 这条路一直失败、
		 * 退回 DOM 点了账号 launcher，才弹出那个「设置 / 意见反馈 / 退出登录」菜单。
		 */
		function settingsShell() {
			if (slotsRef === null || typeof slotsRef.entries !== "function") return null;
			let entries = [];
			try {
				entries = slotsRef.entries("sidebar.settings");
			} catch (error) {
				return null;
			}
			for (const entry of entries) {
				if (entry === null || entry === undefined) continue;
				const holder = entry.store !== undefined
					? entry.store
					: entry.options !== undefined && entry.options !== null
						? entry.options.store
						: undefined;
				if (holder === undefined || holder === null) continue;
				try {
					const instance = typeof holder.create === "function" ? holder.create() : holder;
					if (instance !== null && instance !== undefined && instance.actions !== undefined && instance.actions !== null) return instance;
				} catch (error) {
					/* 试下一个 entry */
				}
			}
			return null;
		}

		/** 设置面板：外壳渲染的模态（role=dialog + aria-modal），导航项是带 navLabel 的 button。 */
		function settingsDialog() {
			const panel = document.querySelector('[role="dialog"][aria-modal="true"]');
			return panel instanceof HTMLElement ? panel : null;
		}

		/** 在设置导航里找「侧栏收纳」那一项（按文字找，不依赖哈希类名）。 */
		function navItemFor(dialog) {
			for (const cell of dialog.querySelectorAll("button")) {
				const label = cell.querySelector('[class*="navLabel"]');
				const text = String((label !== null ? label : cell).textContent || "").trim();
				if (text === NAV_LABEL) return cell;
			}
			return null;
		}

		/**
		 * 侧栏底部那一格里的**设置**按钮。
		 * 注意：同一行里还坐着账号那个 launcher（未登录时显示成「更多」），
		 * 它是下拉菜单（设置/意见反馈/退出登录），不是设置入口 —— 绝不能点错，
		 * 所以优先找带 trigger 类的那个按钮（真设置入口），找不到才退而取同行的最后一个按钮。
		 */
		function settingsTrigger() {
			const area = document.querySelector('[class*="settingsArea"]') ?? column();
			if (area === null) return null;
			const row = area.querySelector('[class*="triggerRow"]') ?? area;
			const direct = row.querySelector('button[class*="trigger"][aria-haspopup="dialog"]') ?? row.querySelector('button[class*="trigger"]');
			if (direct instanceof HTMLElement) return direct;
			// 退路只认 aria-haspopup="dialog"：账号 launcher 是下拉菜单，点到它就弹那个菜单
			const candidates = row.querySelectorAll('button[aria-haspopup="dialog"]');
			const last = candidates.length > 0 ? candidates[candidates.length - 1] : null;
			return last instanceof HTMLElement ? last : null;
		}

		/** 键盘兜底：桌面版设置快捷键 Ctrl+,（也可能是 Ctrl+Alt+,）—— 只在 store 与 DOM 都失败时才用。 */
		function pressSettingsShortcut() {
			for (const extra of [false, true]) {
				const event = new KeyboardEvent("keydown", {
					key: ",",
					code: "Comma",
					ctrlKey: true,
					altKey: extra,
					bubbles: true,
					cancelable: true
				});
				document.dispatchEvent(event);
			}
		}

		/**
		 * 正路：直接调设置外壳自己的 store。
		 * `sidebar.settings` 插槽注册时带着 `{ open, close, select, openSection }` 四个动作，
		 * `openSection(id)` 一次就把「打开设置 + 选中本分区」做完 —— 比点 DOM 稳得多：
		 * 既不用点触发按钮（那格里还坐着账号的 launcher，点错就弹它的下拉菜单），
		 * 也不用再点导航项。
		 */
		function openViaStore() {
			const instance = settingsShell();
			if (instance === null) {
				diag({ phase: "gear", shell: false });
				return false;
			}
			const actions = instance.actions;
			try {
				if (typeof actions.openSection === "function") {
					actions.openSection(SECTION_ID);
					diag({ phase: "gear", shell: true, how: "openSection" });
					return true;
				}
				if (typeof actions.open === "function") {
					actions.open();
					if (typeof actions.select === "function") actions.select(SECTION_ID);
					diag({ phase: "gear", shell: true, how: "open+select" });
					return true;
				}
			} catch (error) {
				diag({ phase: "gear", shell: true, error: String(error !== null && error !== undefined && error.message !== undefined ? error.message : error) });
				return false;
			}
			diag({ phase: "gear", shell: true, actions: Object.keys(actions || {}).join(",") });
			return false;
		}

		/**
		 * 齿轮按钮：打开设置并跳到「侧栏收纳」分区。
		 * 先走 store；store 拿不到才退回 DOM —— 而且只点一次真设置按钮，绝不反复戳
		 * （反复戳会把账号那排按钮戳成「弹三下」，按 Esc 又可能把刚打开的面板关掉）。
		 */
		function openFoldSettings() {
			const viaStore = openViaStore();
			let tries = 0;
			let clicked = viaStore;
			const step = () => {
				tries += 1;
				const dialog = settingsDialog();
				if (dialog !== null) {
					const cell = navItemFor(dialog);
					if (cell !== null && cell.getAttribute("aria-current") !== "true") cell.click();
					return;
				}
				if (!clicked && tries === 2) {
					clicked = true;
					const trigger = settingsTrigger();
					diag({ phase: "gear", fallback: trigger === null ? "no-trigger" : "click-trigger" });
					if (trigger !== null) trigger.click();
				}
				if (tries < 14) window.setTimeout(step, 150);
			};
			step();
		}

		function sync() {
			const entries = rowEntries();
			if (entries.length < MIN_ROWS || entries.length > MAX_ROWS) {
				restore();
				return;
			}
			const foldable = entries.filter((entry) => isFoldable(entry) && !isActive(entry.row));
			if (foldable.length === 0) {
				restore();
				return;
			}
			ensureStyle();
			const first = entries[0];
			const host = first.target.parentElement;
			if (host === null) {
				restore();
				return;
			}
			let bar = document.querySelector("[" + BAR_ATTR + "]");
			if (bar === null) {
				bar = buildToggle(first.row);
				host.insertBefore(bar, first.target);
			} else if (bar.parentElement !== host || bar.nextElementSibling !== first.target) {
				if (bar.parentElement !== null && bar.parentElement !== host) bar.remove();
				host.insertBefore(bar, first.target);
			}
			const toggle = bar.querySelector("button[" + TOGGLE_ATTR + "]");
			if (toggle === null) {
				restore();
				return;
			}
			const text = collapsed ? "更多 (" + foldable.length + ")" : "收起";
			const wantChevron = collapsed ? "down" : "up";
			toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
			if (toggle.getAttribute("aria-label") !== text) {
				toggle.setAttribute("aria-label", text);
				toggle.setAttribute("title", text);
			}
			// 只在方向真的变了才重画。费用卡片的数字每轮都在变 → sync 会被叫得很勤；
			// 若每次都重设 innerHTML，图标节点就被换掉，正好按在它上面的那次点击会被浏览器丢掉
			// （按下的是旧节点、松开时它已经不在文档里了）——就是「小三角点了没反应」的原因。
			const glyph = toggle.firstElementChild;
			if (glyph !== null && glyph.getAttribute("data-dsh-fold-chevron") !== wantChevron) {
				glyph.innerHTML = collapsed ? CHEVRON_DOWN : CHEVRON_UP;
				glyph.setAttribute("data-dsh-fold-chevron", wantChevron);
			}
			const label = toggle.querySelector(".dsh-fold-label");
			if (label !== null && label.textContent !== text) label.textContent = text;
			if (toggle.getAttribute("data-dsh-fold-bound") !== "1") {
				toggle.setAttribute("data-dsh-fold-bound", "1");
				toggle.addEventListener("click", onToggleClick);
			}
			for (const entry of entries) {
				if (collapsed && isFoldable(entry) && !isActive(entry.row)) entry.target.setAttribute(HIDDEN_ATTR, "");
				else entry.target.removeAttribute(HIDDEN_ATTR);
			}
		}

		/** 摘掉自己加的东西（别人的节点只清属性，不删）。 */
		function restore() {
			for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) el.removeAttribute(HIDDEN_ATTR);
			for (const el of document.querySelectorAll("[" + BAR_ATTR + "], button[" + TOGGLE_ATTR + "], button[" + GEAR_ATTR + "]")) el.remove();
		}

		function schedule() {
			if (timer !== 0) return;
			timer = window.setTimeout(() => {
				timer = 0;
				sync();
			}, DEBOUNCE_MS);
		}

		/** 折叠开关自己的点击处理（除了文档级代理，还直接挂在按钮上，双保险）。 */
		function onToggleClick(event) {
			event.preventDefault();
			event.stopPropagation();
			collapsed = !collapsed;
			writeState();
			sync();
		}

		function onClick(event) {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest("button[" + TOGGLE_ATTR + "]") !== null) {
				onToggleClick(event);
				return;
			}
			if (collapsed || conf.autoHide !== true) return;
			for (const entry of rowEntries()) {
				if (entry.row === target || entry.row.contains(target)) {
					collapsed = true;
					writeState();
					window.setTimeout(sync, 0);
					return;
				}
			}
		}

		/** 设置分区里的界面：用原生 DOM 搭（不依赖任何组件库），勾选立即生效。 */
		function buildSettings(host) {
			host.textContent = "";
			const title = document.createElement("h3");
			title.textContent = "侧栏收纳";
			const hint = document.createElement("p");
			hint.textContent = "下面是所有插件往侧栏加的东西。勾上的会被收进侧栏那个「更多」按钮里，没勾的一直留在外面；改完立即生效，刷新后还记得。";
			host.appendChild(title);
			host.appendChild(hint);

			const entries = rowEntries();
			if (entries.length === 0) {
				const none = document.createElement("p");
				none.textContent = "现在没扫到可收纳的入口（侧栏还没渲染出来，或当前页不是主界面）。";
				host.appendChild(none);
			} else {
				const list = document.createElement("div");
				list.className = "dsh-fold-list";
				for (const entry of entries) {
					const row = document.createElement("label");
					row.className = "dsh-fold-row";
					const box = document.createElement("input");
					box.type = "checkbox";
					box.checked = isFoldable(entry);
					box.addEventListener("change", () => {
						setFoldable(entry.key, box.checked);
						sync();
						updateTags(host);
					});
					const text = document.createElement("span");
					text.className = "k";
					text.textContent = entry.label;
					text.title = entry.label;
					row.appendChild(box);
					row.appendChild(text);
					if (entry.defaultFold !== true) {
						const tag = document.createElement("span");
						tag.className = "dsh-fold-tag";
						tag.textContent = "默认不收";
						row.appendChild(tag);
					}
					list.appendChild(row);
				}
				host.appendChild(list);
			}

			const def = document.createElement("label");
			def.className = "dsh-fold-row";
			const dbox = document.createElement("input");
			dbox.type = "checkbox";
			dbox.checked = collapsed;
			dbox.addEventListener("change", () => {
				collapsed = dbox.checked;
				writeState();
				sync();
			});
			const dtext = document.createElement("span");
			dtext.className = "k";
			dtext.textContent = "默认收起（不勾就是默认展开）";
			def.appendChild(dbox);
			def.appendChild(dtext);
			host.appendChild(def);

			const auto = document.createElement("label");
			auto.className = "dsh-fold-row";
			const abox = document.createElement("input");
			abox.type = "checkbox";
			abox.checked = conf.autoHide === true;
			abox.addEventListener("change", () => {
				setConf({ picked: conf.picked, autoHide: abox.checked });
			});
			const atext = document.createElement("span");
			atext.className = "k";
			atext.textContent = "点完入口后自动收起（默认关：点完一直展开，要收起再点一次「收起」）";
			auto.appendChild(abox);
			auto.appendChild(atext);
			host.appendChild(auto);

			const acts = document.createElement("div");
			acts.className = "dsh-fold-actions";
			const button = (text, run) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = "dsh-fold-btn";
				b.textContent = text;
				b.addEventListener("click", () => {
					run();
					sync();
					buildSettings(host);
				});
				return b;
			};
			acts.appendChild(
				button("全部收进去", () => {
					const picked = {};
					for (const entry of rowEntries()) picked[entry.key] = true;
					setConf({ picked, autoHide: conf.autoHide === true });
				}),
			);
			acts.appendChild(button("全部留在外面", () => setConf({ picked: {}, autoHide: conf.autoHide === true })));
			acts.appendChild(
				button("恢复默认", () => {
					setConf({ picked: null, autoHide: false });
					collapsed = true;
					writeState();
				}),
			);
			host.appendChild(acts);

			// 诊断回显：改不动的地方一眼能看出是哪一层包错了
			const diag = document.createElement("details");
			const summary = document.createElement("summary");
			summary.textContent = "诊断信息（认不出的入口点这里，截图给我）";
			summary.style.cursor = "pointer";
			const pre = document.createElement("pre");
			pre.style.cssText = "white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.6;margin:6px 0 0;color:var(--dsw-alias-label-secondary)";
			pre.textContent = "看不到内容就刷新一次页面。扫描时间：" + new Date().toLocaleTimeString() + "\n" + describeDom();
			diag.appendChild(summary);
			diag.appendChild(pre);
			host.appendChild(diag);
		}

		/** 勾选变化后，把「默认不收」小标签同步一下（它只表示默认口径，不随勾选变）。 */
		function updateTags(host) {
			const rows = host.querySelectorAll(".dsh-fold-row");
			const entries = rowEntries();
			for (let i = 0; i < entries.length && i < rows.length; i += 1) {
				const tag = rows[i].querySelector(".dsh-fold-tag");
				const shouldShow = entries[i].defaultFold !== true;
				if (shouldShow && tag === null) {
					const span = document.createElement("span");
					span.className = "dsh-fold-tag";
					span.textContent = "默认不收";
					rows[i].appendChild(span);
				} else if (!shouldShow && tag !== null) {
					tag.remove();
				}
			}
		}

		function SettingsPanel() {
			const hostRef = react.useRef(null);
			react.useEffect(() => {
				const host = hostRef.current;
				if (host !== null) buildSettings(host);
			}, []);
			return react.createElement("div", { className: "dsh-fold-settings", ref: hostRef });
		}

		function apply(ctx) {
			let stopped = false;
			const stop = () => {
				if (stopped) return;
				stopped = true;
				document.removeEventListener("click", onClick, true);
				if (observer !== null) {
					observer.disconnect();
					observer = null;
				}
				if (timer !== 0) {
					window.clearTimeout(timer);
					timer = 0;
				}
				restore();
			};
			ensureStyle();
			document.addEventListener("click", onClick, true);
			// 只对「和我们有关的变动」重算：费用卡片数字在不停地变，那种文字变动不该带着我们空转
			const relevant = [ROW_SELECTOR, FOOTER_SELECTOR, LIST_SELECTOR, ENTRY_SELECTOR].join(", ");
			observer = new MutationObserver((records) => {
				for (const record of records) {
					if (record.type === "characterData") continue;
					if (record.type === "attributes") {
						// 只关心「哪一行是当前打开的」这类标记，别的（包括我自己打的属性）忽略
						const el = record.target;
						const attr = record.attributeName;
						if (el instanceof Element && (attr === "aria-current" || attr === "class") && el.matches(ROW_SELECTOR)) schedule();
						continue;
					}
					const target = record.target;
					if (target instanceof Element && (target.matches(LIST_SELECTOR) || target.matches(FOOTER_SELECTOR) || target.matches(COLUMN_SELECTOR))) {
						schedule();
						return;
					}
					for (const node of record.addedNodes) {
						if (node instanceof Element && (node.matches(relevant) || node.querySelector(relevant) !== null)) {
							schedule();
							return;
						}
					}
					for (const node of record.removedNodes) {
						if (node instanceof Element) {
							schedule();
							return;
						}
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "class"] });
			schedule();
			// 设置 → 「侧栏收纳」：走官方 settings.section 插槽
			try {
				const slots = ctx !== null && typeof ctx === "object" ? (ctx.slots ?? (typeof ctx.get === "function" ? ctx.get("slots") : null)) : null;
				if (slots !== null && typeof slots.inject === "function") {
					slotsRef = slots;
					diag({ phase: "load", shell: settingsShell() !== null });
					slots.inject("settings.section", () =>
						slots.register(
							{
								name: "settings.section",
								id: SECTION_ID,
								order: 50,
								label: () => "侧栏收纳",
							},
							() => react.createElement(SettingsPanel),
						),
					);
				}
			} catch (error) {
				console.warn("[dsh-sidebar-fold] 设置分区注册失败", error);
			}
			if (ctx !== null && typeof ctx === "object" && typeof ctx.effect === "function") {
				ctx.effect(() => stop, "dsh-sidebar-fold: sidebar entries");
			}
			return stop;
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
