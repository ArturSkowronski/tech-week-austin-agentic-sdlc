# Lesson 10: the key for signing the ledger, and traces.
echo "Trace (lesson 10)"
kubectl get secret factory-cosign -n factory >/dev/null 2>&1 && pass "cosign key in the cluster" || fail "no cosign key: make cosign-keys"
[ -f platform/line/cosign/cosign.pub ] && pass "the public key for verification" || fail "no platform/line/cosign/cosign.pub: make cosign-keys"
curl -fsS -m 5 "http://localhost:$JAEGER_PORT/api/services" 2>/dev/null | grep -q '"data"' && pass "Jaeger answers (http://localhost:$JAEGER_PORT)" || fail "Jaeger does not answer on localhost:$JAEGER_PORT"
