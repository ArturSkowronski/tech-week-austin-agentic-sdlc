# Tab completion for factory (bash; zsh through bashcompinit). install.sh loads it from ~/.bashrc and ~/.zshrc.
#   factory <Tab>              the commands
#   factory lesson <Tab>       1-10 and final (also check, solve, autopilot, ready)
#   factory ask <Tab>          the agents: probe, intake, builder, reviewer
#   factory play <Tab>         fix, then branches (agent/issue-N after the finale)
#   factory play fix <Tab>     the work orders in orders/
_factory() {
  local cur=${COMP_WORDS[COMP_CWORD]} prev=${COMP_WORDS[COMP_CWORD-1]} words
  if [ "$COMP_CWORD" -eq 1 ]; then
    words="start lesson map doctor check solve autopilot ready ask key play urls login callback reset welcome update help"
  else
    case "${COMP_WORDS[1]}" in
      lesson|check|solve|autopilot|ready)
        [ "$COMP_CWORD" -eq 2 ] && words="1 2 3 4 5 6 7 8 9 10 final" ;;
      ask)
        [ "$COMP_CWORD" -eq 2 ] && words="probe intake builder reviewer" ;;
      play)
        if [ "$COMP_CWORD" -eq 2 ]; then
          words="fix $(git for-each-ref --format='%(refname:short)' refs/heads 'refs/remotes/origin/agent/*' 2>/dev/null | sed 's#^origin/##')"
        elif [ "$COMP_CWORD" -eq 3 ] && [ "$prev" = fix ]; then
          local top; top=$(git rev-parse --show-toplevel 2>/dev/null)
          words=$(ls "$top"/orders/*.md 2>/dev/null | sed 's#.*/##; s#\.md$##')
        fi ;;
    esac
  fi
  COMPREPLY=($(compgen -W "$words" -- "$cur"))
}
complete -F _factory factory
