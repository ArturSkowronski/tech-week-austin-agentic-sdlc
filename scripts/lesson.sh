#!/usr/bin/env bash
# Jump to lesson N: make lesson N=4. Your changes go to git stash, the branch `work` stands on the tag lesson-04.
set -euo pipefail
cd "$(dirname "$0")/.."
N=${1:?Name the lesson, e.g. make lesson N=4}
tag=$(printf 'lesson-%02d' "$N")
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { git fetch -q --tags origin 2>/dev/null || true; }
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "no tag $tag"; exit 1; }
if [ -n "$(git status --porcelain)" ]; then git stash push -q -u -m "before $tag" && echo "Your changes are in: git stash list"; fi
git switch -q -C work "$tag"
echo "work = $tag. Material: lessons/$(ls lessons | grep "^$tag" | head -1)"
