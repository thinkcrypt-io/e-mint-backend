// Pays the two sandbox pages payments-bd.mjs left in .payments-bd.json, in a
// headless Chrome, the way a buyer would: SSLCommerz → Mobile banking → bKash →
// the testbox's "Success" button (`risky` → "Success with risk"); bKash → its
// public sandbox wallet, OTP and PIN. Then `node payments-bd.mjs check`.
//
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9383 --user-data-dir=<scratch dir> --window-size=1280,900
//   CDP=9383 node payments-bd-pay.mjs [risky]
import fs from 'fs';

const CDP = process.env.CDP || '9383';
const STATE = new URL('./.payments-bd.json', import.meta.url);
const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const risky = process.argv[2] === 'risky';
const WALLET = { number: '01770618575', otp: '123456', pin: '12121' }; // bKash's published sandbox wallet

const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let n = 0;
const waiting = new Map();
ws.addEventListener('message', e => {
	const m = JSON.parse(e.data);
	if (m.id && waiting.has(m.id)) waiting.get(m.id)(m), waiting.delete(m.id);
});
const send = (method, params = {}) => new Promise(r => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async js => (await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (js, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(400)) if (await ev(js)) return true; throw new Error(`timed out: ${js}`); };
const click = async selector => {
	const box = await ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
	for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box[0], y: box[1], button: 'left', clickCount: 1 });
};
const typeInto = async (id, text) => { await ev(`(() => { const i = document.getElementById('${id}'); i.focus(); i.select(); })()`); await send('Input.insertText', { text }); };
const go = async url => { await send('Page.navigate', { url }); await sleep(3000); };
const leftFor = async host => until(`!location.href.includes(${JSON.stringify(host)})`, 30000);

await send('Page.enable');

/* SSLCommerz */
await go(st.pay.sslcommerz.redirectUrl);
await until(`!!document.querySelector('a[href="#menu2"]')`);
await click('a[href="#menu2"]');
await until(`!!document.querySelector('img.mob_bank_name[src*="bkash"]')?.offsetParent`);
await click('img.mob_bank_name[src*="bkash"]');
// Picking a gateway goes straight to the testbox's page.
await until(`!!document.querySelector('input[name=pan]')`, 30000);
await ev(`document.querySelector('input[name=pan]').value = '111111'; [...document.querySelectorAll('input[type=submit]')].find(b => b.value === ${JSON.stringify(risky ? 'Success with risk' : 'Success')}).click()`);
await leftFor('sslcommerz.com');
console.log('SSLCommerz: back to', await ev('location.href'));

/* bKash */
await go(st.pay.bkash.redirectUrl);
await until(`!!document.getElementById('WALLET')`);
await typeInto('WALLET', WALLET.number);
await click('.btn-group__btn-confirm');
await until(`!!document.getElementById('OTP')`);
await typeInto('OTP', WALLET.otp);
await click('.btn-group__btn-confirm');
await until(`!!document.getElementById('PIN')`);
await typeInto('PIN', WALLET.pin);
await click('.btn-group__btn-confirm');
await leftFor('bkash.com');
console.log('bKash: back to', await ev('location.href'));

// What `check` needs: the references, the orders and the provider's own ids.
const v = await (await fetch(`https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php?tran_id=${st.pay.sslcommerz.ref}&store_id=testbox&store_passwd=qwerty&format=json`)).json();
st.paid = {
	sslcommerz: { ref: st.pay.sslcommerz.ref, order: st.pay.sslcommerz.order._id, valId: v.element?.find(e => ['VALID', 'VALIDATED'].includes(e.status))?.val_id || '' },
	bkash: { ref: st.pay.bkash.ref, order: st.pay.bkash.order._id, paymentID: new URL(st.pay.bkash.redirectUrl).searchParams.get('paymentId') || '' },
};
fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`);
process.exit(0);
