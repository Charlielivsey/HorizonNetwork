# Private interactive shell underneath the idle-aware SSH terminal bridge.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
horizon() {
    if /usr/local/bin/horizon "$@"; then
        return 0
    else
        local hn_result=$?
        [ "$hn_result" = 10 ] && exit 0
        return "$hn_result"
    fi
}
__hn_prompt_ready() { printf '\033]777;hn-prompt-ready\007'; }
if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then
    PROMPT_COMMAND+=(__hn_prompt_ready)
else
    PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND}; }__hn_prompt_ready"
fi
