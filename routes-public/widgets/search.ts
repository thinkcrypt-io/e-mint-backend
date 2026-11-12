/**
 * The Search widget (docs/search SI-07), served at GET /public/widgets/search.js and loaded by mint.js when a
 * page has `<div data-mint="search"></div>`. Only for e-commerce stores; it asks the store's own search
 * (GET /public/api/store/search, /suggest, /popular), so typos, Banglish, synonyms and the store's search rules
 * all apply.
 *
 *   layout icon     a header button that opens a search dialog (also Mint.search.open(q) from the page's code)
 *   layout box      a search box in place
 *   layout results  the results page: reads ?q=, filters, chips for what the words were read as, sort, pages
 *
 * Both the dialog and the box suggest as the shopper types (a combobox: arrows, Enter, Esc; popular searches
 * when empty). Enter goes to the results page (option resultsUrl). Opening a result, adding it to the bag and the
 * order carry the search's id (Mint.search in mint.js); the results page tells the page's pixels
 * (view_search_results / Search). Plain ES5-style JavaScript, no eval.
 */
export const SEARCH_WIDGET_JS = `(function () {
	'use strict';
	var Mint = window.Mint;
	if (!Mint || !Mint.define || Mint.__searchUi) return;
	Mint.__searchUi = true;
	var el = Mint.ui.el, S = Mint.search;

	var EXTRA = '.sbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;min-width:40px;padding:0 10px;border:1px solid var(--b);border-radius:var(--r);background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}' +
		'.sbtn:focus-visible,.opt:focus-visible{outline:2px solid var(--p);outline-offset:2px}' +
		'.ico{width:18px;height:18px;flex:none}' +
		'.sform{position:relative;display:flex;align-items:center}.sform .ico{position:absolute;left:12px;color:var(--m);pointer-events:none}' +
		'.sform .input{height:44px;padding-left:38px;font-size:15px}.sform .input::-webkit-search-cancel-button{cursor:pointer}' +
		'.box{position:relative;max-width:460px}' +
		'.list{margin-top:8px;max-height:min(60vh,440px);overflow:auto}' +
		'.box .list{position:absolute;left:0;right:0;top:100%;z-index:2147483000;padding:6px;background:var(--bg);border:1px solid var(--b);border-radius:var(--r);box-shadow:0 12px 32px rgba(0,0,0,.18)}' +
		'.gh{padding:8px 10px 4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--m)}' +
		'.opt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r);font-size:14px;cursor:pointer}' +
		'.opt[aria-selected=true]{background:var(--f);box-shadow:inset 0 0 0 1px var(--b)}' +
		'.opt img,.opt .ph{width:36px;height:36px;border-radius:calc(var(--r) / 2);object-fit:cover;background:var(--f);border:1px solid var(--b);flex:none}' +
		'.opt .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.opt .pr{color:var(--m);font-size:13px}' +
		'.opt mark{background:none;color:inherit;font-weight:700}.none{padding:12px 10px;color:var(--m);font-size:14px}' +
		'.scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483000}' +
		'.dlg{position:fixed;left:50%;top:8vh;transform:translateX(-50%);width:640px;max-width:calc(100vw - 24px);padding:14px;background:var(--bg);color:var(--fg);border:1px solid var(--b);border-radius:calc(var(--r) + 4px);z-index:2147483001;box-shadow:0 24px 60px rgba(0,0,0,.3)}' +
		'.dlg .top{display:flex;gap:8px;align-items:flex-start}.dlg .inbox{flex:1;min-width:0}' +
		'.x{width:40px;height:40px;border:0;border-radius:var(--r);background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;flex:none}' +
		'@media (max-width:560px){.dlg{top:0;width:100vw;max-width:100vw;border-radius:0;border-width:0 0 1px}}' +
		'.res{display:block}.rhead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}' +
		'.rtitle{margin:0;font-size:22px;font-weight:700}.rtitle:focus{outline:none}.note{margin:4px 0;font-size:14px;color:var(--m)}' +
		'.note button{background:none;border:0;padding:0;color:var(--p);font:inherit;font-weight:600;text-decoration:underline;cursor:pointer}' +
		'.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:14px 0}' +
		'.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
		'.chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 12px;border:1px solid var(--b);border-radius:999px;background:var(--f);color:inherit;font:inherit;font-size:13px;cursor:pointer}' +
		'.chip span{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:14px;line-height:1}.chip:hover span{background:var(--b)}' +
		'.chip.plain{padding:0 12px}' +
		'.sel{height:36px;padding:0 10px;border:1px solid var(--b);border-radius:var(--r);background:var(--f);color:inherit;font:inherit;font-size:14px}' +
		'.lay{display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px;align-items:start}.lay.nof{grid-template-columns:minmax(0,1fr)}' +
		'@media (max-width:760px){.lay{grid-template-columns:minmax(0,1fr);gap:12px}}' +
		'.filt summary{font-weight:600;font-size:14px;cursor:pointer;padding:6px 0}.facet{border-top:1px solid var(--b);padding:10px 0}' +
		'.facet h4{margin:0 0 6px;font-size:13px;font-weight:700}' +
		'.fo{display:flex;justify-content:space-between;gap:8px;width:100%;padding:5px 0;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}' +
		'.fo .c{color:var(--m);font-size:12px}.fo[aria-pressed=true]{font-weight:700}.fo[aria-pressed=true]:before{content:"✓ "}' +
		'.prow{display:flex;gap:6px;align-items:center}.prow .input{height:34px;padding:0 8px;font-size:13px}.prow .btn{height:34px;padding:0 10px;font-size:13px}' +
		'.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px;list-style:none;margin:0;padding:0}' +
		'.pc{display:block;color:inherit;text-decoration:none}.pc:focus-visible{outline:2px solid var(--p);outline-offset:4px;border-radius:var(--r)}' +
		'.pimg{position:relative;aspect-ratio:1/1;border-radius:var(--r);overflow:hidden;background:var(--f);border:1px solid var(--b)}' +
		'.pimg img{width:100%;height:100%;object-fit:cover;display:block}' +
		'.tag{position:absolute;left:8px;top:8px;padding:2px 8px;border-radius:999px;background:var(--p);color:var(--pf);font-size:11px;font-weight:700}.tag.out{background:var(--fg);color:var(--bg)}' +
		'.pn{margin:8px 0 2px;font-size:14px;font-weight:600;line-height:1.3}.pp{font-size:14px}.was{margin-left:6px;color:var(--m);text-decoration:line-through;font-size:13px}' +
		'.pb{font-size:12px;color:var(--m)}' +
		'.pager{display:flex;justify-content:center;align-items:center;gap:14px;margin:26px 0 6px;font-size:14px}' +
		'.busy .cards{opacity:.5;transition:opacity .15s}.empty{padding:24px 0}.sec{margin:28px 0 12px;font-size:16px;font-weight:700}' +
		'.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';

	var ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
	function icon() { var s = el('span'); s.innerHTML = ICON; return s.firstChild; }
	function draw(host, theme, inline) {
		var body = Mint.ui.shadow(host, theme), p = Mint.ui.palette(theme, host);
		var vars = ':host{--bg:' + p.bg + ';--fg:' + p.fg + ';--m:' + p.muted + ';--b:' + p.border + ';--f:' + p.field + ';--e:' + p.err + ';--p:' + p.primary + ';--pf:' + p.primaryFg + ';--r:' + p.radius + (inline ? ';display:inline-block' : '') + '}';
		body.parentNode.insertBefore(el('style', null, { text: vars + EXTRA }), body);
		return body;
	}
	function fill(t, map) { return String(t || '').replace(/\\{(\\w+)\\}/g, function (m, k) { return map && map[k] != null ? map[k] : m; }); }
	/** Only a page on the site or a web address — never a script. */
	function safeUrl(u) { u = String(u || '').trim(); return /^(\\/(?!\\/)|https?:\\/\\/)/i.test(u) ? u : ''; }
	function uid() { return 'ms' + Math.random().toString(36).slice(2, 9); }
	var currency = null;
	function money(n, cfg) {
		if (!currency) currency = (cfg.shop && cfg.shop.currency) || 'USD';
		return Mint.money(n, currency);
	}
	var storeAsked = null;
	function store() {
		if (!storeAsked) storeAsked = Mint.api('store').then(Mint.json).then(function (r) { if (r.currency) currency = r.currency; return r; }, function () { return {}; });
		return storeAsked;
	}
	var popularAsked = null;
	function popular() {
		if (!popularAsked) popularAsked = Mint.api('store/search/popular?limit=8').then(Mint.json).then(function (r) { return (r.queries || []).map(function (x) { return x.q; }); }, function () { return Mint.preview ? ['candles', 'mugs', 'gift sets'] : []; });
		return popularAsked;
	}
	function whoQuery() { var w = S.who(), out = ''; if (w.visitor) out += '&visitor=' + encodeURIComponent(w.visitor); if (w.session) out += '&session=' + encodeURIComponent(w.session); return out; }

	/* ------------------------------------------------------------ addresses */
	function productHref(o, p) {
		var u = safeUrl(o.productUrl) || '/products/{slug}';
		return u.replace('{slug}', encodeURIComponent(p.slug || p._id)).replace('{id}', encodeURIComponent(p._id));
	}
	function resultsPath(o) { return safeUrl(o.resultsUrl) || '/search'; }
	function resultsHref(o, params) {
		var u = resultsPath(o), qs = new URLSearchParams();
		Object.keys(params || {}).forEach(function (k) { if (params[k] !== '' && params[k] != null) qs.set(k, params[k]); });
		var s = qs.toString();
		return s ? u + (u.indexOf('?') < 0 ? '?' : '&') + s : u;
	}
	/** The results page: here (a results widget on this page) without reloading, or opened. */
	var resultsHere = 0;
	function toResults(o, params) {
		var href = resultsHref(o, params);
		var target;
		try { target = new URL(href, location.href); } catch (e) { location.href = href; return; }
		if (resultsHere && target.origin === location.origin && target.pathname === location.pathname) {
			history.pushState(null, '', target.pathname + target.search + location.hash);
			Mint.emit('search:navigate', {});
			return;
		}
		location.href = href;
	}

	/* ------------------------------------------------------------ the box, with suggestions */
	function demoSuggest(q) {
		return { queries: [q + ' set', q + ' gift'], products: [{ _id: 'demo-1', name: 'Fig & cedar candle', price: 28 }, { _id: 'demo-2', name: 'Speckled mug', price: 22 }], categories: [{ _id: 'demo-c', name: 'Home', count: 12 }], brands: [] };
	}
	/** A search form whose box suggests as the shopper types. onGo runs before leaving (the dialog closes). */
	function searchBox(cfg, w, opts) {
		var t = w.texts, o = w.options, id = uid();
		var input = el('input', 'input', { type: 'search', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id + '-l', 'aria-label': t.placeholder, placeholder: t.placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', maxlength: '100' });
		var list = el('div', 'list', { id: id + '-l', role: 'listbox', 'aria-label': t.button });
		list.hidden = true;
		var status = el('div', 'sr', { role: 'status', 'aria-live': 'polite' });
		var form = el('form', 'sform', { role: 'search', action: '#' }, [icon(), input]);
		var wrap = el('div', opts.cls || '', null, [form, list, status]);
		var items = [], active = -1, seq = 0, timer = null, shown = '';

		function setActive(i) {
			active = i;
			items.forEach(function (it, j) { it.node.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
			if (i >= 0) { input.setAttribute('aria-activedescendant', items[i].node.id); try { items[i].node.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
			else input.removeAttribute('aria-activedescendant');
		}
		function open(on) { list.hidden = !on; input.setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on) setActive(-1); }
		function marked(name, q) {
			var n = el('span', 'nm'), lower = String(name).toLowerCase(), at = q ? lower.indexOf(q.toLowerCase()) : -1;
			if (at < 0) { n.textContent = name; return n; }
			n.appendChild(document.createTextNode(name.slice(0, at)));
			n.appendChild(el('mark', null, { text: name.slice(at, at + q.length) }));
			n.appendChild(document.createTextNode(name.slice(at + q.length)));
			return n;
		}
		function option(kids, act) {
			var n = el('div', 'opt', { role: 'option', id: id + '-o' + items.length, 'aria-selected': 'false' }, kids);
			n.onmousedown = function (e) { e.preventDefault(); };
			n.onclick = act;
			items.push({ node: n, act: act });
			return n;
		}
		function group(title, nodes) {
			if (!nodes.length) return;
			var gid = id + '-g' + list.childNodes.length;
			list.appendChild(el('div', 'grp', { role: 'group', 'aria-labelledby': gid }, [el('div', 'gh', { id: gid, text: title })].concat(nodes)));
		}
		function go(params, typed) {
			open(false);
			if (params.q) S.searched(params.q);
			if (opts.onGo) opts.onGo();
			toResults(o, params);
		}
		function show(s, q) {
			list.innerHTML = ''; items = []; active = -1;
			if (!q) {
				group(t.popular, (s.queries || []).map(function (x) { return option([icon(), el('span', 'nm', { text: x })], function () { S.track([{ type: 'suggest', q: x }]); go({ q: x }); }); }));
			} else {
				group(t.queries, (s.queries || []).slice(0, 5).map(function (x) {
					return option([icon(), marked(x, q)], function () { S.track([{ type: 'suggest', q: x }]); go({ q: x }); });
				}));
				group(t.products, (s.products || []).map(function (p) {
					var img = safeUrl(p.image) ? el('img', '', { src: p.image, alt: '', loading: 'lazy' }) : el('span', 'ph');
					var price = p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price;
					return option([img, marked(p.name || '', q), price != null ? el('span', 'pr', { text: money(price, cfg) }) : null], function () {
						open(false);
						S.track([{ type: 'suggest', q: q, product: p._id }]);
						if (opts.onGo) opts.onGo();
						location.href = productHref(o, p);
					});
				}));
				group(t.categories, (s.categories || []).concat(s.brands || []).map(function (c) {
					var isBrand = (s.brands || []).indexOf(c) >= 0;
					return option([el('span', 'ph'), el('span', 'nm', { text: c.name }), c.count ? el('span', 'pr', { text: String(c.count) }) : null], function () {
						S.track([{ type: 'suggest', q: q }]);
						var params = {}; params[isBrand ? 'brand' : 'category'] = c._id;
						go(params);
					});
				}));
				list.appendChild(option([icon(), el('span', 'nm', { text: t.seeAll + ' — “' + q + '”' })], function () { go({ q: q }); }));
			}
			var any = items.length > 0;
			open(any);
			status.textContent = any && q ? (s.products || []).length + ' ' + t.products.toLowerCase() : '';
		}
		function ask() {
			var q = input.value.trim(), mine = ++seq;
			if (q === shown && !list.hidden) return;
			shown = q;
			if (!q) { popular().then(function (qs) { if (mine === seq && document.activeElement !== null) show({ queries: qs }, ''); }); return; }
			Mint.api('store/search/suggest?q=' + encodeURIComponent(q)).then(Mint.json).then(function (r) { if (mine === seq) show(r, q); }, function () { if (mine === seq) Mint.preview ? show(demoSuggest(q), q) : open(false); });
		}
		input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(ask, 140); });
		input.addEventListener('focus', function () { shown = null; ask(); });
		input.addEventListener('blur', function () { setTimeout(function () { open(false); }, 120); });
		input.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				if (list.hidden) { shown = null; ask(); return; }
				e.preventDefault();
				var n = items.length;
				if (n) setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1));
			} else if (e.key === 'Enter' && active >= 0 && !list.hidden) {
				e.preventDefault();
				items[active].act();
			} else if (e.key === 'Escape') {
				if (!list.hidden) { e.preventDefault(); e.stopPropagation(); open(false); }
				else if (opts.onEscape) { e.preventDefault(); opts.onEscape(); }
			}
		});
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var q = input.value.trim();
			if (!q) { input.focus(); return; }
			go({ q: q });
		});
		return { node: wrap, input: input };
	}

	/* ------------------------------------------------------------ the header icon and its dialog */
	var opener = null;
	function iconLayout(host, ctx, cfg, w) {
		var body = draw(host, ctx.theme, true), t = w.texts;
		var btn = el('button', 'sbtn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': t.button }, [icon()]);
		body.appendChild(btn);
		var layer = null, lastFocus = null;
		function close() {
			if (!layer) return;
			layer.forEach(function (n) { n.remove(); });
			layer = null;
			document.documentElement.style.overflow = '';
			document.removeEventListener('keydown', onKey, true);
			if (lastFocus && lastFocus.focus) lastFocus.focus();
		}
		function onKey(e) {
			if (e.key === 'Escape') { e.preventDefault(); close(); }
			if (e.key === 'Tab' && layer) {
				var f = layer[1].querySelectorAll('input,button');
				var first = f[0], last = f[f.length - 1], at = body.getRootNode().activeElement;
				if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
				else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
			}
		}
		function open(q) {
			if (layer) return;
			lastFocus = btn;
			var scrim = el('div', 'scrim');
			var dlg = el('div', 'dlg', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t.button });
			var box = searchBox(cfg, w, { cls: 'inbox', onGo: close, onEscape: close });
			var x = el('button', 'x', { type: 'button', 'aria-label': t.close, text: '×' });
			x.onclick = close;
			scrim.onclick = close;
			dlg.appendChild(el('div', 'top', null, [box.node, x]));
			body.appendChild(scrim); body.appendChild(dlg);
			layer = [scrim, dlg];
			document.documentElement.style.overflow = 'hidden';
			document.addEventListener('keydown', onKey, true);
			if (q) box.input.value = q;
			box.input.focus();
		}
		btn.onclick = function () { open(''); };
		if (!opener) { opener = open; Mint.on('search:open', function (d) { opener(d && d.q); }); }
	}

	/* ------------------------------------------------------------ the results page */
	var KEYS = ['q', 'page', 'sort', 'category', 'brand', 'collection', 'price[gte]', 'price[lte]', 'inStock', 'onSale'];
	function managed(k) { return KEYS.indexOf(k) >= 0 || k.indexOf('option.') === 0; }
	function readState() {
		var s = {}, sp = new URLSearchParams(location.search);
		sp.forEach(function (v, k) { if (managed(k) && v !== '') s[k] = v; });
		return s;
	}
	function writeState(s, replace) {
		var sp = new URLSearchParams(location.search), drop = [];
		sp.forEach(function (v, k) { if (managed(k)) drop.push(k); });
		drop.forEach(function (k) { sp.delete(k); });
		Object.keys(s).forEach(function (k) { if (s[k] !== '' && s[k] != null) sp.set(k, s[k]); });
		var qs = sp.toString();
		history[replace ? 'replaceState' : 'pushState'](null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
	}
	function listOf(v) { return String(v || '').split(',').filter(Boolean); }
	function demoAnswer(s) {
		var names = ['Fig & cedar candle', 'Speckled mug', 'Linen napkins', 'Oak serving board', 'Brass bell', 'Wool throw'];
		return { doc: names.map(function (n, i) { return { _id: 'demo-' + i, name: n, price: 20 + i * 7, salePrice: i === 1 ? 18 : null, inStock: i !== 4, category: { _id: 'c', name: 'Home' } }; }), total: 6, page: 1, totalPages: 1,
			facets: { categories: [{ _id: 'c', name: 'Home', count: 6 }], brands: [], collections: [], price: { min: 20, max: 55 }, options: [], inStock: 5, onSale: 1 }, understood: s.q ? { words: s.q } : null };
	}

	function resultsLayout(host, ctx, cfg, w) {
		var body = draw(host, ctx.theme), t = w.texts, o = w.options;
		resultsHere++;
		var root = el('div', 'res');
		body.appendChild(root);
		var seq = 0, last = null, state = readState();
		var SORTS = [['relevance', t.relevance], ['popular', t.popularSort], ['price', t.priceLow], ['-price', t.priceHigh], ['newest', t.newest]];

		function set(patch, keepPage) {
			Object.keys(patch).forEach(function (k) { if (patch[k] === '' || patch[k] == null || patch[k] === false) delete state[k]; else state[k] = String(patch[k]); });
			if (!keepPage) delete state.page;
			writeState(state);
			load(true);
		}
		function toggleIn(key, value) {
			var l = listOf(state[key]), at = l.indexOf(value);
			if (at >= 0) l.splice(at, 1); else l.push(value);
			var p = {}; p[key] = l.join(','); set(p);
		}
		/** A chip for something the words were read as: removing it searches the other words, keeping the rest. */
		function dropUnderstood(u, which) {
			var next = {};
			Object.keys(state).forEach(function (k) { if (k !== 'page') next[k] = state[k]; });
			next.q = u.words || '';
			if (which !== 'price' && u.price) { if (u.price.gte != null) next['price[gte]'] = u.price.gte; if (u.price.lte != null) next['price[lte]'] = u.price.lte; }
			if (which !== 'inStock' && u.inStock) next.inStock = '1';
			if (which !== 'onSale' && u.onSale) next.onSale = '1';
			if (which !== 'brand' && u.brand) next.brand = u.brand._id;
			if (which !== 'category' && u.category) next.category = u.category._id;
			if (which !== 'sort' && u.sort && !next.sort) next.sort = u.sort;
			(u.options || []).forEach(function (x, i) { if (x.as === 'filter' && which !== 'o' + i) { var k = 'option.' + x.name.toLowerCase(); next[k] = listOf(next[k]).concat([x.value]).join(','); } });
			state = {};
			Object.keys(next).forEach(function (k) { if (next[k] !== '' && next[k] != null) state[k] = String(next[k]); });
			writeState(state);
			load(true);
		}
		function chip(label, onRemove) {
			var b = el('button', 'chip', { type: 'button', 'aria-label': label + ' — remove' }, [label, el('span', null, { text: '×', 'aria-hidden': 'true' })]);
			b.onclick = onRemove;
			return b;
		}
		function priceLabel(gte, lte) {
			if (gte != null && lte != null) return money(Number(gte), cfg) + ' – ' + money(Number(lte), cfg);
			return lte != null ? t.price + ' ≤ ' + money(Number(lte), cfg) : t.price + ' ≥ ' + money(Number(gte), cfg);
		}
		function nameIn(list, id) { var hit = (list || []).filter(function (x) { return String(x._id) === String(id); })[0]; return hit ? hit.name : null; }

		function card(p, searchId) {
			var sale = p.salePrice != null && p.price != null && p.salePrice < p.price;
			var now = sale ? p.salePrice : p.price, was = sale ? p.price : p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : null;
			var pic = el('div', 'pimg', null, [safeUrl(p.image) ? el('img', '', { src: p.image, alt: '', loading: 'lazy' }) : null,
				p.inStock === false ? el('span', 'tag out', { text: t.outOfStock }) : sale || was ? el('span', 'tag', { text: t.sale }) : null]);
			var a = el('a', 'pc', { href: productHref(o, p) }, [pic, el('p', 'pn', { text: p.name || '' }),
				el('div', 'pp', null, [now != null ? money(now, cfg) : '', was ? el('span', 'was', { text: money(was, cfg) }) : null]),
				p.brand && p.brand.name ? el('div', 'pb', { text: p.brand.name }) : null]);
			function clicked() { S.clicked(searchId, p._id); }
			a.addEventListener('click', clicked);
			a.addEventListener('auxclick', clicked);
			return el('li', '', null, [a]);
		}
		function grid(docs, searchId) { return el('ul', 'cards', null, docs.map(function (p) { return card(p, searchId); })); }

		function facetGroup(title, nodes) { return nodes.length ? el('div', 'facet', null, [el('h4', null, { text: title })].concat(nodes)) : null; }
		function facetButton(label, count, pressed, act) {
			var b = el('button', 'fo', { type: 'button', 'aria-pressed': pressed ? 'true' : 'false' }, [el('span', null, { text: label }), count != null ? el('span', 'c', { text: String(count) }) : null]);
			b.onclick = act;
			return b;
		}
		function filters(f) {
			if (!o.showFilters || !f) return null;
			var parts = [];
			[['category', 'categories', t.category], ['brand', 'brands', t.brand]].forEach(function (g) {
				var picked = listOf(state[g[0]]);
				parts.push(facetGroup(g[2], (f[g[1]] || []).slice(0, 12).map(function (c) { return facetButton(c.name, c.count, picked.indexOf(String(c._id)) >= 0, function () { toggleIn(g[0], String(c._id)); }); })));
			});
			(f.options || []).forEach(function (g) {
				var key = 'option.' + g.key, picked = listOf(state[key]);
				parts.push(facetGroup(g.name, (g.values || []).slice(0, 16).map(function (v) { return facetButton(v.value, v.count, picked.indexOf(String(v.key)) >= 0, function () { toggleIn(key, String(v.key)); }); })));
			});
			if (f.price && f.price.min != null && f.price.max != null && f.price.max > f.price.min) {
				var lo = el('input', 'input', { type: 'number', inputmode: 'decimal', min: '0', 'aria-label': t.price + ' from', placeholder: String(Math.floor(f.price.min)) });
				var hi = el('input', 'input', { type: 'number', inputmode: 'decimal', min: '0', 'aria-label': t.price + ' to', placeholder: String(Math.ceil(f.price.max)) });
				if (state['price[gte]']) lo.value = state['price[gte]'];
				if (state['price[lte]']) hi.value = state['price[lte]'];
				var apply = el('button', 'btn', { type: 'submit', text: '→', 'aria-label': t.price });
				var pf = el('form', 'prow', null, [lo, el('span', 'c', { text: '–' }), hi, apply]);
				pf.onsubmit = function (e) {
					e.preventDefault();
					var a = lo.value === '' ? '' : Number(lo.value), b = hi.value === '' ? '' : Number(hi.value);
					if (a !== '' && b !== '' && a > b) { var x = a; a = b; b = x; }
					set({ 'price[gte]': a, 'price[lte]': b });
				};
				parts.push(facetGroup(t.price, [pf]));
			}
			var flags = [];
			if (f.inStock || state.inStock) flags.push(facetButton(t.inStock, f.inStock, !!state.inStock, function () { set({ inStock: state.inStock ? '' : '1' }); }));
			if (f.onSale || state.onSale) flags.push(facetButton(t.onSale, f.onSale, !!state.onSale, function () { set({ onSale: state.onSale ? '' : '1' }); }));
			parts.push(facetGroup(t.filters, flags));
			parts = parts.filter(Boolean);
			if (!parts.length) return null;
			var d = el('details', 'filt', null, [el('summary', null, { text: t.filters })].concat(parts));
			if (window.innerWidth > 760) d.open = true;
			return d;
		}

		function chips(r) {
			var out = [], u = r.understood, f = r.facets || {};
			if (u) {
				if (u.price && (u.price.gte != null || u.price.lte != null)) out.push(chip(priceLabel(u.price.gte, u.price.lte), function () { dropUnderstood(u, 'price'); }));
				if (u.inStock) out.push(chip(t.inStock, function () { dropUnderstood(u, 'inStock'); }));
				if (u.onSale) out.push(chip(t.onSale, function () { dropUnderstood(u, 'onSale'); }));
				if (u.brand) out.push(chip(u.brand.name, function () { dropUnderstood(u, 'brand'); }));
				if (u.category) out.push(chip(u.category.name, function () { dropUnderstood(u, 'category'); }));
				(u.options || []).forEach(function (x, i) { if (x.as === 'filter') out.push(chip(x.name + ': ' + x.value, function () { dropUnderstood(u, 'o' + i); })); });
				if (u.sort && !state.sort) { var sl = SORTS.filter(function (s) { return s[0] === u.sort; })[0]; if (sl) out.push(chip(sl[1], function () { dropUnderstood(u, 'sort'); })); }
			}
			listOf(state.category).forEach(function (id) { out.push(chip(nameIn(f.categories, id) || t.category, function () { toggleIn('category', id); })); });
			listOf(state.brand).forEach(function (id) { out.push(chip(nameIn(f.brands, id) || t.brand, function () { toggleIn('brand', id); })); });
			listOf(state.collection).forEach(function (id) { out.push(chip(nameIn(f.collections, id) || id, function () { toggleIn('collection', id); })); });
			if (state['price[gte]'] || state['price[lte]']) out.push(chip(priceLabel(state['price[gte]'] || null, state['price[lte]'] || null), function () { set({ 'price[gte]': '', 'price[lte]': '' }); }));
			if (state.inStock) out.push(chip(t.inStock, function () { set({ inStock: '' }); }));
			if (state.onSale) out.push(chip(t.onSale, function () { set({ onSale: '' }); }));
			Object.keys(state).forEach(function (k) {
				if (k.indexOf('option.') !== 0) return;
				var g = (f.options || []).filter(function (x) { return 'option.' + x.key === k; })[0];
				listOf(state[k]).forEach(function (v) {
					var val = g && (g.values || []).filter(function (x) { return String(x.key) === v; })[0];
					out.push(chip((g ? g.name : k.slice(7)) + ': ' + (val ? val.value : v), function () { toggleIn(k, v); }));
				});
			});
			var explicit = Object.keys(state).some(function (k) { return k !== 'q' && k !== 'page' && k !== 'sort'; });
			if (explicit) {
				var clear = el('button', 'link', { type: 'button', text: t.clear });
				clear.onclick = function () { state = state.q ? { q: state.q } : {}; writeState(state); load(true); };
				out.push(clear);
			}
			return out.length ? el('div', 'chips', { 'aria-label': t.filters }, out) : null;
		}

		function suggestions(into) {
			popular().then(function (qs) {
				if (!qs.length) return;
				into.appendChild(el('h3', 'sec', { text: t.popular }));
				into.appendChild(el('div', 'chips', null, qs.map(function (q) {
					var b = el('button', 'chip plain', { type: 'button', text: q });
					b.onclick = function () { state = { q: q }; S.searched(q); writeState(state); load(true); };
					return b;
				})));
			});
		}

		function render(r, focus) {
			root.innerHTML = '';
			root.className = 'res';
			var q = state.q || '';
			var title = el('h2', 'rtitle', { tabindex: '-1', text: q ? fill(t.title, { q: q }) : nameIn((r.facets || {}).categories, listOf(state.category)[0]) || t.products });
			var count = el('p', 'note', { role: 'status', 'aria-live': 'polite', text: fill(t.count, { count: r.total || 0 }) });
			root.appendChild(el('div', 'rhead', null, [title, count]));
			if (r.showing && r.showing.reason === 'meaning') root.appendChild(el('p', 'note', { text: fill(t.meaning || t.relaxed, { q: q }) }));
			else if (r.showing && r.showing.q) root.appendChild(el('p', 'note', { text: fill(t.showing, { q: r.showing.q }) }));
			else if (r.understood && r.understood.relaxed) root.appendChild(el('p', 'note', { text: t.relaxed }));
			if (r.didYouMean) {
				var dym = el('button', '', { type: 'button', text: r.didYouMean });
				dym.onclick = function () { state = { q: r.didYouMean }; S.searched(r.didYouMean); writeState(state); load(true); };
				root.appendChild(el('p', 'note', null, [t.didYouMean + ' ', dym, '?']));
			}
			var sort = el('select', 'sel', { 'aria-label': t.sort });
			SORTS.forEach(function (s) { var op = el('option', null, { value: s[0], text: s[1] }); if ((state.sort || 'relevance') === s[0]) op.selected = true; sort.appendChild(op); });
			sort.onchange = function () { set({ sort: sort.value === 'relevance' ? '' : sort.value }); };
			root.appendChild(el('div', 'bar', null, [chips(r) || el('span'), (r.doc || []).length ? sort : null]));

			var side = filters(r.facets);
			var main = el('div', 'main');
			if ((r.doc || []).length) {
				main.appendChild(grid(r.doc, r.searchId));
				if (r.totalPages > 1) {
					var page = r.page || 1;
					var prev = el('button', 'btn ghost', { type: 'button', text: t.back }), next = el('button', 'btn ghost', { type: 'button', text: t.more });
					prev.disabled = page <= 1; next.disabled = page >= r.totalPages;
					prev.onclick = function () { set({ page: page - 1 > 1 ? page - 1 : '' }, true); };
					next.onclick = function () { set({ page: page + 1 }, true); };
					main.appendChild(el('nav', 'pager', { 'aria-label': 'Pages' }, [prev, el('span', 'muted', { text: page + ' / ' + r.totalPages }), next]));
				}
			} else {
				main.appendChild(el('p', 'empty', { text: q ? fill(t.noResults, { q: q }) : fill(t.count, { count: 0 }) }));
				if (r.fallback && (r.fallback.doc || []).length) {
					main.appendChild(el('h3', 'sec', { text: t.fallback + (r.fallback.category ? ' — ' + r.fallback.category.name : '') }));
					main.appendChild(grid(r.fallback.doc, r.searchId));
				}
				suggestions(main);
			}
			root.appendChild(el('div', 'lay' + (side ? '' : ' nof'), null, [side, main]));
			if (focus) { try { host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {} title.focus({ preventScroll: true }); }
		}

		function load(focus) {
			var mine = ++seq, params = new URLSearchParams();
			Object.keys(state).forEach(function (k) { params.set(k, state[k]); });
			params.set('limit', String(o.perPage || 24));
			if (o.showFilters) params.set('facets', '1');
			root.classList.add('busy');
			root.setAttribute('aria-busy', 'true');
			if (!last) root.appendChild(el('p', 'muted', { text: t.loading }));
			store().then(function () { return Mint.api('store/search?' + params.toString() + whoQuery()); }).then(Mint.json).then(function (r) {
				if (mine !== seq) return;
				root.removeAttribute('aria-busy');
				var fresh = !last || (last.q || '') !== (state.q || '');
				// A search rule that sends these words to a page (SI-15): go there, on the first page only.
				var to = r.redirect && safeUrl(r.redirect.url);
				if (to && fresh && !state.page) { location.replace(to); return; }
				last = { q: state.q || '' };
				if (r.searchId) S.remember(r.searchId);
				if (state.q) S.viewed(state.q, r);
				render(r, focus);
			}, function (err) {
				if (mine !== seq) return;
				root.removeAttribute('aria-busy');
				if (Mint.preview) { last = { q: state.q || '' }; render(demoAnswer(state), focus); return; }
				root.innerHTML = '';
				root.appendChild(el('p', 'error', { text: err.code === 'search_off' ? 'This store’s search is switched off.' : err.message }));
			});
		}
		window.addEventListener('popstate', function () { state = readState(); load(false); });
		Mint.on('search:navigate', function () { state = readState(); load(true); });
		load(false);
	}

	Mint.config.then(function (cfg) {
		var w = cfg.widgets.search;
		if (!w) return;
		Mint.define('search', {
			mount: function (host, ctx) {
				var ww = { texts: ctx.texts, options: ctx.options };
				store();
				var layout = ctx.options.layout;
				if (layout === 'results') return resultsLayout(host, ctx, cfg, ww);
				if (layout === 'box') {
					var body = draw(host, ctx.theme);
					var q = new URLSearchParams(location.search).get('q') || '';
					var box = searchBox(cfg, ww, { cls: 'box' });
					if (q) box.input.value = q;
					body.appendChild(box.node);
					return;
				}
				iconLayout(host, ctx, cfg, ww);
			},
		});
	});
})();
`;
