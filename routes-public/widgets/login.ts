/**
 * The Login & account widget (docs/widgets W-03), served at
 * GET /public/widgets/login.js and loaded by mint.js when a page has
 * `<div data-mint="login"></div>`. Sign in / create an account against the
 * project's customer accounts; signed in, the customer's name and a sign-out
 * link. Layout `card` draws the card in place; `button` draws a button that
 * opens it. Options and texts come from the panel (Site setup → Widgets).
 */
export const LOGIN_WIDGET_JS = `(function () {
	'use strict';
	var Mint = window.Mint;
	if (!Mint || !Mint.define) return;
	var el = Mint.ui.el;

	Mint.define('login', {
		mount: function (host, ctx) {
			var t = ctx.texts, o = ctx.options;
			var body = Mint.ui.shadow(host, ctx.theme);
			var mode = o.startWith === 'signup' && o.allowSignUp ? 'up' : 'in';
			var open = false;

			function field(name, text, type, auto) {
				var id = 'm-' + name + '-' + Math.random().toString(36).slice(2, 8);
				return el('div', 'field', null, [
					el('label', 'label', { for: id, text: text }),
					el('input', 'input', { id: id, name: name, type: type, autocomplete: auto, required: 'required' }),
				]);
			}

			function signedIn(user) {
				var name = (user && (user.name || user.email)) || '';
				var out = el('button', 'link', { type: 'button', text: t.signOut });
				out.onclick = function () { Mint.auth.signOut(); };
				return el('div', 'card', null, [el('p', '', { text: String(t.signedIn).replace('{name}', name), style: 'margin:0 0 10px;font-size:14px' }), out]);
			}

			function form() {
				var up = mode === 'up';
				var f = el('form', '', { novalidate: 'novalidate' });
				if (up) f.appendChild(field('name', 'Name', 'text', 'name'));
				f.appendChild(field('email', 'Email', 'email', 'email'));
				f.appendChild(field('password', 'Password', 'password', up ? 'new-password' : 'current-password'));
				var error = el('p', 'error', { role: 'alert', 'aria-live': 'polite' });
				var submit = el('button', 'btn block', { type: 'submit', text: up ? t.signUpButton : t.signInButton });
				f.appendChild(error);
				f.appendChild(submit);
				f.onsubmit = function (e) {
					e.preventDefault();
					var data = { email: f.email.value.trim(), password: f.password.value };
					if (up) data.name = f.name.value.trim();
					error.textContent = '';
					if (Mint.preview) { error.textContent = 'This is a preview — signing in works on your site.'; return; }
					submit.disabled = true;
					(up ? Mint.auth.signUp(data) : Mint.auth.signIn(data.email, data.password)).catch(function (err) {
						error.textContent = err.message;
						submit.disabled = false;
					});
				};
				var card = el('div', 'card', { role: 'dialog' }, [el('h3', 'title', { text: up ? t.signUpTitle : t.signInTitle }), f]);
				if (o.allowSignUp) {
					var swap = el('button', 'link', { type: 'button', text: up ? t.toSignIn : t.toSignUp, style: 'margin-top:12px' });
					swap.onclick = function () { mode = up ? 'in' : 'up'; render(); };
					card.appendChild(swap);
				}
				return card;
			}

			function render() {
				body.innerHTML = '';
				var user = Mint.auth.user;
				if (o.layout !== 'button') {
					body.appendChild(user ? signedIn(user) : form());
					return;
				}
				var wrap = el('div', 'pop');
				var btn = el('button', user ? 'btn ghost' : 'btn', { type: 'button', 'aria-expanded': String(open), text: user ? (user.name || user.email) : t.openButton });
				btn.onclick = function () { open = !open; render(); };
				wrap.appendChild(btn);
				if (open) wrap.appendChild(user ? signedIn(user) : form());
				body.appendChild(wrap);
			}

			Mint.auth.ready.then(render);
			Mint.auth.onChange(function () { open = false; render(); });
			document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { open = false; render(); } });
		},
	});
})();
`;
