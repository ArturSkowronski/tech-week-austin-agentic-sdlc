# Everything you need in the workshop. `make help` shows the list.
.PHONY: help cluster setup line order replay naive fetch send doctor lesson key a2a port-forward floor test oracle route intake agents-md

help:
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

cluster: ## Build the factory cluster: kind + Argo Workflows + kagent + Kyverno + Jaeger (idempotent)
	@scripts/cluster.sh

setup: ## Build the factory images, load them into kind, deploy the workshop (disk, depot, MCP server, agents), the line, the policy and the key
	@scripts/images.sh
	@kubectl apply -f platform/line/ >/dev/null
	@kubectl apply -f platform/workshop/pvc.yaml -f platform/workshop/depot.yaml -f platform/workshop/mcpserver.yaml >/dev/null
	@kubectl apply -f platform/kagent/agent-intake.yaml >/dev/null
	@kubectl apply -f platform/kagent/agent-builder.yaml >/dev/null
	@kubectl rollout status -n factory deploy/depot --timeout=120s >/dev/null
	@kubectl wait --for=condition=Ready mcpserver/workshop -n factory --timeout=180s >/dev/null
	@kubectl wait --for=condition=Ready agent/builder -n factory --timeout=180s >/dev/null
	@scripts/send.sh
	@echo "Workshop ready: make a2a A=builder T=\"List the modules in system/game\""

line: ## Deploy the line (the WorkflowTemplate factory + its account) to the cluster
	@kubectl apply -f platform/line/ >/dev/null && echo "line deployed: kubectl get workflowtemplate -n factory"

order: ## Send a work order down the line: make order O=startle [AGENT=replay]
	@scripts/order.sh $(O) $(AGENT)

replay: ## A work order without a model (a recorded change): make replay O=hw-001
	@scripts/order.sh $(O) replay

naive: ## A human's naive change: the startle with Math.random() in game/sim (lesson 6), through the gates
	@REPLAY_VARIANT=naive scripts/order.sh startle replay

fetch: ## Fetch the results from the cluster into .sdlc/out/
	@scripts/fetch.sh

send: ## Send a snapshot of the repo to the cluster (/work/repo in the depot)
	@scripts/send.sh

doctor: ## Check that everything works (locally and in the cluster)
	@scripts/doctor.sh

lesson: ## Jump to a lesson: make lesson N=4
	@scripts/lesson.sh $(N)

key: ## The model key (sk-ant-… Claude API, sk-or-… OpenRouter, sk-proj-… OpenAI): make key, paste it after the prompt
	@bash scripts/key.sh

a2a: ## Ask an agent over A2A: make a2a A=probe T="Introduce yourself"
	@python3 sdlc/a2a.py --agent "$(A)" --task "$(T)"

port-forward: ## If the ports from kind.yaml do not work: port-forward to kagent (8083) and Argo (2746)
	@kubectl port-forward -n kagent svc/kagent-controller 8083:8083 & kubectl port-forward -n argo svc/argo-server 2746:2746 & wait

floor: ## Open the factory floor (Argo UI), the kagent dashboard and Jaeger in the browser
	@. scripts/workshop.env; open http://localhost:$$HALL_PORT http://localhost:$$KAGENT_UI_PORT http://localhost:$$JAEGER_PORT 2>/dev/null || echo "http://localhost:$$HALL_PORT  http://localhost:$$KAGENT_UI_PORT  http://localhost:$$JAEGER_PORT"

test: ## The game's gate: typecheck, lint with the architecture rules, tests, bugs:check (system/)
	@[ -d system/node_modules ] || (cd system && pnpm install --frozen-lockfile)
	@bash sdlc/build.sh system

oracle: ## Run the holdout scenarios of a work order against your working tree: make oracle O=startle
	@[ -d system/node_modules ] || (cd system && pnpm install --frozen-lockfile)
	@python3 sdlc/scenarios.py run --work-order "$$(python3 sdlc/orders.py $(O) --title)"

route: ## Routing, locally: make route O=hw-001 (a work order file) or make route T="title" [B="body"]
	@if [ -n "$(O)" ]; then python3 sdlc/context.py route --title "$$(python3 sdlc/orders.py $(O) --title)" --body "$$(python3 sdlc/orders.py $(O) --body)"; \
	else python3 sdlc/context.py route --title "$(T)" --body "$(B)"; fi

intake: ## Intake, locally (routing + criteria + the intake agent's questions): make intake O=double-jump
	@python3 sdlc/context.py route --title "$$(python3 sdlc/orders.py $(O) --title)" --body "$$(python3 sdlc/orders.py $(O) --body)" >/dev/null 2>&1
	@python3 sdlc/intake.py --title "$$(python3 sdlc/orders.py $(O) --title)" --body "$$(python3 sdlc/orders.py $(O) --body)" 2>/dev/null

agents-md: ## Rebuild AGENTS.md from the sources (module.json, system/docs, ops, history)
	@python3 sdlc/context.py agents-md
