#!/usr/bin/env bash
# Verify a Leak Lab Supabase project from the OUTSIDE, holding only the public
# key — i.e. exactly what an attacker who viewed source can do.
#   bash supabase/verify.sh https://YOUR-REF.supabase.co sb_publishable_xxx
set -u
URL="${1:-}"; KEY="${2:-}"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "usage: bash supabase/verify.sh <project-url> <publishable-key>"; exit 2
fi
API="$URL/rest/v1"
pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then printf "  ok    %-46s %s\n" "$1" "$3"; pass=$((pass+1));
  else printf "  FAIL  %-46s got %s, want %s\n" "$1" "$3" "$2"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "Verifying $URL"

# Telemetry: writable, never readable.
check "ll_events INSERT (anon)" 201 "$(code -X POST "$API/ll_events" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  -d '{"ev":"verify","sid":"verify-script"}')"
check "ll_events SELECT denied" 401 "$(code "$API/ll_events?select=ev&limit=1" -H "apikey: $KEY")"
check "ll_events DELETE denied"  401 "$(code -X DELETE "$API/ll_events?ev=eq.verify" -H "apikey: $KEY")"

# Sessions: signed-out users get nothing.
check "ll_sessions SELECT denied (anon)" 401 "$(code "$API/ll_sessions?select=n&limit=1" -H "apikey: $KEY")"
check "ll_sessions INSERT denied (anon)" 401 "$(code -X POST "$API/ll_sessions" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' -d '{"n":1,"acc":1,"ev":0,"ev_per":0}')"

# Equity samples: contributable, never readable (same posture as telemetry).
check "ll_equity_samples INSERT (anon)" 201 "$(code -X POST "$API/ll_equity_samples" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  -d '{"k":"1|nit|flop|verify","rv":1,"wins":1,"ties":0,"n":1,"sid":"verify-script"}')"
check "ll_equity_samples SELECT denied" 401 "$(code "$API/ll_equity_samples?select=k&limit=1" -H "apikey: $KEY")"
# Equity cache: publicly readable (RLS returns only confirmed rows), never writable by the app key.
check "ll_equity_cache SELECT allowed" 200 "$(code "$API/ll_equity_cache?select=k&limit=1" -H "apikey: $KEY")"
check "ll_equity_cache INSERT denied" 401 "$(code -X POST "$API/ll_equity_cache" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' -d '{"k":"x","rv":1,"equity":0.5,"n":1}')"

# Nothing else should be reachable or even advertised.
echo "  --- exposed tables in the public API schema ---"
curl -s "$API/" -H "apikey: $KEY" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const j=JSON.parse(d); const t=Object.keys(j.paths||{}).filter(p=>p!=='/').map(p=>p.slice(1));
    const extra=t.filter(x=>!['ll_events','ll_sessions','ll_equity_samples','ll_equity_cache'].includes(x));
    console.log('        '+(t.join(', ')||'(none)'));
    console.log(extra.length ? '  FAIL  unexpected tables exposed: '+extra.join(', ') : '  ok    only Leak Lab tables exposed');
    process.exit(extra.length?1:0);
  } catch(e){ console.log('  ??    could not parse OpenAPI schema'); }
});" || fail=$((fail+1))

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
