/**
 * The Cart widget (docs/widgets W-05), served at GET /public/widgets/cart.js
 * and loaded by mint.js when a page has `<div data-mint="cart"></div>` or any
 * `data-mint-add="<product id>"` button. Layout `button` draws a cart button
 * with a count that opens a drawer; `page` draws the cart in place (a /cart
 * page). Any element with `data-mint-add` adds that product on click
 * (`data-mint-variant`, `data-mint-quantity` optional); a product with
 * variants and none named opens a picker. The cart itself is Mint.cart (core):
 * this file only draws it. Options and texts come from Site setup → Widgets.
 */
export const CART_WIDGET_JS = `(function () {
	'use strict';
	var Mint = window.Mint;
	if (!Mint || !Mint.define || Mint.__cartUi) return;
	Mint.__cartUi = true;
	var el = Mint.ui.el, cart = Mint.cart;

	var EXTRA = '.lines{list-style:none;margin:0;padding:0}' +
		'.line{display:grid;grid-template-columns:56px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--b)}' +
		'.thumb{width:56px;height:56px;border-radius:var(--r);object-fit:cover;background:var(--f);border:1px solid var(--b)}' +
		'.name{font-size:14px;font-weight:600;margin:0}.sub{font-size:12px;color:var(--m);margin:2px 0 0}' +
		'.was{text-decoration:line-through;margin-left:6px}.warn{font-size:12px;color:var(--e);margin:4px 0 0}' +
		'.qty{display:inline-flex;align-items:center;border:1px solid var(--b);border-radius:var(--r);margin-top:8px}' +
		'.qty button{width:30px;height:30px;border:0;background:none;color:inherit;font:inherit;font-size:16px;cursor:pointer}' +
		'.qty button[disabled]{opacity:.35;cursor:default}.qty span{min-width:26px;text-align:center;font-size:13px}' +
		'.right{text-align:right;font-size:14px;font-weight:600}.right .link{display:block;margin-top:10px;font-weight:400}' +
		'.sum{display:flex;justify-content:space-between;font-size:15px;font-weight:600;margin:16px 0 4px}' +
		'.count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--p);color:var(--pf);font-size:12px;font-weight:700}' +
		'.scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483000}' +
		'.drawer{position:fixed;top:0;right:0;bottom:0;width:400px;max-width:100vw;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);z-index:2147483001;box-shadow:-12px 0 32px rgba(0,0,0,.2)}' +
		'.head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--b)}' +
		'.head .title{margin:0}.scroll{flex:1;overflow:auto;padding:0 20px}.foot{padding:16px 20px;border-top:1px solid var(--b)}' +
		'.x{width:34px;height:34px;border:0;border-radius:var(--r);background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer}' +
		'.dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 48px);overflow:auto;z-index:2147483001}' +
		'.choices{display:flex;flex-direction:column;gap:8px;margin:12px 0 14px}' +
		'.choice{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--b);border-radius:var(--r);background:var(--f);color:inherit;font:inherit;font-size:14px;cursor:pointer;text-align:left}' +
		'.choice[aria-pressed=true]{outline:2px solid var(--p);outline-offset:-1px}.choice[disabled]{opacity:.45;cursor:default}' +
		'.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:10px 16px;border-radius:var(--r);background:var(--fg);color:var(--bg);font-size:14px;z-index:2147483002;box-shadow:0 8px 24px rgba(0,0,0,.2)}' +
		'.empty{padding:28px 0;text-align:center}';

	/** A Shadow DOM styled from the theme, with the cart's own styles on top. */
	function draw(host, theme) {
		var body = Mint.ui.shadow(host, theme), p = Mint.ui.palette(theme, host);
		var vars = ':host{--bg:' + p.bg + ';--fg:' + p.fg + ';--m:' + p.muted + ';--b:' + p.border + ';--f:' + p.field + ';--e:' + p.err + ';--p:' + p.primary + ';--pf:' + p.primaryFg + ';--r:' + p.radius + '}';
		body.parentNode.insertBefore(el('style', null, { text: vars + EXTRA }), body);
		return body;
	}
	function fill(t, n) { return String(t).replace('{count}', n); }
	/** Only a page on the site or a web address — never a script. */
	function safeUrl(u) { u = String(u || '').trim(); return /^(\\/(?!\\/)|https?:\\/\\/)/i.test(u) ? u : ''; }

	Mint.config.then(function (cfg) {
		var w = cfg.widgets.cart;
		if (!w) return;
		var t = w.texts, o = w.options, theme = cfg.theme || {};

		/* ------------------------------------------- the list, shared by both layouts */
		function list(into) {
			into.innerHTML = '';
			if (!cart.lines.length) { into.appendChild(el('p', 'muted empty', { text: t.empty })); return; }
			var ul = el('ul', 'lines');
			cart.lines.forEach(function (l) {
				var info = el('div', '', null, [
					el('p', 'name', { text: l.name || t.unavailable }),
					l.variant ? el('p', 'sub', { text: l.variant }) : null,
					l.unitPrice != null ? el('p', 'sub', null, [cart.format(l.unitPrice), l.compareAtPrice ? el('span', 'was', { text: cart.format(l.compareAtPrice) }) : null]) : null,
					l.problem ? el('p', 'warn', { text: l.problem === 'sold_out' ? t.soldOut : l.problem === 'limited' ? fill(t.limited, l.quantity) : t.unavailable }) : null,
				]);
				if (l.problem !== 'unavailable' && l.problem !== 'choose_variant') {
					var minus = el('button', '', { type: 'button', 'aria-label': 'One less', text: '−' });
					var plus = el('button', '', { type: 'button', 'aria-label': 'One more', text: '+' });
					if (l.stock != null && l.quantity >= l.stock) plus.disabled = true;
					minus.onclick = function () { cart.set(l.product, l.quantity - 1, l.variant).catch(report); };
					plus.onclick = function () { cart.set(l.product, l.quantity + 1, l.variant).catch(report); };
					info.appendChild(el('div', 'qty', null, [minus, el('span', '', { text: String(l.quantity), 'aria-label': 'Quantity' }), plus]));
				}
				var remove = el('button', 'link', { type: 'button', text: t.remove });
				remove.onclick = function () { cart.remove(l.product, l.variant).catch(report); };
				var img = l.image ? el('img', 'thumb', { src: l.image, alt: '', loading: 'lazy' }) : el('div', 'thumb');
				ul.appendChild(el('li', 'line', null, [img, info, el('div', 'right', null, [l.problem && l.problem !== 'limited' ? '' : cart.format(l.total), remove])]));
			});
			into.appendChild(ul);
		}
		function footer(into) {
			into.innerHTML = '';
			if (!cart.lines.length) return;
			into.appendChild(el('div', 'sum', null, [el('span', '', { text: t.subtotal }), el('span', '', { text: cart.format(cart.subtotal) })]));
			into.appendChild(el('p', 'muted', { text: t.note, style: 'margin:0 0 12px' }));
			var url = safeUrl(o.checkoutUrl);
			if (url && cart.count) into.appendChild(el('a', 'btn block', { href: Mint.preview ? '#' : url, text: t.checkout, style: 'text-decoration:none' }));
		}
		function report(e) { toast(e && e.message ? e.message : 'Something went wrong'); }

		/* ------------------------------------------- the overlay: drawer, picker, toast */
		var layer = null, opener = null, mode = null;
		function overlay() {
			if (!layer) {
				var host = el('div', '', { 'data-mint-cart-layer': '' });
				document.body.appendChild(host);
				layer = draw(host, theme);
			}
			return layer;
		}
		function close() {
			if (!layer) return;
			layer.innerHTML = ''; mode = null;
			if (opener && opener.focus) opener.focus();
			opener = null;
		}
		function shell(panel, label) {
			var root = overlay();
			root.innerHTML = '';
			var scrim = el('div', 'scrim');
			scrim.onclick = close;
			panel.setAttribute('role', 'dialog');
			panel.setAttribute('aria-modal', 'true');
			panel.setAttribute('aria-label', label);
			root.appendChild(scrim);
			root.appendChild(panel);
		}
		function openDrawer(from) {
			opener = from || document.activeElement;
			mode = 'drawer';
			var x = el('button', 'x', { type: 'button', 'aria-label': 'Close', text: '×' });
			x.onclick = close;
			var scroll = el('div', 'scroll'), foot = el('div', 'foot');
			var panel = el('div', 'drawer', null, [el('div', 'head', null, [el('h3', 'title', { text: t.title }), x]), scroll, foot]);
			shell(panel, t.title);
			list(scroll); footer(foot);
			x.focus();
		}
		function picker(product, from, qty) {
			opener = from; mode = 'picker';
			var chosen = null;
			var add = el('button', 'btn block', { type: 'button', text: t.addButton, disabled: 'disabled' });
			var choices = el('div', 'choices');
			product.variants.forEach(function (v) {
				var gone = v.stock === 0 || (v.stock == null && product.stock === 0);
				var b = el('button', 'choice', { type: 'button', 'aria-pressed': 'false' }, [el('span', '', { text: v.name }), el('span', 'muted', { text: gone ? t.soldOut : cart.format(v.price) })]);
				if (gone) b.disabled = true;
				b.onclick = function () {
					chosen = v.name;
					var all = choices.querySelectorAll('.choice');
					for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', String(all[i] === b));
					add.disabled = false;
				};
				choices.appendChild(b);
			});
			var x = el('button', 'x', { type: 'button', 'aria-label': 'Close', text: '×' });
			x.onclick = close;
			add.onclick = function () {
				add.disabled = true;
				cart.add(product._id, { variant: chosen, quantity: qty }).then(function () { close(); added(from); }, function (e) { add.disabled = false; report(e); });
			};
			var panel = el('div', 'card dialog', null, [
				el('div', 'head', { style: 'padding:0 0 10px' }, [el('h3', 'title', { text: t.choose }), x]),
				el('p', 'name', { text: product.name }),
				choices,
				add,
			]);
			shell(panel, t.choose);
			x.focus();
		}
		var toastTimer;
		function toast(text) {
			var root = overlay();
			var old = root.querySelector('.toast');
			if (old) old.remove();
			var n = el('div', 'toast', { role: 'status', text: text });
			root.appendChild(n);
			clearTimeout(toastTimer);
			toastTimer = setTimeout(function () { n.remove(); }, 2600);
		}
		function added(from) {
			if (o.openOnAdd) openDrawer(from);
			else toast(t.added);
		}
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mode) close(); });
		cart.onChange(function () {
			if (mode !== 'drawer' || !layer) return;
			var scroll = layer.querySelector('.scroll'), foot = layer.querySelector('.foot');
			if (scroll) list(scroll);
			if (foot) footer(foot);
		});

		/* ------------------------------------------- add-to-cart buttons, anywhere */
		document.addEventListener('click', function (e) {
			var b = e.target && e.target.closest ? e.target.closest('[data-mint-add]') : null;
			if (!b || b.getAttribute('aria-busy') === 'true') return;
			e.preventDefault();
			var id = b.getAttribute('data-mint-add'), variant = b.getAttribute('data-mint-variant'), qty = Number(b.getAttribute('data-mint-quantity')) || 1;
			b.setAttribute('aria-busy', 'true');
			var done = function () { b.removeAttribute('aria-busy'); };
			var go = variant
				? cart.add(id, { variant: variant, quantity: qty }).then(function () { added(b); })
				: cart.product(id).then(function (p) {
					if (!p.available) return toast(t.soldOut);
					if (p.variants && p.variants.length) return picker(p, b, qty);
					return cart.add(id, { quantity: qty }).then(function () { added(b); });
				});
			go.then(done, function (err) { done(); report(err); });
		});

		/* ------------------------------------------- the widget itself */
		Mint.define('cart', {
			mount: function (host, ctx) {
				var body = draw(host, ctx.theme), opts = ctx.options;
				if (opts.layout === 'page') {
					var card = el('div', 'card', { style: 'max-width:640px' }), items = el('div'), foot = el('div');
					card.appendChild(el('h3', 'title', { text: t.title }));
					card.appendChild(items); card.appendChild(foot);
					body.appendChild(card);
					var paint = function () { list(items); footer(foot); };
					cart.ready.then(paint);
					cart.onChange(paint);
					return;
				}
				var count = el('span', 'count', { 'aria-hidden': 'true' });
				var icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';
				var btn = el('button', 'btn ghost', { type: 'button' });
				btn.innerHTML = icon;
				btn.appendChild(document.createTextNode(t.button));
				btn.appendChild(count);
				btn.onclick = function () { openDrawer(btn); };
				body.appendChild(btn);
				var paintCount = function () {
					count.textContent = String(cart.count);
					count.style.display = cart.count ? '' : 'none';
					btn.setAttribute('aria-label', t.button + (cart.count ? ' (' + cart.count + ')' : ''));
				};
				cart.ready.then(paintCount);
				cart.onChange(paintCount);
			},
		});
	});
})();
`;
