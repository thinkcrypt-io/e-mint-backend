/**
 * The website tracker (docs/multi-tenancy WO-19), served at GET /public/track.js:
 *
 *   <script src="https://<api>/public/track.js" data-project="<project public slug>" defer></script>
 *
 * Counts a page view on load and on every client-side navigation (history
 * pushState/replaceState/popstate), clicks on links that leave the site and on
 * anything marked `data-track="<name>"`, and whatever the page sends with
 * `MintAnalytics.track(name, props)`. No cookies: a random visitor id in
 * localStorage, a session id in sessionStorage (ends with the tab). Sent in
 * small batches with navigator.sendBeacon (text/plain, so no preflight).
 * `data-no-track` on the script, or Do Not Track, turns it off.
 */
export const TRACK_JS = `(function () {
	'use strict';
	var script = document.currentScript || document.querySelector('script[data-project][src*="/public/track.js"]');
	if (!script || script.hasAttribute('data-no-track') || navigator.doNotTrack === '1') return;
	var project = script.getAttribute('data-project');
	if (!project) { console.warn('MINT analytics: add data-project="<your project slug>"'); return; }
	var endpoint = new URL(script.src, location.href).origin + '/public/api/' + encodeURIComponent(project) + '/track';

	function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
	function stored(store, key) {
		try { var v = store.getItem(key); if (!v) { v = id(); store.setItem(key, v); } return v; } catch (e) { return id(); }
	}
	var visitorId = stored(localStorage, 'mint:vid');
	var sessionId = stored(sessionStorage, 'mint:sid');
	var queue = [];
	var timer = null;

	function utm(name) { try { return new URLSearchParams(location.search).get(name) || undefined; } catch (e) { return undefined; } }
	function flush() {
		if (!queue.length) return;
		var body = JSON.stringify({ visitorId: visitorId, sessionId: sessionId, events: queue.splice(0, 20) });
		if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
		fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
	}
	function push(event) {
		event.path = event.path || location.pathname;
		event.title = event.title || document.title;
		queue.push(event);
		if (queue.length >= 10) flush();
		else { clearTimeout(timer); timer = setTimeout(flush, 2000); }
	}

	var last = null;
	function pageview() {
		if (location.pathname === last) return;
		last = location.pathname;
		push({ type: 'pageview', referrer: document.referrer || undefined, utmSource: utm('utm_source'), utmMedium: utm('utm_medium'), utmCampaign: utm('utm_campaign') });
	}
	['pushState', 'replaceState'].forEach(function (fn) {
		var orig = history[fn];
		history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
	});
	addEventListener('popstate', pageview);
	addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

	document.addEventListener('click', function (e) {
		var el = e.target && e.target.closest && e.target.closest('[data-track], a[href]');
		if (!el) return;
		var marked = el.getAttribute('data-track');
		var href = el.getAttribute('href') || '';
		var outbound = !marked && /^https?:/i.test(href) && new URL(href, location.href).host !== location.host;
		if (!marked && !outbound) return;
		push({ type: 'click', name: (marked || (el.textContent || '').trim()).slice(0, 120), element: { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 200), href: href.slice(0, 1000), id: el.id || undefined } });
	}, true);

	window.MintAnalytics = {
		track: function (name, props) { push({ type: 'event', name: String(name).slice(0, 120), props: props }); },
		pageview: function () { last = null; pageview(); },
	};

	if (document.readyState === 'complete' || document.readyState === 'interactive') pageview();
	else document.addEventListener('DOMContentLoaded', pageview);
})();
`;
