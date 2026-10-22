# HN Group: interactive SSH logins only. No output or reads in SSH commands, SFTP, SCP or automation.
case $- in
    *i*)
        if [ -n "${SSH_CONNECTION-}" ] && [ -t 0 ] && [ -t 1 ] && [ "${TERM-dumb}" != dumb ] \
            && [ -z "${HN_HORIZON_SHOWN-}" ] && [ "${HN_HORIZON_DISABLE-0}" != 1 ] \
            && [ -x /usr/local/bin/horizon ]; then
            HN_HORIZON_SHOWN=1
            export HN_HORIZON_SHOWN
            /usr/local/bin/horizon --welcome || :
        fi
        ;;
esac
