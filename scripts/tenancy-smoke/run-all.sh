#!/bin/sh
# Every tenancy smoke script, in order, against the scratch server on :5001
# (see README.md). org-2.mjs is left out: it needs invitation tokens read from
# the server's dev mail log — run it by hand after org-1.mjs.
# payments.mjs needs the backend started with STRIPE_API_BASE=http://127.0.0.1:12111
# (its stand-in Stripe; ignored in production). courier-connections.mjs needs it started with
# COURIER_STUB_URL=http://127.0.0.1:4599 (the courier stub, which the script starts itself).
cd "$(dirname "$0")" || exit 1
fail=0
for f in admin tenant-auth org-1 projects models media mcp public public-filters api-builder api-logs project-keys cms-single cms-components cms-blocks cms-drafts website website-mcp secrets yes-no empty-search formula-links analytics oversight access project-invites comments navsearch docx automations activity templates templates-preview templates-manage templates-mcp templates-apply webhooks collections migration countries widgets widgets-cart widgets-setup customer-reset customer-roles customer-api mail mail-designs automation-pdfs automation-email-resend automations-mcp payments site-builder site-builder-data site-builder-starter site-builder-connect commerce-settings commerce-install commerce-stock commerce-orders commerce-lists commerce-categories courier-model courier-connections courier-steadfast; do
	printf '%-12s ' "$f"
	out=$(node "$f.mjs" 2>&1)
	last=$(printf '%s\n' "$out" | tail -1)
	echo "$last"
	printf '%s\n' "$out" | grep -q '^FAIL' && { printf '%s\n' "$out" | grep '^FAIL'; fail=1; }
done
exit $fail
