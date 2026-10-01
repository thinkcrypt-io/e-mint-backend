/**
 * The customer login widget (docs/multi-tenancy WO-11), served at
 * GET /public/widget.js. A tenant drops it on their site:
 *
 *   <script src="https://<api>/public/widget.js" data-project="<project public slug>" async></script>
 *   <div data-mint-login></div>
 *
 * Every `[data-mint-login]` element becomes a sign-in / create-account card,
 * or "Signed in as …" with a sign-out link once signed in. The customer's
 * token is kept in localStorage per project. The page's own code gets
 * `window.MintAuth`:
 *
 *   MintAuth.ready                 resolves once the stored session is checked
 *   MintAuth.user / MintAuth.token the signed-in customer (or null)
 *   MintAuth.fetch(path, init)     the project's public API, signed in — e.g. MintAuth.fetch('orders')
 *   MintAuth.signIn(email, password) · signUp({ name, email, password }) · signOut()
 *   MintAuth.onChange(cb)          called with the customer (or null) on every change
 *
 * Plain ES5-ish JavaScript with no dependencies, inline styles only (no CSS a
 * site has to load), light and dark from the visitor's preference.
 */
export const WIDGET_JS = `(function () {
	'use strict';
	var script = document.currentScript || document.querySelector('script[data-project][src*="/public/widget.js"]');
	if (!script) return;
	var project = script.getAttribute('data-project');
	if (!project) { console.warn('MINT login widget: add data-project="<your project slug>"'); return; }
	var origin = new URL(script.src, location.href).origin;
	var api = origin + '/public/api/' + encodeURIComponent(project) + '/';
	var KEY = 'mint:' + project + ':token';
	var listeners = [];
	var state = { user: null, token: null };

	function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
	function write(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {} }

	function request(path, init) {
		init = init || {};
		var headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers || {});
		if (state.token) headers.Authorization = 'Bearer ' + state.token;
		return fetch(api + String(path).replace(/^\\/+/, ''), Object.assign({}, init, { headers: headers }));
	}
	function json(res) {
		return res.json().catch(function () { return {}; }).then(function (body) {
			if (!res.ok) { var err = new Error(body.message || 'Something went wrong'); err.status = res.status; err.code = body.code; throw err; }
			return body;
		});
	}
	function set(user, token) {
		state.user = user; state.token = token || null; write(state.token);
		MintAuth.user = user; MintAuth.token = state.token;
		listeners.forEach(function (cb) { try { cb(user); } catch (e) {} });
		render();
	}

	var MintAuth = {
		user: null,
		token: null,
		fetch: function (path, init) { return request(path, init); },
		signIn: function (email, password) {
			return request('auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) }).then(json)
				.then(function (r) { set(r.customer, r.token); return r.customer; });
		},
		signUp: function (data) {
			return request('auth/register', { method: 'POST', body: JSON.stringify(data) }).then(json)
				.then(function (r) { set(r.customer, r.token); return r.customer; });
		},
		signOut: function () { set(null, null); },
		onChange: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },
	};

	state.token = read();
	MintAuth.ready = state.token
		? request('auth/me').then(json).then(function (u) { set(u, state.token); return u; }, function () { set(null, null); return null; })
		: Promise.resolve(null);
	window.MintAuth = MintAuth;

	/* ------------------------------------------------------------ the card */

	var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
	var C = dark
		? { bg: '#18181b', fg: '#fafafa', muted: '#a1a1aa', border: '#3f3f46', field: '#27272a', btn: '#fafafa', btnFg: '#18181b', err: '#f87171' }
		: { bg: '#ffffff', fg: '#18181b', muted: '#71717a', border: '#e4e4e7', field: '#ffffff', btn: '#18181b', btnFg: '#ffffff', err: '#dc2626' };

	function el(tag, style, attrs, kids) {
		var n = document.createElement(tag);
		if (style) n.style.cssText = style;
		if (attrs) Object.keys(attrs).forEach(function (k) { k === 'text' ? (n.textContent = attrs[k]) : n.setAttribute(k, attrs[k]); });
		(kids || []).forEach(function (k) { if (k) n.appendChild(k); });
		return n;
	}
	var font = 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
	var input = font + 'width:100%;box-sizing:border-box;height:40px;padding:0 12px;border-radius:8px;border:1px solid ' + C.border + ';background:' + C.field + ';color:' + C.fg + ';font-size:14px;outline-offset:2px;';
	var label = font + 'display:block;font-size:13px;font-weight:600;margin:0 0 6px;color:' + C.fg + ';';

	function field(name, text, type, auto) {
		var id = 'mint-' + name + '-' + Math.random().toString(36).slice(2, 8);
		return el('div', 'margin-bottom:12px', null, [
			el('label', label, { for: id, text: text }),
			el('input', input, { id: id, name: name, type: type, autocomplete: auto, required: 'required' }),
		]);
	}

	function card(host, mode) {
		host.innerHTML = '';
		var box = el('div', font + 'max-width:360px;padding:20px;border:1px solid ' + C.border + ';border-radius:14px;background:' + C.bg + ';color:' + C.fg + ';box-sizing:border-box;');
		if (state.user) {
			box.appendChild(el('p', 'margin:0 0 10px;font-size:14px', { text: 'Signed in as ' + (state.user.name || state.user.email) }));
			var out = el('button', font + 'background:none;border:0;padding:0;color:' + C.muted + ';font-size:13px;text-decoration:underline;cursor:pointer', { type: 'button', text: 'Sign out' });
			out.onclick = function () { MintAuth.signOut(); };
			box.appendChild(out);
			host.appendChild(box);
			return;
		}
		var signUp = mode === 'up';
		box.appendChild(el('h3', 'margin:0 0 14px;font-size:18px;font-weight:600', { text: signUp ? 'Create your account' : 'Sign in' }));
		var form = el('form', '', { novalidate: 'novalidate' });
		if (signUp) form.appendChild(field('name', 'Name', 'text', 'name'));
		form.appendChild(field('email', 'Email', 'email', 'email'));
		form.appendChild(field('password', 'Password', 'password', signUp ? 'new-password' : 'current-password'));
		var error = el('p', 'margin:0 0 10px;min-height:1em;font-size:13px;color:' + C.err, { role: 'alert', 'aria-live': 'polite' });
		form.appendChild(error);
		var submit = el('button', font + 'width:100%;height:40px;border:0;border-radius:8px;background:' + C.btn + ';color:' + C.btnFg + ';font-size:14px;font-weight:600;cursor:pointer', { type: 'submit', text: signUp ? 'Create account' : 'Sign in' });
		form.appendChild(submit);
		form.onsubmit = function (e) {
			e.preventDefault();
			var data = { email: form.email.value.trim(), password: form.password.value };
			if (signUp) data.name = form.name.value.trim();
			error.textContent = '';
			submit.disabled = true; submit.style.opacity = '0.6';
			(signUp ? MintAuth.signUp(data) : MintAuth.signIn(data.email, data.password)).catch(function (err) {
				error.textContent = err.message;
				submit.disabled = false; submit.style.opacity = '1';
			});
		};
		box.appendChild(form);
		var swap = el('button', font + 'margin-top:12px;background:none;border:0;padding:0;color:' + C.muted + ';font-size:13px;cursor:pointer', { type: 'button', text: signUp ? 'Have an account? Sign in' : 'New here? Create an account' });
		swap.onclick = function () { card(host, signUp ? 'in' : 'up'); };
		box.appendChild(swap);
		host.appendChild(box);
	}

	function render() {
		var hosts = document.querySelectorAll('[data-mint-login]');
		for (var i = 0; i < hosts.length; i++) card(hosts[i], hosts[i].getAttribute('data-mode') === 'signup' ? 'up' : 'in');
	}

	MintAuth.ready.then(function () {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
		else render();
	});
})();
`;
