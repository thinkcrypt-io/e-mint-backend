/**
 * The Login & account widget (docs/widgets W-03), served at
 * GET /public/widgets/login.js and loaded by mint.js when a page has
 * `<div data-mint="login"></div>`. Sign in / create an account against the
 * project's customer accounts; signed in, the customer's name and a sign-out
 * link. Layout `card` draws the card in place; `button` draws a button that
 * opens it. `askPhone` adds an optional phone to sign-up. `allowReset`
 * (default on) adds "Forgot your password?": an email gets a link back to
 * this page, which opens on a new password (W-25, Mint.auth.resetToken).
 * `customerRole` (or data-customer-role on the element) makes it a role login
 * (W-27): only that customer role signs in, its sign-up makes that role, and
 * the sign-up link shows only when people may sign up as it. Where the account
 * lands — MINT's Customers, plus a record in the project's own customer model
 * when one is chosen (W-24) — is the server's business (authMapping.function). Options and texts come from the panel (Site setup → Widgets).
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
			// A role login (W-27): one customer role signs in here, and signs up as it when people may.
			var asRole = String(o.customerRole || '').trim();
			var roleInfo = null;
			var canSignUp = function () { return o.allowSignUp && (!asRole || !roleInfo || roleInfo.signUp); };
			var mode = o.startWith === 'signup' && o.allowSignUp ? 'up' : 'in';
			var open = false;
			// Opened from a reset email (W-25): straight to the new password.
			if (Mint.auth.resetToken) { mode = 'reset'; open = true; }

			function field(name, text, type, auto, optional) {
				var id = 'm-' + name + '-' + Math.random().toString(36).slice(2, 8);
				var attrs = { id: id, name: name, type: type, autocomplete: auto };
				if (!optional) attrs.required = 'required';
				return el('div', 'field', null, [
					el('label', 'label', { for: id, text: text }),
					el('input', 'input', attrs),
				]);
			}

			function signedIn(user) {
				var name = (user && (user.name || user.email)) || '';
				var out = el('button', 'link', { type: 'button', text: t.signOut });
				out.onclick = function () { Mint.auth.signOut(); };
				return el('div', 'card', null, [el('p', '', { text: String(t.signedIn).replace('{name}', name), style: 'margin:0 0 10px;font-size:14px' }), out]);
			}

			function back() {
				var b = el('button', 'link', { type: 'button', text: t.backToSignIn, style: 'margin-top:12px' });
				b.onclick = function () { mode = 'in'; render(); };
				return b;
			}

			// Forgot password: an email, then "a link is on its way" — the same answer whether there's an account or not.
			function forgot() {
				var f = el('form', '', { novalidate: 'novalidate' });
				f.appendChild(field('email', 'Email', 'email', 'email'));
				var error = el('p', 'error', { role: 'alert', 'aria-live': 'polite' });
				var submit = el('button', 'btn block', { type: 'submit', text: t.forgotButton });
				f.appendChild(error);
				f.appendChild(submit);
				f.onsubmit = function (e) {
					e.preventDefault();
					error.textContent = '';
					if (Mint.preview) { error.textContent = 'This is a preview — the email is sent from your site.'; return; }
					submit.disabled = true;
					Mint.auth.forgotPassword(f.email.value.trim()).then(function () { mode = 'sent'; render(); }, function (err) {
						error.textContent = err.message;
						submit.disabled = false;
					});
				};
				return el('div', 'card', { role: 'dialog' }, [el('h3', 'title', { text: t.forgotTitle }), f, back()]);
			}

			function sent() {
				return el('div', 'card', { role: 'dialog' }, [el('h3', 'title', { text: t.forgotTitle }), el('p', '', { text: t.forgotSent, style: 'margin:0;font-size:14px' }), back()]);
			}

			// The link's token is Mint.auth.resetToken; saving signs in.
			function reset() {
				var f = el('form', '', { novalidate: 'novalidate' });
				f.appendChild(field('password', 'New password', 'password', 'new-password'));
				f.appendChild(field('again', 'The same again', 'password', 'new-password'));
				var error = el('p', 'error', { role: 'alert', 'aria-live': 'polite' });
				var submit = el('button', 'btn block', { type: 'submit', text: t.resetButton });
				f.appendChild(error);
				f.appendChild(submit);
				f.onsubmit = function (e) {
					e.preventDefault();
					error.textContent = '';
					if (f.password.value.length < 8) { error.textContent = 'Use at least 8 characters.'; return; }
					if (f.password.value !== f.again.value) { error.textContent = 'The two passwords are different.'; return; }
					submit.disabled = true;
					Mint.auth.resetPassword(Mint.auth.resetToken, f.password.value).catch(function (err) {
						error.textContent = err.message;
						submit.disabled = false;
					});
				};
				var cancel = el('button', 'link', { type: 'button', text: t.backToSignIn, style: 'margin-top:12px' });
				cancel.onclick = function () { Mint.auth.resetToken = null; mode = 'in'; render(); };
				return el('div', 'card', { role: 'dialog' }, [el('h3', 'title', { text: t.resetTitle }), f, cancel]);
			}

			function form() {
				if (mode === 'forgot') return forgot();
				if (mode === 'sent') return sent();
				if (mode === 'reset' && Mint.auth.resetToken) return reset();
				if (mode === 'reset') mode = 'in';
				var up = mode === 'up';
				var f = el('form', '', { novalidate: 'novalidate' });
				if (up) f.appendChild(field('name', 'Name', 'text', 'name'));
				f.appendChild(field('email', 'Email', 'email', 'email'));
				if (up && o.askPhone) f.appendChild(field('phone', 'Phone (optional)', 'tel', 'tel', true));
				f.appendChild(field('password', 'Password', 'password', up ? 'new-password' : 'current-password'));
				var error = el('p', 'error', { role: 'alert', 'aria-live': 'polite' });
				var submit = el('button', 'btn block', { type: 'submit', text: up ? t.signUpButton : t.signInButton });
				f.appendChild(error);
				f.appendChild(submit);
				f.onsubmit = function (e) {
					e.preventDefault();
					var data = { email: f.email.value.trim(), password: f.password.value };
					if (up) data.name = f.name.value.trim();
					if (up && o.askPhone && f.phone.value.trim()) data.phone = f.phone.value.trim();
					if (up && asRole) data.customerRole = asRole;
					error.textContent = '';
					if (Mint.preview) { error.textContent = 'This is a preview — signing in works on your site.'; return; }
					submit.disabled = true;
					(up ? Mint.auth.signUp(data) : Mint.auth.signIn(data.email, data.password, asRole ? { customerRole: asRole } : null)).catch(function (err) {
						error.textContent = err.message;
						submit.disabled = false;
					});
				};
				var head = [el('h3', 'title', { text: up ? t.signUpTitle : t.signInTitle })];
				if (asRole) head.push(el('p', '', { text: String(t.roleNote || '').replace('{role}', roleInfo ? roleInfo.label : asRole), style: 'margin:-6px 0 12px;font-size:13px;opacity:.7' }));
				var card = el('div', 'card', { role: 'dialog' }, head.concat([f]));
				if (!up && o.allowReset !== false) {
					var lost = el('button', 'link', { type: 'button', text: t.forgotLink, style: 'margin-top:12px;display:block' });
					lost.onclick = function () { mode = 'forgot'; render(); };
					card.appendChild(lost);
				}
				if (canSignUp()) {
					var swap = el('button', 'link', { type: 'button', text: up ? t.toSignIn : t.toSignUp, style: 'margin-top:12px' });
					swap.onclick = function () { mode = up ? 'in' : 'up'; render(); };
					card.appendChild(swap);
				}
				return card;
			}

			function render() {
				body.innerHTML = '';
				// A reset link opened while signed in still sets the password.
				var user = mode === 'reset' && Mint.auth.resetToken ? null : Mint.auth.user;
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

			// The project's customer roles (their names, and which have a sign-up) come with its widget settings.
			Promise.all([Mint.auth.ready, Mint.config]).then(function (r) {
				var roles = (r[1] && r[1].customerRoles) || [];
				for (var i = 0; i < roles.length; i++) if (roles[i].value === asRole) roleInfo = roles[i];
				if (mode === 'up' && !canSignUp()) mode = 'in';
				render();
			});
			Mint.auth.onChange(function () { open = false; if (mode !== 'up') mode = 'in'; render(); });
			document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { open = false; render(); } });
		},
	});
})();
`;
