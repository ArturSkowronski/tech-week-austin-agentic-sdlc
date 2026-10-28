#!/bin/sh
# pnpm shim for the demo runtime: the network here is slow, so Hobby Wizard's
# dependencies are baked into /opt/hobby-wizard/node_modules (linux/arm64).
# `pnpm install` links them; `pnpm <script>` runs the script with npm.
case "$1" in
  install|i|add)
    [ -e node_modules ] || ln -s /opt/hobby-wizard/node_modules node_modules
    echo "pnpm (demo shim): node_modules linked from /opt/hobby-wizard"; exit 0 ;;
  run) shift; exec npm run --silent "$@" ;;
  exec|dlx) shift; exec npx --no-install "$@" ;;
  --version|-v) echo "11.27.1 (demo shim)"; exit 0 ;;
  *) exec npm run --silent "$@" ;;
esac
