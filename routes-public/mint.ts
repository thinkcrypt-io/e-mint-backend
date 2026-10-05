/**
 * The site widgets' runtime (docs/widgets W-03), served at GET /public/mint.js.
 * A tenant's site adds it once:
 *
 *   <script src="https://<api>/public/mint.js" data-project="<project public slug>" async></script>
 *
 * and places widgets anywhere: `<div data-mint="login"></div>` (or
 * `<mint-login></mint-login>`). Colours follow the project's look (Site setup →
 * Widgets); in `auto` mode a widget is light or dark to match the page it sits
 * on. The runtime asks the project which widgets are
 * switched on (GET /public/api/:slug/widgets), loads each one's script only
 * when the page has a place for it (/public/widgets/<name>.js), and mounts it
 * in a Shadow DOM so the site's CSS and the widget's never meet. Elements added
 * later (single-page apps) are picked up too. `data-*` attributes on an element
 * override that widget's options there (`data-start-with="signup"`).
 *
 * The page's own code gets `window.Mint`:
 *
 *   Mint.auth.ready / .user / .token        the signed-in customer (shared with widget.js)
 *   Mint.auth.signIn(email, password) · signUp({ name, email, password }) · signOut()
 *   Mint.auth.onChange(cb)                   on every sign-in / sign-out
 *   Mint.cart.ready / .lines / .count / .subtotal / .currency   the cart (W-05), priced by the server
 *   Mint.cart.add(productId, { variant, quantity }) · set(id, qty, variant) · remove(id, variant) · clear()
 *   Mint.cart.product(id) · format(amount) · refresh() · onChange(cb)    (also the `mint:cart` DOM event)
 *   Mint.money(amount, currency)             an amount, the visitor's way
 *   Mint.api(path, init)                     the project's public API, signed in when there's a customer
 *   Mint.on(event, cb) / Mint.emit(event, detail)   also fired as `mint:<event>` DOM events on document
 *   Mint.config                              a promise of { theme, widgets } (switched-on ones)
 *   Mint.preview                             true inside the panel's live preview (window.__MINT_PREVIEW__)
 *
 * `window.MintAuth` stays as an alias of Mint.auth for pages written for
 * widget.js. Plain ES5-style JavaScript, no dependencies, no eval.
 */
export const MINT_JS = `(function () {
	'use strict';
	if (window.Mint && window.Mint.__core) return;
	var script = document.currentScript || document.querySelector('script[data-project][src*="/public/mint.js"]');
	if (!script) return;
	var project = script.getAttribute('data-project');
	if (!project) { console.warn('MINT: add data-project="<your project slug>" to the mint.js script tag'); return; }
	var origin = new URL(script.src, location.href).origin;
	var version = (script.src.match(/[?&]v=([\\w.-]+)/) || [])[1] || '__VERSION__';
	var api = origin + '/public/api/' + encodeURIComponent(project) + '/';
	var KEY = 'mint:' + project + ':token';

	/* ------------------------------------------------------------ events */
	var listeners = {};
	function on(evt, cb) {
		(listeners[evt] = listeners[evt] || []).push(cb);
		return function () { listeners[evt] = (listeners[evt] || []).filter(function (x) { return x !== cb; }); };
	}
	function emit(evt, detail) {
		(listeners[evt] || []).slice().forEach(function (cb) { try { cb(detail); } catch (e) { console.error(e); } });
		try { document.dispatchEvent(new CustomEvent('mint:' + evt, { detail: detail })); } catch (e) {}
	}

	/* ------------------------------------------------------------ the API */
	var session = { user: null, token: null };
	function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
	function write(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {} }
	function request(path, init) {
		init = init || {};
		var headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers || {});
		if (session.token) headers.Authorization = 'Bearer ' + session.token;
		return fetch(api + String(path).replace(/^\\/+/, ''), Object.assign({}, init, { headers: headers }));
	}
	function json(res) {
		return res.json().catch(function () { return {}; }).then(function (body) {
			if (!res.ok) { var err = new Error(body.message || 'Something went wrong'); err.status = res.status; err.code = body.code; throw err; }
			return body;
		});
	}

	/* ------------------------------------------------------------ the customer */
	function setSession(user, token) {
		session.user = user; session.token = token || null; write(session.token);
		auth.user = user; auth.token = session.token;
		emit('auth', user);
	}
	var auth = {
		user: null,
		token: null,
		fetch: request,
		signIn: function (email, password) {
			return request('auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) }).then(json)
				.then(function (r) { setSession(r.customer, r.token); return r.customer; });
		},
		signUp: function (data) {
			return request('auth/register', { method: 'POST', body: JSON.stringify(data) }).then(json)
				.then(function (r) { setSession(r.customer, r.token); return r.customer; });
		},
		signOut: function () { setSession(null, null); },
		onChange: function (cb) { return on('auth', cb); },
	};
	session.token = read();
	auth.ready = session.token
		? request('auth/me').then(json).then(function (u) { setSession(u, session.token); return u; }, function () { setSession(null, null); return null; })
		: Promise.resolve(null);

	/* ------------------------------------------------------------ the cart */
	// Guests' carts live in the browser; a signed-in customer's on the server (and a guest cart joins it on sign-in).
	// Only ids, variants and quantities go out — every price comes back from the server (docs/widgets W-05).
	var CART_KEY = 'mint:' + project + ':cart';
	function readCart() { try { var v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
	function writeCart(lines) { try { lines.length ? localStorage.setItem(CART_KEY, JSON.stringify(lines)) : localStorage.removeItem(CART_KEY); } catch (e) {} }
	function bare(lines) {
		return (lines || []).filter(function (l) { return l.problem !== 'unavailable'; })
			.map(function (l) { return { product: l.product, variant: l.variant || '', quantity: l.quantity }; });
	}
	var DEMO = { PRODUCT_ID: { _id: 'PRODUCT_ID', name: 'Fig & cedar candle', price: 28, variants: [], available: true, image: '' }, 'demo-2': { _id: 'demo-2', name: 'Speckled mug', price: 22, variants: [], available: true, image: '' } };
	function demoPrice(lines) {
		var out = lines.filter(function (l) { return DEMO[l.product]; }).map(function (l) {
			var p = DEMO[l.product];
			return { product: l.product, variant: l.variant, quantity: l.quantity, name: p.name, image: '', unitPrice: p.price, total: p.price * l.quantity, stock: null };
		});
		return Promise.resolve({ lines: out, count: out.reduce(function (s, l) { return s + l.quantity; }, 0), subtotal: out.reduce(function (s, l) { return s + l.total; }, 0) });
	}
	var products = {}, formats = {}, cartQueue = Promise.resolve();
	function money(n, c) {
		if (n == null) return '';
		c = c || 'USD';
		try { formats[c] = formats[c] || new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency: c }); return formats[c].format(n); }
		catch (e) { return c + ' ' + Number(n).toFixed(2); }
	}
	var cart = {
		lines: [], count: 0, subtotal: 0, currency: '',
		onChange: function (cb) { return on('cart', cb); },
		/** A product as the widgets show it: { name, price, compareAtPrice, image, stock, variants, available }. */
		product: function (id) {
			if (preview) return Promise.resolve(DEMO[id] || DEMO.PRODUCT_ID);
			if (!products[id]) products[id] = request('shop/products/' + encodeURIComponent(id)).then(json).catch(function (e) { delete products[id]; throw e; });
			return products[id];
		},
		add: function (id, opts) {
			opts = opts || {};
			var variant = opts.variant || '', qty = Math.max(1, Math.floor(Number(opts.quantity) || 1));
			return change(function (lines) {
				var hit = lines.filter(function (l) { return l.product === String(id) && l.variant === variant; })[0];
				if (hit) hit.quantity += qty; else lines.push({ product: String(id), variant: variant, quantity: qty });
				return lines;
			});
		},
		/** Sets a line's quantity; 0 removes it. */
		set: function (id, quantity, variant) {
			quantity = Math.floor(Number(quantity) || 0);
			return change(function (lines) {
				return lines.map(function (l) { if (l.product === String(id) && l.variant === (variant || '')) l.quantity = quantity; return l; })
					.filter(function (l) { return l.quantity > 0; });
			});
		},
		remove: function (id, variant) { return cart.set(id, 0, variant); },
		clear: function () { return change(function () { return []; }); },
		/** An amount in the shop's currency, the visitor's way. */
		format: function (n) { return money(n, cart.currency || 'USD'); },
		/** Loads the cart again from the server (after checkout, or another tab). */
		refresh: function () { var run = cartQueue.then(function () { return cart.ready; }).then(function (ok) { return ok ? loadCart() : cart; }); cartQueue = run.catch(function () {}); return run; },
	};
	function applyCart(priced) {
		cart.lines = priced.lines || []; cart.count = priced.count || 0; cart.subtotal = priced.subtotal || 0;
		emit('cart', cart);
		return cart;
	}
	/** Saves the lines (signed in: on the server; a guest: in the browser) and takes the priced cart back. */
	function saveCart(lines) {
		if (preview) { demoLines = lines; return demoPrice(lines).then(applyCart); }
		if (session.user) return request('cart', { method: 'PUT', body: JSON.stringify({ lines: lines }) }).then(json).then(applyCart);
		writeCart(lines);
		if (!lines.length) return Promise.resolve(applyCart({ lines: [], count: 0, subtotal: 0 }));
		return request('cart/price', { method: 'POST', body: JSON.stringify({ lines: lines }) }).then(json).then(function (priced) {
			writeCart(bare(priced.lines));
			return applyCart(priced);
		});
	}
	var demoLines = [{ product: 'PRODUCT_ID', variant: '', quantity: 1 }, { product: 'demo-2', variant: '', quantity: 2 }];
	function loadCart() {
		if (preview) return demoPrice(demoLines).then(applyCart);
		var local = readCart();
		if (session.user && local.length)
			return request('cart/merge', { method: 'POST', body: JSON.stringify({ lines: local }) }).then(json).then(function (priced) { writeCart([]); return applyCart(priced); });
		if (session.user) return request('cart').then(json).then(applyCart);
		return saveCart(local);
	}
	function change(fn) {
		var run = cartQueue.then(function () { return cart.ready; }).then(function (ok) {
			if (!ok) { var err = new Error('The cart is switched off for this site (Site setup → Widgets).'); err.code = 'cart_off'; throw err; }
			return saveCart(fn(bare(cart.lines)));
		});
		cartQueue = run.catch(function () {});
		return run;
	}

	/* ------------------------------------------------------------ the look */
	function luminance(hex) {
		var n = parseInt(String(hex).slice(1), 16);
		var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
		return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	}
	/** The page behind a widget: dark or light, from the first background that isn't see-through; null when none is. */
	function pageIsDark(host) {
		for (var n = host; n && n.nodeType === 1; n = n.parentElement) {
			var m = getComputedStyle(n).backgroundColor.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/);
			if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) continue;
			return 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] < 128;
		}
		return null;
	}
	function palette(theme, host) {
		theme = theme || {};
		// auto: match the page the widget sits on; a see-through page follows the visitor's setting.
		var page = theme.colorMode === 'auto' || !theme.colorMode ? (host ? pageIsDark(host) : null) : null;
		var dark = theme.colorMode === 'dark' || (theme.colorMode !== 'light' && (page !== null ? page : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
		var primary = /^#[0-9a-f]{6}$/i.test(theme.primaryColor || '') ? theme.primaryColor : (dark ? '#fafafa' : '#111827');
		var base = dark
			? { bg: '#18181b', fg: '#fafafa', muted: '#a1a1aa', border: '#3f3f46', field: '#27272a', err: '#f87171', ok: '#4ade80' }
			: { bg: '#ffffff', fg: '#18181b', muted: '#71717a', border: '#e4e4e7', field: '#ffffff', err: '#dc2626', ok: '#16a34a' };
		base.primary = primary;
		base.primaryFg = luminance(primary) > 0.45 ? '#111111' : '#ffffff';
		base.radius = (theme.radius == null ? 10 : theme.radius) + 'px';
		base.font = theme.fontFamily || 'inherit';
		return base;
	}
	function css(p) {
		return ':host{display:block;font-family:' + p.font + ';color:' + p.fg + ';line-height:1.45}' +
			'*{box-sizing:border-box}' +
			'.card{max-width:380px;padding:20px;border:1px solid ' + p.border + ';border-radius:calc(' + p.radius + ' + 4px);background:' + p.bg + ';color:' + p.fg + '}' +
			'.title{margin:0 0 14px;font-size:18px;font-weight:600}' +
			'.label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}' +
			'.field{margin-bottom:12px}' +
			'.input{width:100%;height:40px;padding:0 12px;border-radius:' + p.radius + ';border:1px solid ' + p.border + ';background:' + p.field + ';color:' + p.fg + ';font:inherit;font-size:14px}' +
			'.input:focus{outline:2px solid ' + p.primary + ';outline-offset:1px}' +
			'.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 16px;border:0;border-radius:' + p.radius + ';background:' + p.primary + ';color:' + p.primaryFg + ';font:inherit;font-size:14px;font-weight:600;cursor:pointer}' +
			'.btn[disabled]{opacity:.6;cursor:default}.btn.block{width:100%}' +
			'.btn.ghost{background:transparent;color:' + p.fg + ';border:1px solid ' + p.border + '}' +
			'.link{background:none;border:0;padding:0;color:' + p.muted + ';font:inherit;font-size:13px;cursor:pointer;text-decoration:underline}' +
			'.muted{color:' + p.muted + ';font-size:13px}.error{min-height:1em;margin:0 0 10px;font-size:13px;color:' + p.err + '}' +
			'.pop{position:relative;display:inline-block}.pop .card{position:absolute;right:0;top:calc(100% + 8px);width:340px;z-index:2147483000;box-shadow:0 12px 32px rgba(0,0,0,.18)}' +
			'@media (max-width:420px){.pop .card{position:fixed;left:12px;right:12px;top:72px;width:auto}}';
	}
	function el(tag, cls, attrs, kids) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (attrs) Object.keys(attrs).forEach(function (k) { k === 'text' ? (n.textContent = attrs[k]) : n.setAttribute(k, attrs[k]); });
		(kids || []).forEach(function (k) { if (k) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
		return n;
	}
	/** A widget's own Shadow DOM, styled from the theme; returns the element to draw into. */
	function shadow(host, theme) {
		var root = host.shadowRoot || host.attachShadow({ mode: 'open' });
		root.innerHTML = '';
		root.appendChild(el('style', null, { text: css(palette(theme, host)) }));
		var body = el('div', 'mint');
		root.appendChild(body);
		return body;
	}

	/* ------------------------------------------------------------ widgets */
	var defs = {}, loading = {}, warned = {};
	// The panel's live preview (Site setup → Widgets) hands over its unsaved settings; widgets then don't sign anyone in.
	var preview = window.__MINT_PREVIEW__ && typeof window.__MINT_PREVIEW__ === 'object' ? window.__MINT_PREVIEW__ : null;
	var config = preview
		? Promise.resolve({ theme: preview.theme || {}, widgets: preview.widgets || {} })
		: fetch(api + 'widgets').then(function (r) {
			if (r.ok) return r.json();
			if (r.status === 404) { warned = null; console.warn('MINT: there is no project "' + project + '" — check data-project on the mint.js script tag'); }
			return { theme: {}, widgets: {} };
		}).catch(function () { return { theme: {}, widgets: {} }; });
	cart.ready = config.then(function (cfg) {
		if (!cfg.widgets.cart) return false;
		cart.currency = (cfg.shop && cfg.shop.currency) || (preview && preview.shop && preview.shop.currency) || 'USD';
		return auth.ready.then(loadCart).catch(function (e) { console.warn('MINT cart:', e.message); }).then(function () {
			// A sign-in brings the guest cart along; a sign-out starts an empty one.
			auth.onChange(function () { cartQueue = cartQueue.then(loadCart).catch(function (e) { console.warn('MINT cart:', e.message); }); });
			return true;
		});
	});
	function kebab(s) { return s.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }
	function selector(name) { return '[data-mint="' + name + '"],mint-' + name; }
	function optionsFor(host, base) {
		var out = Object.assign({}, base);
		Object.keys(base || {}).forEach(function (k) {
			var v = host.getAttribute('data-' + kebab(k));
			if (v == null) return;
			out[k] = typeof base[k] === 'boolean' ? v !== 'false' : typeof base[k] === 'number' ? Number(v) : v;
		});
		return out;
	}
	function mountAll(name) {
		config.then(function (cfg) {
			var w = cfg.widgets[name], def = defs[name];
			if (!w || !def) return;
			var hosts = document.querySelectorAll(selector(name));
			for (var i = 0; i < hosts.length; i++) {
				var host = hosts[i];
				if (host.__mint) continue;
				host.__mint = true;
				try { def.mount(host, { name: name, options: optionsFor(host, w.options), texts: w.texts || {}, theme: cfg.theme || {}, Mint: Mint }); }
				catch (e) { console.error('MINT ' + name + ' widget:', e); }
			}
		});
	}
	function load(name) {
		if (defs[name]) return mountAll(name);
		if (loading[name]) return;
		loading[name] = true;
		var s = document.createElement('script');
		s.src = origin + '/public/widgets/' + name + '.js?v=' + version;
		s.async = true;
		document.head.appendChild(s);
	}
	function scan(root) {
		config.then(function (cfg) {
			var found = (root.querySelectorAll ? root.querySelectorAll('[data-mint]') : []);
			var names = {};
			for (var i = 0; i < found.length; i++) names[found[i].getAttribute('data-mint')] = true;
			if (root.getAttribute && root.getAttribute('data-mint')) names[root.getAttribute('data-mint')] = true;
			// Add-to-cart buttons anywhere bring the cart widget in, with or without a cart on the page.
			if (cfg.widgets.cart && root.querySelector && root.querySelector('[data-mint-add]')) load('cart');
			Object.keys(cfg.widgets).forEach(function (name) {
				if (names[name] || (root.querySelector && root.querySelector('mint-' + name)) || (root.tagName && root.tagName.toLowerCase() === 'mint-' + name)) load(name);
			});
			Object.keys(names).forEach(function (name) {
				if (!cfg.widgets[name] && warned && !warned[name]) { warned[name] = true; console.info('MINT: the "' + name + '" widget is switched off for this project (Site setup → Widgets).'); }
			});
		});
	}

	var Mint = window.Mint = {
		__core: true,
		preview: !!preview,
		version: version,
		project: project,
		origin: origin,
		api: request,
		json: json,
		on: on,
		emit: emit,
		auth: auth,
		cart: cart,
		money: money,
		config: config,
		define: function (name, def) { defs[name] = def; mountAll(name); },
		ui: { el: el, shadow: shadow, palette: palette },
		/** Mounts widgets in elements added since (frameworks that render after load). */
		refresh: function () { scan(document); },
	};
	if (!window.MintAuth) window.MintAuth = auth;

	function start() {
		scan(document);
		if (window.MutationObserver) {
			var queued = false;
			new MutationObserver(function () {
				if (queued) return;
				queued = true;
				(window.requestAnimationFrame || setTimeout)(function () { queued = false; scan(document); });
			}).observe(document.documentElement, { childList: true, subtree: true });
		}
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})();
`;
