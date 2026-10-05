/**
 * The Checkout and Thank-you widgets (docs/widgets W-07), one script served
 * for both names (/public/widgets/checkout.js and /thanks.js). Checkout: the
 * buyer's details, the order summary from Mint.cart (the server's prices) and
 * Pay → POST checkout → the provider's own page. Thank-you: reads ?ref= from
 * the address and waits for the provider's confirmation (the webhook), then
 * shows the order. Neither ever decides a price or a status.
 */
export const CHECKOUT_WIDGET_JS = `(function () {
	'use strict';
	var Mint = window.Mint;
	if (!Mint || !Mint.define || Mint.__checkoutUi) return;
	Mint.__checkoutUi = true;
	var el = Mint.ui.el, cart = Mint.cart;

	var EXTRA = '.wrap{display:grid;gap:20px;max-width:880px}@media (min-width:760px){.wrap{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}' +
		'.h{margin:0 0 10px;font-size:15px;font-weight:600}.row{display:grid;gap:10px}@media (min-width:520px){.row.two{grid-template-columns:1fr 1fr}}' +
		'.sum{list-style:none;margin:0;padding:0}.sum li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--b);font-size:14px}' +
		'.tot{display:flex;justify-content:space-between;font-weight:700;font-size:16px;margin:12px 0}' +
		'.method{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--b);border-radius:var(--r);margin-bottom:8px;font-size:14px;cursor:pointer}' +
		'.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--f);border:1px solid var(--b);font-size:12px}' +
		'textarea.input{height:72px;padding:8px 12px;resize:vertical}.note{font-size:12px;color:var(--m);margin:8px 0 0}';

	function draw(host, theme) {
		var body = Mint.ui.shadow(host, theme), p = Mint.ui.palette(theme, host);
		var vars = ':host{--bg:' + p.bg + ';--fg:' + p.fg + ';--m:' + p.muted + ';--b:' + p.border + ';--f:' + p.field + ';--e:' + p.err + ';--p:' + p.primary + ';--r:' + p.radius + '}';
		body.parentNode.insertBefore(el('style', null, { text: vars + EXTRA }), body);
		return body;
	}
	function fill(t, k, v) { return String(t).split('{' + k + '}').join(v); }
	function safeUrl(u) { u = String(u || '').trim(); return /^(\\/(?!\\/)|https?:\\/\\/)/i.test(u) ? u : '/'; }

	/* ------------------------------------------------------------ checkout */
	Mint.define('checkout', {
		mount: function (host, ctx) {
			var t = ctx.texts, o = ctx.options;
			var body = draw(host, ctx.theme);
			var methods = null, values = {}, message = '', busy = false;

			function field(name, label, type, auto, required) {
				var id = 'c-' + name + '-' + Math.random().toString(36).slice(2, 7);
				var input = type === 'textarea' ? el('textarea', 'input', { id: id, name: name }) : el('input', 'input', { id: id, name: name, type: type || 'text', autocomplete: auto || 'off' });
				if (required) input.setAttribute('required', 'required');
				input.value = values[name] || '';
				input.oninput = function () { values[name] = input.value; };
				return el('div', 'field', null, [el('label', 'label', { for: id, text: label + (required ? '' : ' (optional)') }), input]);
			}

			function render() {
				body.innerHTML = '';
				var user = Mint.auth.user;
				if (o.requireSignIn && !user) { body.appendChild(el('div', 'card', null, [el('h3', 'title', { text: t.title }), el('p', 'muted', { text: t.signIn })])); return; }
				if (!cart.lines.length) { body.appendChild(el('div', 'card', null, [el('h3', 'title', { text: t.title }), el('p', 'muted', { text: t.empty })])); return; }
				if (user) { values.email = values.email || user.email || ''; values.name = values.name || user.name || ''; values.phone = values.phone || user.phone || ''; }

				var form = el('form', 'card', { novalidate: 'novalidate', style: 'max-width:none' });
				form.appendChild(el('h3', 'title', { text: t.title }));
				form.appendChild(el('p', 'h', { text: t.details }));
				form.appendChild(el('div', 'row two', null, [field('email', 'Email', 'email', 'email', true), field('name', 'Name', 'text', 'name', true)]));
				if (o.askPhone) form.appendChild(field('phone', 'Phone', 'tel', 'tel', true));
				if (o.askAddress) {
					form.appendChild(el('p', 'h', { text: t.address, style: 'margin-top:8px' }));
					form.appendChild(field('line1', 'Address', 'text', 'address-line1', true));
					form.appendChild(field('line2', 'Address line 2', 'text', 'address-line2', false));
					form.appendChild(el('div', 'row two', null, [field('city', 'City', 'text', 'address-level2', true), field('postcode', 'Postcode', 'text', 'postal-code', false)]));
					form.appendChild(field('country', 'Country', 'text', 'country-name', false));
				}
				if (o.askNote) form.appendChild(field('note', 'Note', 'textarea', 'off', false));

				var summary = el('div', 'card', { style: 'max-width:none' });
				summary.appendChild(el('p', 'h', { text: t.summary }));
				var ul = el('ul', 'sum');
				cart.lines.forEach(function (l) {
					ul.appendChild(el('li', '', null, [el('span', '', { text: l.quantity + ' × ' + (l.name || '') + (l.variant ? ' (' + l.variant + ')' : '') }), el('span', '', { text: l.problem && l.problem !== 'limited' ? '—' : cart.format(l.total) })]));
				});
				summary.appendChild(ul);
				summary.appendChild(el('div', 'tot', null, [el('span', '', { text: 'Total' }), el('span', '', { text: cart.format(cart.subtotal) })]));
				var error = el('p', 'error', { role: 'alert', 'aria-live': 'polite', text: message });
				summary.appendChild(error);
				var chosen = (methods && methods[0] && methods[0].provider) || '';
				if (methods && methods.length > 1) methods.forEach(function (m, i) {
					var r = el('input', '', { type: 'radio', name: 'method', value: m.provider });
					if (i === 0) r.checked = true;
					r.onchange = function () { chosen = m.provider; };
					summary.appendChild(el('label', 'method', null, [r, m.name, m.mode === 'test' ? el('span', 'badge', { text: 'Test mode' }) : null]));
				});
				else if (methods && methods.length === 1 && methods[0].mode === 'test') summary.appendChild(el('p', 'note', null, [el('span', 'badge', { text: 'Test mode' }), ' Use a test card — nothing is charged.']));
				var pay = el('button', 'btn block', { type: 'submit', text: fill(t.pay, 'amount', cart.format(cart.subtotal)) });
				if (!methods || !methods.length || busy) pay.disabled = true;
				summary.appendChild(pay);
				summary.appendChild(el('p', 'note', { text: methods && !methods.length ? 'Payments aren’t switched on for this site yet.' : t.secure }));

				var wrap = el('div', 'wrap', null, [form, summary]);
				body.appendChild(wrap);
				pay.onclick = function (e) {
					e.preventDefault();
					var missing = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (i) { return !i.value.trim(); })[0];
					if (missing) { missing.focus(); error.textContent = 'Fill in ' + (missing.previousSibling ? missing.previousSibling.textContent : 'the missing field') + '.'; return; }
					if (Mint.preview) { error.textContent = 'This is a preview — paying works on your site.'; return; }
					busy = true; pay.disabled = true; error.textContent = '';
					var payload = { provider: chosen, email: values.email, name: values.name, phone: values.phone, note: values.note,
						address: o.askAddress ? { name: values.name, line1: values.line1, line2: values.line2, city: values.city, postcode: values.postcode, country: values.country, phone: values.phone } : undefined };
					if (!Mint.auth.user) payload.lines = cart.lines.filter(function (l) { return l.problem !== 'unavailable'; }).map(function (l) { return { product: l.product, variant: l.variant || '', quantity: l.quantity }; });
					Mint.api('checkout', { method: 'POST', body: JSON.stringify(payload) }).then(Mint.json).then(function (r) {
						Mint.emit('checkout', { ref: r.ref, order: r.order });
						location.href = r.redirectUrl;
					}, function (err) {
						busy = false;
						message = err.code === 'cart_changed' ? t.changed : err.message;
						if (err.code === 'cart_changed') cart.refresh().then(render, render); else render();
					});
				};
			}

			Promise.all([Mint.auth.ready, cart.ready]).then(function () {
				render();
				if (Mint.preview) { methods = [{ provider: 'stripe', name: 'Card (Stripe)', mode: 'test' }]; render(); return; }
				Mint.api('checkout/options').then(Mint.json).then(function (r) { methods = r.methods || []; render(); }, function () { methods = []; render(); });
			});
			cart.onChange(function () { if (!busy) render(); });
			Mint.auth.onChange(function () { render(); });
		},
	});

	/* ------------------------------------------------------------ thank you */
	Mint.define('thanks', {
		mount: function (host, ctx) {
			var t = ctx.texts, o = ctx.options;
			var body = draw(host, ctx.theme);
			var ref = new URLSearchParams(location.search).get('ref') || '';
			var tries = 0;
			function show(p, state) {
				body.innerHTML = '';
				var card = el('div', 'card', { style: 'max-width:520px' });
				card.appendChild(el('h3', 'title', { text: state === 'paid' ? t.title : '' }));
				if (state === 'paid') {
					card.appendChild(el('p', '', { text: fill(t.paid, 'code', (p.order && p.order.code) || ''), style: 'margin:0 0 12px;font-size:14px' }));
					var ul = el('ul', 'sum');
					(p.lines || []).forEach(function (l) { ul.appendChild(el('li', '', null, [el('span', '', { text: l.quantity + ' × ' + l.name + (l.variant ? ' (' + l.variant + ')' : '') }), el('span', '', { text: Mint.money(l.total, p.currency) })])); });
					card.appendChild(ul);
					card.appendChild(el('div', 'tot', null, [el('span', '', { text: 'Total' }), el('span', '', { text: Mint.money(p.amount, p.currency) })]));
				} else card.appendChild(el('p', state === 'waiting' ? 'muted' : 'error', { text: t[state], style: 'font-size:14px' }));
				card.appendChild(el('a', 'link', { href: safeUrl(o.continueUrl), text: t.continue }));
				body.appendChild(card);
			}
			if (Mint.preview) return show({ order: { code: 'ORD-0042' }, amount: 50, currency: 'USD', lines: [{ quantity: 1, name: 'Fig & cedar candle', total: 28 }, { quantity: 1, name: 'Speckled mug', total: 22 }] }, 'paid');
			if (!/^[A-Za-z0-9_-]{8,40}$/.test(ref)) return show(null, 'missing');
			function poll() {
				Mint.api('checkout/' + encodeURIComponent(ref)).then(Mint.json).then(function (p) {
					if (p.status === 'paid') {
						show(p, 'paid');
						Mint.emit('paid', { ref: ref, order: p.order });
						// The bought cart is done with: a customer's server cart is already empty; a guest's browser one goes now.
						if (Mint.auth.user) cart.refresh(); else cart.clear().catch(function () {});
						return;
					}
					if (p.status === 'created' || p.status === 'pending') {
						show(p, 'waiting');
						if (++tries < 40) setTimeout(poll, tries < 10 ? 1500 : 4000);
						return;
					}
					show(p, 'failed');
				}, function (err) { show(null, err.status === 404 ? 'missing' : 'failed'); });
			}
			show(null, 'waiting');
			Mint.auth.ready.then(poll);
		},
	});
})();
`;
