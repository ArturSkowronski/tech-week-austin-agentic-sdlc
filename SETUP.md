# Setup before the workshop (about 20 minutes)

Do it at home or in the office, not on conference Wi-Fi. At the end `make doctor` should be
green. The cluster runs on your laptop; in the room you need the network only for the model.

No laptop setup at all? Use GitHub Codespaces: README.md, Step 1A. The rest of this page is for a laptop.

## You need

- a laptop with 16 GB of RAM on which you can install software,
- Docker (Docker Desktop, OrbStack or Colima) with at least 8 GB of memory for containers,
- `git`, `make`, `python3` (3.10+), `jq`, `envsubst` (from gettext),
- Node 22 or newer and `pnpm` (the game's gate: `make test`, `make oracle`),
- the cluster tools: `kind`, `kubectl`, `helm`, `argo`, `cosign`,
- a GitHub account and `gh` (the workshop's finale works on your fork).

macOS with Homebrew:

```bash
brew install kind kubectl helm argo cosign node pnpm gh jq gettext
```

`gettext` gives you `envsubst` (the factory fills the ports into the cluster's manifests with it).
If you already have Node 22+ without pnpm: `corepack enable` or `npm install -g pnpm@11.27.1`.

Linux: each of these tools has a binary to download in its GitHub releases (`envsubst` is in the `gettext-base`
package). Windows: use WSL2.

A language model is not needed. You get a key in the room; until then the line works in
replay mode (recorded changes instead of a model).

## Steps

1. Fork https://github.com/ArturSkowronski/tech-week-austin-agentic-sdlc to your account and clone the fork:
   `git clone https://github.com/<login>/tech-week-austin-agentic-sdlc`
2. Go into the directory: `cd tech-week-austin-agentic-sdlc` and log in to GitHub: `gh auth login`
3. Install the workshop tools: `make tools`, then open a new terminal (`factory` in `~/.local/bin`).
4. Build the cluster: `make cluster` (5 to 10 minutes the first time, it pulls images).
5. Build the factory's images: `make setup` (a few minutes, from lesson 2 on).
6. Check: `make doctor`. Everything should be green.
7. Ask an agent: `make a2a A=probe T="Introduce yourself"`. Without a key you get a model error, and that is OK.

`factory start` does steps 4 to 6 in one go.

## What `make cluster` does

- creates the kind cluster `factory` with the UI ports on localhost (2746 Argo, 8082 and 8083 kagent, 16686 Jaeger),
- installs Argo Workflows (the line), kagent 0.10.1 (the agents), Kyverno (the policy) and Jaeger (the traces),
- creates the ModelConfig `factory-model` and the agent `probe`.

The cluster name and the ports come from `scripts/workshop.env`. If something else already uses those ports, put
other values (`KIND_CLUSTER`, `HALL_PORT`, `KAGENT_API_PORT`, `KAGENT_UI_PORT`, `JAEGER_PORT`) in the git-ignored
`.factory.env` in the repo root before `make cluster`.

Everything is in your Docker. After the workshop: `kind delete cluster --name factory`.

## If something does not work

- `kind create cluster` hangs: Docker has too little memory. Set 8 GB and try again.
- `helm` on macOS talks about the keychain or `ghcr.io … 403: denied`: run `docker logout ghcr.io` and repeat
  `make cluster`.
- The `kagent-controller` pods restart a few times at startup: they wait for Postgres, that is normal.
- `make doctor` says `node 22+` or `no pnpm`: install them as above, then a new terminal.
- A red `make doctor`: reply to the setup email with the output.
