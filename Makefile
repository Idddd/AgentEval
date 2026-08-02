KIND_CLUSTER := agent-eval
KUBECTL := kubectl --context kind-$(KIND_CLUSTER)
REGISTRY := localhost:5001
CALICO_URL := https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml
PY := .venv/bin/python

.PHONY: kind-up kind-down registry gateway-image gateway-deploy reference-agent test-k8s

registry:
	bash deploy/kind/registry.sh

kind-up: registry
	kind get clusters | grep -qx $(KIND_CLUSTER) || \
		kind create cluster --name $(KIND_CLUSTER) --config deploy/kind/cluster.yaml
	bash deploy/kind/registry.sh
	$(KUBECTL) apply -f $(CALICO_URL)
	$(KUBECTL) -n kube-system rollout status daemonset/calico-node --timeout=300s
	$(KUBECTL) wait --for=condition=Ready node --all --timeout=300s
	$(KUBECTL) apply -f deploy/k8s/namespace.yaml
	$(KUBECTL) apply -f deploy/k8s/networkpolicy.yaml
	$(KUBECTL) -n agent-eval-runs get secret gateway-admin >/dev/null 2>&1 || \
		$(KUBECTL) -n agent-eval-runs create secret generic gateway-admin \
			--from-literal=token=$$(openssl rand -hex 16)
	$(MAKE) gateway-deploy

gateway-image:
	docker build -f src/gateway/Dockerfile -t $(REGISTRY)/agent-eval-gateway:dev .
	docker push $(REGISTRY)/agent-eval-gateway:dev

gateway-deploy: gateway-image
	$(KUBECTL) apply -f deploy/k8s/gateway.yaml
	$(KUBECTL) -n agent-eval-runs rollout restart deployment/agent-eval-gateway
	$(KUBECTL) -n agent-eval-runs rollout status deployment/agent-eval-gateway --timeout=180s

reference-agent:
	docker build -f reference_agent/Dockerfile -t $(REGISTRY)/agent-eval-reference-agent:dev .
	docker push $(REGISTRY)/agent-eval-reference-agent:dev
	docker inspect --format='{{index .RepoDigests 0}}' \
		$(REGISTRY)/agent-eval-reference-agent:dev > deploy/kind/.reference-agent-image
	@echo "reference agent image: $$(cat deploy/kind/.reference-agent-image)"

test-k8s:
	$(PY) -m pytest -m k8s -q --override-ini addopts=

kind-down:
	kind delete cluster --name $(KIND_CLUSTER) || true
	docker rm -f kind-registry 2>/dev/null || true
