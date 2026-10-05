/**
 * The My orders widget (docs/widgets W-07), served at GET
 * /public/widgets/orders.js: a signed-in customer's own orders from
 * GET /public/api/:slug/shop/orders — number, date, status, total, items.
 */
export const ORDERS_WIDGET_JS = `(function () {
	'use strict';
	var Mint = window.Mint;
	if (!Mint || !Mint.define || Mint.__ordersUi) return;
	Mint.__ordersUi = true;
	var el = Mint.ui.el;
	var EXTRA = '.order{padding:12px 0;border-bottom:1px solid var(--b)}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:14px}' +
		'.code{font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--f);border:1px solid var(--b);font-size:12px}' +
		'.items{margin:6px 0 0;font-size:13px;color:var(--m)}';

	Mint.define('orders', {
		mount: function (host, ctx) {
			var t = ctx.texts;
			var body = Mint.ui.shadow(host, ctx.theme), p = Mint.ui.palette(ctx.theme, host);
			body.parentNode.insertBefore(el('style', null, { text: ':host{--b:' + p.border + ';--f:' + p.field + ';--m:' + p.muted + '}' + EXTRA }), body);
			function show(orders, currency, note) {
				body.innerHTML = '';
				var card = el('div', 'card', { style: 'max-width:640px' }, [el('h3', 'title', { text: t.title })]);
				if (note) card.appendChild(el('p', 'muted', { text: note }));
				(orders || []).forEach(function (o) {
					var when = new Date(o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
					card.appendChild(el('div', 'order', null, [
						el('div', 'top', null, [el('span', '', null, [el('span', 'code', { text: o.code || 'Order' }), ' · ' + when]), el('span', 'badge', { text: o.statusLabel || o.status })]),
						el('p', 'items', { text: o.items.map(function (i) { return i.quantity + ' × ' + i.name + (i.variant ? ' (' + i.variant + ')' : ''); }).join(', ') + ' — ' + Mint.money(o.total, currency) }),
					]));
				});
				body.appendChild(card);
			}
			function load() {
				if (Mint.preview) return show([{ code: 'ORD-0042', createdAt: new Date().toISOString(), statusLabel: 'Paid', total: 50, items: [{ quantity: 1, name: 'Fig & cedar candle' }, { quantity: 1, name: 'Speckled mug' }] }], 'USD');
				if (!Mint.auth.user) return show([], '', t.signIn);
				Mint.api('shop/orders').then(Mint.json).then(function (r) { show(r.doc, r.currency, r.doc.length ? '' : t.empty); }, function (e) { show([], '', e.message); });
			}
			Mint.auth.ready.then(load);
			Mint.auth.onChange(load);
		},
	});
})();
`;
