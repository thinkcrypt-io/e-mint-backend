/**
 * The website tracker (docs/multi-tenancy WO-19), served at GET /public/track.js:
 *
 *   <script src="https://<api>/public/track.js" data-key="<project key>" defer></script>
 *
 * Counts a page view on load and on every client-side navigation (history
 * pushState/replaceState/popstate), clicks on links that leave the site and on
 * anything marked `data-track="<name>"`, and whatever the page sends with
 * `MintAnalytics.track(name, props)`. No cookies: a random visitor id in
 * localStorage, a session id in sessionStorage (ends with the tab). Sent in
 * small batches with navigator.sendBeacon (text/plain, so no preflight).
 *
 * WO-56: each batch also says the screen size, language and timezone, and the
 * customer signed in through mint.js (their token, checked on the server) or
 * who the site named with `MintAnalytics.identify(id, { name, email })`. A
 * visit's first page view is its entry (the server sorts its channel from the
 * referrer, UTMs and ad click id — gclid, fbclid, msclkid, ttclid…), and each
 * page's visible time and scroll depth go in when it's left.
 * `data-no-track` on the script, or Do Not Track, turns the counting off.
 *
 * `data-seo` (docs/site-connect SC-03) also puts each page's SEO from the panel
 * on it — GET …/site/head?path= on load and on every client-side navigation:
 * the page's own SEO replaces its tags, the site's defaults only fill tags it
 * doesn't have. Google reads it (it runs scripts); link previews don't — the
 * site's server prints the same answer for those (?format=html).
 *
 * It also puts the website's tags on the page (WO-34, WO-38) — Google
 * Analytics / Ads / Tag Manager, Meta, TikTok, LinkedIn, Pinterest, X and Snap
 * pixels, Clarity, Hotjar, the code tags, verification metas, the favicon — as
 * set on the panel's Site setup page (GET …/site/tags), so they change without
 * a deploy. `data-no-tags` leaves them to the site (e.g. rendered on the server);
 * `data-no-code` leaves only the code tags (Add script) to it — a builder site's
 * renderer prints those into the HTML itself (docs/site-builder SB-30).
 *
 * Each page view carries an event id; with Meta's Conversions API on, the pixel
 * tags its PageView with the same id and the server sends it too, so Meta
 * counts it once. `MintAnalytics.headers()` gives the site headers to add to
 * its own calls to the site API (a form it sends in), so a lead sent from the
 * server is matched to the visitor.
 */
export const TRACK_JS = `(function () {
	'use strict';
	var script = document.currentScript || document.querySelector('script[data-key][src*="/public/track.js"], script[data-key][src*="/_mint/track.js"]');
	if (!script) return;
	// The project key names the project on its API (docs/api-builder D14).
	var project = script.getAttribute('data-key');
	if (!project) { console.warn('MINT analytics: add data-key="<your project key>" — it is on API → Keys in your project'); return; }
	// data-api: where the API is when it isn't next to the script — the mint-edge Worker serves both from the site's own domain (/_mint/api).
	var api = script.getAttribute('data-api') ? new URL(script.getAttribute('data-api'), location.href).href.replace(/\\/+$/, '') : new URL(script.src, location.href).origin + '/public/api';
	var withKey = '?apiKey=' + encodeURIComponent(project);
	var endpoint = api + '/track' + withKey;
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
		if (!script.hasAttribute('data-no-code')) {
			addHtml(t.head, 'head');
			addHtml(t.bodyStart, 'bodyStart');
			addHtml(t.bodyEnd, 'bodyEnd');
		}
		tagged = true;
	}
	if (!script.hasAttribute('data-no-tags')) {
		fetch(api + '/site/tags' + withKey).then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
			if (!t) return;
			if (document.body) applyTags(t);
			else document.addEventListener('DOMContentLoaded', function () { applyTags(t); });
		}).catch(function () {});
	}

	/* ---- each page's SEO from the panel (data-seo, docs/site-connect SC-03): own SEO replaces the page's tags, defaults only fill gaps ---- */
	var seoOn = script.hasAttribute('data-seo');
	var seoAsked = 0;
	function headEl(t) {
		if (t.tag === 'title') return document.head.querySelector('title');
		if (t.tag === 'link') return document.head.querySelector('link[rel="canonical"]');
		return t.name ? document.head.querySelector('meta[name="' + t.name + '"]') : document.head.querySelector('meta[property="' + t.property + '"]');
	}
	function readTag(el) { return el.tagName === 'TITLE' ? (el.textContent || '').trim() : el.getAttribute(el.tagName === 'LINK' ? 'href' : 'content') || ''; }
	function writeTag(el, v) {
		if (el.tagName === 'TITLE') { el.textContent = v; document.title = v; }
		else el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', v);
	}
	// The page's own tags this script changed: put back on the next page, unless the site has changed them since.
	var changed = [];
	function applyHead(h) {
		changed.forEach(function (c) { if (readTag(c.el) === c.wrote) writeTag(c.el, c.orig); });
		changed = [];
		// Ours from the last page, and those the mint-edge Worker (SC-10) put in the HTML — this answer replaces them.
		Array.prototype.slice.call(document.head.querySelectorAll('[data-mint-seo="added"], [data-mint-seo="edge"]')).forEach(function (el) { el.parentNode.removeChild(el); });
		(h.tags || []).forEach(function (t) {
			var el = headEl(t);
			var has = el ? readTag(el) : '';
			if (t.mode === 'fill' && has) return;
			if (!el) {
				el = document.createElement(t.tag);
				if (t.tag === 'link') el.rel = 'canonical';
				else if (t.tag === 'meta') el.setAttribute(t.name ? 'name' : 'property', t.name || t.property);
				el.setAttribute('data-mint-seo', 'added');
				document.head.appendChild(el);
			} else changed.push({ el: el, orig: has, wrote: t.content });
			writeTag(el, t.content);
		});
		(h.jsonLd || []).forEach(function (s) {
			var el = document.createElement('script');
			el.type = 'application/ld+json';
			el.setAttribute('data-mint-seo', 'added');
			el.text = JSON.stringify(s).split('<').join('\\\\u003c');
			document.head.appendChild(el);
		});
	}
	function seo() {
		if (!seoOn) return;
		var asked = ++seoAsked;
		fetch(api + '/site/head' + withKey + '&path=' + encodeURIComponent(location.pathname)).then(function (r) { return r.ok ? r.json() : null; }).then(function (h) {
			// A later navigation's answer wins over a slow earlier one.
			if (h && asked === seoAsked) applyHead(h);
		}).catch(function () {});
	}

	function stored(store, key) {
		try { var v = store.getItem(key); if (!v) { v = id(); store.setItem(key, v); } return v; } catch (e) { return id(); }
	}
	var newSession = (function () { try { return !sessionStorage.getItem('mint:sid'); } catch (e) { return true; } })();
	var visitorId = stored(localStorage, 'mint:vid');
	var sessionId = stored(sessionStorage, 'mint:sid');
	var USER_KEY = 'mint:' + project + ':user';
	var user = null;
	try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) {}
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
	// The ad click id in the address, by name — the server knows which network each is.
	var CLICKS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'fbclid', 'ttclid', 'li_fat_id', 'twclid', 'ScCid', 'epik'];
	function clickId() {
		try { var q = new URLSearchParams(location.search); for (var i = 0; i < CLICKS.length; i++) if (q.get(CLICKS[i])) return CLICKS[i]; } catch (e) {}
		return undefined;
	}
	function timezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return undefined; } }
	// The customer signed in through mint.js: its token, which the server checks.
	function token() { try { return localStorage.getItem('mint:' + project + ':token') || undefined; } catch (e) { return undefined; } }
	function flush() {
		if (off || !queue.length) return;
		var body = JSON.stringify({
			visitorId: visitorId, sessionId: sessionId, fbp: cookie('_fbp'), fbc: fbc(),
			screen: window.screen ? screen.width + 'x' + screen.height : undefined, language: navigator.language, timezone: timezone(),
			token: token(), user: user || undefined,
			events: queue.splice(0, 20),
		});
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

	/* ---- time on page: visible time and scroll depth, sent when the page is left (and topped up if it's come back to) ---- */
	var page = null;
	function seen() { return page ? page.ms + (page.since ? Date.now() - page.since : 0) : 0; }
	function engagement() {
		if (off || !page || seen() < 500) return;
		queue.push({ type: 'engagement', eventId: page.eventId, duration: seen(), scroll: page.scroll });
	}
	function readScroll() {
		if (!page) return;
		var h = document.documentElement;
		var pct = Math.round(Math.min(1, ((window.scrollY || h.scrollTop || 0) + window.innerHeight) / Math.max(h.scrollHeight, 1)) * 100);
		if (pct > page.scroll) page.scroll = pct;
	}
	function startPage(eid) {
		engagement();
		page = { eventId: eid, ms: 0, since: document.visibilityState === 'visible' ? Date.now() : null, scroll: 0 };
		setTimeout(readScroll, 0);
	}
	var scrolling = null;
	addEventListener('scroll', function () { if (!scrolling) scrolling = setTimeout(function () { scrolling = null; readScroll(); }, 250); }, { passive: true });

	var last = null;
	var entryPending = newSession;
	function pageview() {
		if (location.pathname === last) return;
		var first = last === null;
		last = location.pathname;
		seo();
		var eid = first ? firstEid : id();
		var entry = entryPending;
		entryPending = false;
		// The pixels count their first page view themselves; later ones (client-side navigation) come from here.
		if (!first && tagged) {
			if (window.fbq) window.fbq('track', 'PageView', {}, { eventID: eid });
			if (window.ttq && window.ttq.page) window.ttq.page();
			if (window.pintrk) window.pintrk('page');
			if (window.snaptr) window.snaptr('track', 'PAGE_VIEW');
		}
		startPage(eid);
		push({
			type: 'pageview', eventId: eid, entry: entry || undefined, referrer: document.referrer || undefined,
			utmSource: utm('utm_source'), utmMedium: utm('utm_medium'), utmCampaign: utm('utm_campaign'), utmTerm: utm('utm_term'), utmContent: utm('utm_content'),
			click: clickId(),
		});
	}
	['pushState', 'replaceState'].forEach(function (fn) {
		var orig = history[fn];
		history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
	});
	addEventListener('popstate', pageview);
	addEventListener('pagehide', function () { engagement(); flush(); });
	document.addEventListener('visibilitychange', function () {
		if (!page) return;
		if (document.visibilityState === 'hidden') {
			if (page.since) { page.ms += Date.now() - page.since; page.since = null; }
			engagement();
			flush();
		} else if (!page.since) page.since = Date.now();
	});

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
		/** Who this visitor is on the site's own sign-in: shown on their page in Analytics → Visitors. */
		identify: function (userId, traits) {
			traits = traits || {};
			user = { id: userId == null ? undefined : String(userId).slice(0, 120), name: traits.name ? String(traits.name).slice(0, 120) : undefined, email: traits.email ? String(traits.email).slice(0, 200) : undefined };
			try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
		},
		/** Forget identify (signing out). */
		reset: function () { user = null; try { localStorage.removeItem(USER_KEY); } catch (e) {} },
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
