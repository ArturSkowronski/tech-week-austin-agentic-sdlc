# The image of the line's steps: Node 22 and pnpm for the game, the factory's brain in Python, git, gitleaks (secrets)
# and cosign (the ledger's signature). The game's dependencies are installed into /opt/hw/node_modules at build
# time, so nothing is pulled from the network in the room: the line links /work/repo/system/node_modules there.
# Gitleaks calls x86-64 "x64", cosign "amd64": hence GL_ARCH.
# The build context is the repo root: docker build -f platform/toolbox/Dockerfile .
FROM node:22-bookworm-slim
ARG GITLEAKS_VERSION=8.30.1
ARG COSIGN_VERSION=3.1.3
ARG PNPM_VERSION=11.27.1
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip jq git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*' \
 && GL_ARCH=$([ "${TARGETARCH:-arm64}" = amd64 ] && echo x64 || echo "${TARGETARCH:-arm64}") \
 && curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL_ARCH}.tar.gz" | tar -xz -C /usr/local/bin gitleaks \
 && curl -fsSL -o /usr/local/bin/cosign "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-${TARGETARCH:-arm64}" \
 && chmod +x /usr/local/bin/cosign \
 && npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force
COPY system/package.json system/pnpm-lock.yaml system/pnpm-workspace.yaml /opt/hw/
RUN cd /opt/hw && CI=true pnpm install --frozen-lockfile && rm -rf /root/.local/share/pnpm/store /root/.cache
ENV CI=true NO_COLOR=1 FORCE_COLOR=0
WORKDIR /work
CMD ["bash"]
