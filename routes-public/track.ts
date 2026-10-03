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
 * `data-no-track` on the script, or Do Not Track, turns the counting off.
 *
 * It also puts the website's tags on the page (WO-34, WO-38) — Google
 * Analytics / Ads / Tag Manager, Meta, TikTok, LinkedIn, Pinterest, X and Snap
 * pixels, Clarity, Hotjar, the code tags, verification metas, the favicon — as
 * set on the panel's Site setup page (GET …/site/tags), so they change without
 * a deploy. `data-no-tags` leaves them to the site (e.g. rendered on the server).
 *
 * Each page view carries an event id; with Meta's Conversions API on, the pixel
 * tags its PageView with the same id and the server sends it too, so Meta
 * counts it once. `MintAnalytics.headers()` gives the site headers to add to
 * its own calls to the site API (a form it sends in), so a lead sent from the
 * server is matched to the visitor.
 */
export const TRACK_JS = `(function () {
	'use strict';
	var script = document.currentScript || document.querySelector('script[data-project][src*="/public/track.js"]');
	if (!script) return;
	var project = script.getAttribute('data-project');
	if (!project) { console.warn('MINT analytics: add data-project="<your project slug>"'); return; }
	var api = new URL(script.src, location.href).origin + '/public/api/' + encodeURIComponent(project);
	var endpoint = api + '/track';
	var off = script.hasAttribute('data-no-track') || navigator.doNotTrack === '1';
	var tagged = false;
	function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
	var firstEid = id();

	/* ---- the site's tags (Site setup) ---- */
	function addScript(src, inline) {
		var el = document.createElement('script');
		if (src) { el.async = true; el.src = src; }
		if (inline) el.text = inline;
		document.head.appendChild(el);
	}
	function addHtml(html, where) {
		if (!html) return;
		var tpl = document.createElement('template');
		tpl.innerHTML = html;
		Array.prototype.slice.call(tpl.content.childNodes).forEach(function (node) {
			var el = node;
			if (node.nodeName === 'SCRIPT') {
				el = document.createElement('script');
				for (var i = 0; i < node.attributes.length; i++) el.setAttribute(node.attributes[i].name, node.attributes[i].value);
				el.text = node.textContent;
			} else el = document.importNode(node, true);
			if (where === 'bodyStart') document.body.insertBefore(el, document.body.firstChild);
			else (where === 'head' ? document.head : document.body).appendChild(el);
		});
	}
	function meta(name, content) {
		if (!content || document.querySelector('meta[name="' + name + '"]')) return;
		var m = document.createElement('meta');
		m.name = name; m.content = content;
		document.head.appendChild(m);
	}
	function applyTags(t) {
		if (window.__mintTags) return;
		window.__mintTags = true;
		if (t.mintAnalytics === false) { off = true; queue.length = 0; }
		meta('google-site-verification', t.googleVerification);
		meta('msvalidate.01', t.bingVerification);
		if (t.noindex) meta('robots', 'noindex');
		if (t.favicon && !document.querySelector('link[rel~="icon"]')) {
			var icon = document.createElement('link');
			icon.rel = 'icon'; icon.href = t.favicon;
			document.head.appendChild(icon);
		}
		var w = window;
		if (t.ga4 || t.googleAds) {
			addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(t.ga4 || t.googleAds));
			w.dataLayer = w.dataLayer || [];
			w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
			w.gtag('js', new Date());
			if (t.ga4) w.gtag('config', t.ga4);
			if (t.googleAds) w.gtag('config', t.googleAds);
		}
		if (t.gtm) {
			w.dataLayer = w.dataLayer || [];
			w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
			addScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(t.gtm));
		}
		if (t.metaPixel && !w.fbq) {
			var fbq = w.fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
			if (!w._fbq) w._fbq = fbq;
			fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
			addScript('https://connect.facebook.net/en_US/fbevents.js');
			w.fbq('init', t.metaPixel);
			w.fbq('track', 'PageView', {}, { eventID: firstEid });
		}
		if (t.tiktokPixel && !w.ttq) {
			var ttq = w.ttq = [];
			ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
			ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
			for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
			ttq.load = function (id) {
				var src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
				ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = src; ttq._t = ttq._t || {}; ttq._t[id] = +new Date(); ttq._o = ttq._o || {}; ttq._o[id] = {};
				addScript(src + '?sdkid=' + encodeURIComponent(id) + '&lib=ttq');
			};
			w.TiktokAnalyticsObject = 'ttq';
			ttq.load(t.tiktokPixel);
			ttq.page();
		}
		if (t.linkedinPartner) {
			w._linkedin_partner_id = t.linkedinPartner;
			w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || [];
			w._linkedin_data_partner_ids.push(t.linkedinPartner);
			addScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
		}
		if (t.pinterestTag && !w.pintrk) {
			w.pintrk = function () { w.pintrk.queue.push(Array.prototype.slice.call(arguments)); };
			w.pintrk.queue = []; w.pintrk.version = '3.0';
			addScript('https://s.pinimg.com/ct/core.js');
			w.pintrk('load', t.pinterestTag);
			w.pintrk('page');
		}
		if (t.xPixel && !w.twq) {
			var twq = w.twq = function () { twq.exe ? twq.exe.apply(twq, arguments) : twq.queue.push(arguments); };
			twq.version = '1.1'; twq.queue = [];
			addScript('https://static.ads-twitter.com/uwt.js');
			w.twq('config', t.xPixel);
		}
		if (t.snapPixel && !w.snaptr) {
			var snaptr = w.snaptr = function () { snaptr.handleRequest ? snaptr.handleRequest.apply(snaptr, arguments) : snaptr.queue.push(arguments); };
			snaptr.queue = [];
			addScript('https://sc-static.net/scevent.min.js');
			w.snaptr('init', t.snapPixel, {});
			w.snaptr('track', 'PAGE_VIEW');
		}
		if (t.clarity && !w.clarity) {
			w.clarity = function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
			addScript('https://www.clarity.ms/tag/' + encodeURIComponent(t.clarity));
		}
		if (t.hotjar && !w.hj) {
			w.hj = function () { (w.hj.q = w.hj.q || []).push(arguments); };
			w._hjSettings = { hjid: Number(t.hotjar), hjsv: 6 };
			addScript('https://static.hotjar.com/c/hotjar-' + encodeURIComponent(t.hotjar) + '.js?sv=6');
		}
		addHtml(t.head, 'head');
		addHtml(t.bodyStart, 'bodyStart');
		addHtml(t.bodyEnd, 'bodyEnd');
		tagged = true;
	}
	if (!script.hasAttribute('data-no-tags')) {
		fetch(api + '/site/tags').then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
			if (!t) return;
			if (document.body) applyTags(t);
			else document.addEventListener('DOMContentLoaded', function () { applyTags(t); });
		}).catch(function () {});
	}

	function stored(store, key) {
		try { var v = store.getItem(key); if (!v) { v = id(); store.setItem(key, v); } return v; } catch (e) { return id(); }
	}
	var visitorId = stored(localStorage, 'mint:vid');
	var sessionId = stored(sessionStorage, 'mint:sid');
	var queue = [];
	var timer = null;

	function cookie(name) { var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : undefined; }
	// Meta's click id: its cookie, or built from ?fbclid= the way the pixel does.
	function fbc() {
		var c = cookie('_fbc');
		if (c) return c;
		try { var click = new URLSearchParams(location.search).get('fbclid'); return click ? 'fb.1.' + Date.now() + '.' + click : undefined; } catch (e) { return undefined; }
	}
	function utm(name) { try { return new URLSearchParams(location.search).get(name) || undefined; } catch (e) { return undefined; } }
	function flush() {
		if (off || !queue.length) return;
		var body = JSON.stringify({ visitorId: visitorId, sessionId: sessionId, fbp: cookie('_fbp'), fbc: fbc(), events: queue.splice(0, 20) });
		if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
		fetch(endpoint, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
	}
	function push(event) {
		if (off) return;
		event.path = event.path || location.pathname;
		event.title = event.title || document.title;
		queue.push(event);
		if (queue.length >= 10) flush();
		else { clearTimeout(timer); timer = setTimeout(flush, 2000); }
	}

	var last = null;
	function pageview() {
		if (location.pathname === last) return;
		var first = last === null;
		last = location.pathname;
		var eid = first ? firstEid : id();
		// The pixels count their first page view themselves; later ones (client-side navigation) come from here.
		if (!first && tagged) {
			if (window.fbq) window.fbq('track', 'PageView', {}, { eventID: eid });
			if (window.ttq && window.ttq.page) window.ttq.page();
			if (window.pintrk) window.pintrk('page');
			if (window.snaptr) window.snaptr('track', 'PAGE_VIEW');
		}
		push({ type: 'pageview', eventId: eid, referrer: document.referrer || undefined, utmSource: utm('utm_source'), utmMedium: utm('utm_medium'), utmCampaign: utm('utm_campaign') });
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
		visitorId: visitorId,
		/** Add to the site's own calls to the site API (e.g. a form it sends in): matches a lead sent from the server to this visitor. */
		headers: function () {
			var h = { 'x-mint-visitor': visitorId };
			if (cookie('_fbp')) h['x-mint-fbp'] = cookie('_fbp');
			if (fbc()) h['x-mint-fbc'] = fbc();
			return h;
		},
	};

	if (document.readyState === 'complete' || document.readyState === 'interactive') pageview();
	else document.addEventListener('DOMContentLoaded', pageview);
})();
`;
