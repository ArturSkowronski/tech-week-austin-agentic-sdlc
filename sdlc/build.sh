#!/usr/bin/env bash
# The build gate of the factory: the four gates of Hobby Wizard (AGENTS.md rule 7), each judged by its exit code.
#   typecheck  tsc --noEmit
#   lint       eslint . (with the architecture rules of system/architecture/rules.js)
#   test       vitest run (the main suite)
#   bugs       tools/bugs/check.ts (the planted-bug pairing of ADR-005)
# The binaries are called directly, not through package.json scripts: a change cannot redefine a gate.
# Every gate runs even when an earlier one is red, so the report shows the whole picture.
# Usage: sdlc/build.sh [system dir]   exit code 0 when all four are green.
set -u
cd "${1:-$(dirname "$0")/../system}" || exit 2
bin=node_modules/.bin
[ -x "$bin/tsc" ] || { echo "no node_modules in $(pwd): pnpm install"; exit 2; }
red=0
gate() {
  local name=$1; shift
  echo "==> gate $name: $*"
  "$@" 2>&1; local code=$?
  echo "<== gate $name exit=$code"
  [ $code = 0 ] || red=1
}
gate typecheck "$bin/tsc" --noEmit
gate lint "$bin/eslint" .
gate test "$bin/vitest" run
gate bugs "$bin/tsx" tools/bugs/check.ts
exit $red
