#!/usr/bin/env bash
# The lessons are a chain of commits on main with the tags lesson-01 … lesson-10 (main = lesson 10 + the finale).
# Make a fix shared by all lessons on the commit of the lesson where it belongs (e.g. git rebase -i lesson-03~1),
# then move the tags onto the new commits:  scripts/restack.sh [--push]
# The script finds the commits by the title "Lesson N:" in the history of main.
set -euo pipefail
cd "$(dirname "$0")/.."
log=$(git log main --format='%H %s')
tags=()
for n in $(seq 1 10); do
  tag=$(printf 'lesson-%02d' "$n")
  sha=$(printf '%s\n' "$log" | grep -m1 " Lesson $n: " | cut -d' ' -f1 || true)
  if [ -z "$sha" ]; then echo "  (no commit \"Lesson $n:\" on main, skipping $tag)"; continue; fi
  git tag -f "$tag" "$sha" >/dev/null
  tags+=("$tag")
done
git log --oneline --decorate main | grep -E 'tag: lesson-' | head -12
if [ "${1:-}" = "--push" ]; then
  git push -f origin main "${tags[@]}"
fi
