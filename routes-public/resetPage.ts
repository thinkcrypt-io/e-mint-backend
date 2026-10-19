/**
 * The page GET /public/reset-password serves (docs/widgets W-25): a new
 * password, twice, posted with the token from the link's #fragment. `name` is
 * HTML-escaped; `endpoint` is a JSON string. No outside files.
 */
export const resetPage = (name: string, endpoint: string, nonce: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Choose a new password · ${name}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f5f4;--card:#fff;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--btn:#1c1917;--btnfg:#fff;--err:#b91c1c;--ok:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1c1c1f;--fg:#f5f5f4;--muted:#a8a29e;--line:#2e2e33;--btn:#f5f5f4;--btnfg:#111113;--err:#f87171;--ok:#4ade80}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.card{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
.brand{font-size:13px;color:var(--muted);margin:0 0 6px}h1{font-size:20px;margin:0 0 18px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit;margin:0 0 14px}
button{width:100%;padding:11px;border:0;border-radius:8px;background:var(--btn);color:var(--btnfg);font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.6}
.msg{font-size:14px;margin:0 0 14px}.err{color:var(--err)}.ok{color:var(--ok)}[hidden]{display:none}
</style></head><body><main class="card">
<p class="brand">${name}</p><h1>Choose a new password</h1>
<form id="f" novalidate>
<label for="p1">New password</label><input id="p1" type="password" autocomplete="new-password" minlength="8" required>
<label for="p2">The same again</label><input id="p2" type="password" autocomplete="new-password" minlength="8" required>
<p id="e" class="msg err" role="alert" aria-live="polite"></p><button id="b" type="submit">Save password</button></form>
<p id="done" class="msg ok" hidden>Your password is changed. Sign in with it on ${name}’s site or app.</p>
</main><script nonce="${nonce}">
(function(){var m=location.hash.match(/mint_reset=([^&]+)/),t=m?decodeURIComponent(m[1]):'';
try{history.replaceState(null,'',location.pathname+location.search)}catch(x){}
var f=document.getElementById('f'),e=document.getElementById('e'),b=document.getElementById('b');
if(!t){e.textContent='This link is incomplete — open the one in the email again, or ask for a new one.';b.disabled=true}
f.onsubmit=function(ev){ev.preventDefault();var a=document.getElementById('p1').value,c=document.getElementById('p2').value;e.textContent='';
if(a.length<8){e.textContent='Use at least 8 characters.';return}if(a!==c){e.textContent='The two passwords are different.';return}
b.disabled=true;fetch(${endpoint},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,password:a})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.message||'Something went wrong — try again.');f.hidden=true;document.getElementById('done').hidden=false})})
.catch(function(x){e.textContent=x.message;b.disabled=false})}})();
</script></body></html>`;
