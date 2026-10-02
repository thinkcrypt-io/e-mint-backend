#!/bin/sh
# Every tenancy smoke script, in order, against the scratch server on :5001
# (see README.md). org-2.mjs is left out: it needs invitation tokens read from
# the server's dev mail log — run it by hand after org-1.mjs.
cd "$(dirname "$0")" || exit 1
fail=0
for f in admin tenant-auth org-1 projects models media mcp public website website-mcp analytics oversight access; do
	printf '%-12s ' "$f"
	out=$(node "$f.mjs" 2>&1)
	last=$(printf '%s\n' "$out" | tail -1)
	echo "$last"
	printf '%s\n' "$out" | grep -q '^FAIL' && { printf '%s\n' "$out" | grep '^FAIL'; fail=1; }
done
exit $fail
