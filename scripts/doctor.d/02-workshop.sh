# Lesson 2: images, the disk, the depot, the MCP server and the builder.
echo "Workshop (lesson 2)"
for img in factory-toolbox factory-workshop; do
  docker image inspect "$img:$IMAGE_TAG" >/dev/null 2>&1 && pass "image $img:$IMAGE_TAG" || fail "no image $img: make setup"
done
kubectl get pvc workshop -n factory -o jsonpath='{.status.phase}' 2>/dev/null | grep -q Bound && pass "the /work disk" || fail "PVC workshop is not Bound"
kubectl get deploy depot -n factory -o jsonpath='{.status.readyReplicas}' 2>/dev/null | grep -q 1 && pass "depot" || fail "the depot does not run (make setup)"
kubectl get mcpserver workshop -n factory -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True && pass "MCP server workshop" || fail "MCPServer workshop is not Ready"
kubectl get agent builder -n factory -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True && pass "agent builder ready" || fail "agent builder is not ready"
kubectl exec -n factory deploy/depot -- test -d /work/repo/system >/dev/null 2>&1 && pass "a repo snapshot in the cluster" || fail "no snapshot: make send"
