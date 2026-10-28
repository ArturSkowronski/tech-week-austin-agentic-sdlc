# Visdom demo runtime for the Austin workshop (local kind cluster only).
# Base: the local agents image (runtime-task + Claude Code 2.1.292 + Codex 0.160.1),
# brought up to orchestrator main's runtime kit (entrypoint + lib, contract 1),
# plus the TraceVault CLI and Hobby Wizard's linux/arm64 node_modules.
FROM postgres:17 AS trixie-glibc
RUN mkdir -p /out && cp -L /lib/aarch64-linux-gnu/libc.so.6 /lib/aarch64-linux-gnu/libm.so.6 \
      /lib/aarch64-linux-gnu/libgcc_s.so.1 /lib/ld-linux-aarch64.so.1 /out/

FROM localhost:5001/visdom/runtime-agents-kit:flow-a-101
USER root
# The TraceVault CLI is built against glibc 2.39 (trixie); this image is bookworm (2.36),
# so it runs with trixie's loader and libc from /opt/tracevault/lib.
COPY --from=trixie-glibc /out/ /opt/tracevault/lib/
COPY tracevault-v0.28.3-aarch64-unknown-linux-gnu.tar.gz /tmp/tv.tgz
RUN tar -xzf /tmp/tv.tgz --strip-components=1 -C /opt/tracevault tracevault-v0.28.3-aarch64-unknown-linux-gnu/tracevault \
 && rm /tmp/tv.tgz \
 && printf '#!/bin/sh\nexec /opt/tracevault/lib/ld-linux-aarch64.so.1 --library-path /opt/tracevault/lib /opt/tracevault/tracevault "$@"\n' > /usr/local/bin/tracevault \
 && chmod +x /usr/local/bin/tracevault && tracevault --version
COPY --chmod=0755 kit/entrypoint.sh /usr/local/bin/vp-entrypoint
COPY kit/lib/ /usr/local/lib/visdom/
COPY --chmod=0755 pnpm-shim.sh /usr/local/bin/pnpm
RUN rm /usr/local/bin/codex
COPY --chmod=0755 codex-wrapper.sh /usr/local/bin/codex
COPY --chown=1000:1000 hw/node_modules /opt/hobby-wizard/node_modules
RUN rm -rf /home/task/.codex/skills /home/task/.claude/skills \
 && install -d -o 1000 -g 1000 /work
USER 1000:1000
WORKDIR /work
