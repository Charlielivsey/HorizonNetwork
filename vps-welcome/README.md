# HN Group VPS workspace

Install with `sudo bash /root/HorizonNetwork/vps-welcome/install.sh`.
Interactive SSH logins show the approved lavender/teal HN Group ASCII menu:

1. Open terminal.
2. Open Codex in `/root/HorizonNetwork`.
3. PM2 process controls: start all, confirmed stop all, or Individual sites → search → site actions.
4. Power management: confirmed server restart, soft shutdown or power up.
5. Unlock an HN account: enter the system-admin PIN, then the account’s full sign-in email.

Press L then Enter to log out. B returns from submenus. Type `horizon` to reopen manually.
PM2 and Power management require the configured system admin PIN, entered without echo. A salted
PBKDF2 hash is kept in root-only `/etc/hn-horizon/admin-pin.json`, outside the repository; installation
never replaces it. Each menu visit checks the PIN again. Direct start/stop/power CLI actions check it too.
These controls run with the SSH user's existing operating-system permissions, not additional privileges.

Individual sites can be searched by company/site name, domain or PM2 process name. Only fixed catalogue
processes (plus Administration/private account backend) can be selected. Start, stop, restart, status and
logs are available; stop/restart asks for confirmation. Ctrl+C returns from logs to site controls.

Soft shutdown runs as a detached systemd job, stops PM2 and `wg-hn`, then ends active SSH login sessions.
The SSH listener and nginx remain available, so reconnect over public SSH and choose Power up to restore
VPN and PM2. Server restart reboots the VPS. All three power actions require explicit confirmation and
are scheduled with a 3-second delay; job output is available in the named systemd unit's journal.
The CLI does not save a stopped PM2 startup list or change boot settings.

A PTY bridge wraps the interactive shell (`horizon --session`). After 120 seconds without keyboard
activity **at a Bash prompt**, it reopens the main menu. Active commands, Codex and log viewers are not
interrupted. Prompt markers are stripped from output; window resize, the shell command buffer and
normal terminal job control are retained. Leaving the idle menu for the terminal redraws the unfinished
command without executing it. Bash aliases/settings are loaded normally from `.bashrc`.

The shell hook only applies to interactive SSH connections with usable stdin/stdout terminals and a
TERM other than dumb. Noninteractive SSH commands, SCP/SFTP and automation remain silent and unchanged.
Set `HN_HORIZON_DISABLE=1` before login to opt out. Reconnect after installing to enable the idle bridge
on existing sessions. `horizon --welcome` is a display-only preview.

Existing shortcuts remain available: `horizon status`, `update`, `logs`, `nginx-check`, `nginx-reload`,
`vpn`, `resources`, and `git`. `horizon help` lists these and the new controls. Fixed command arguments
are used throughout; search input is never run as a command.

Checks: `python3 -m unittest discover -s vps-welcome -p 'test_*.py'` (26 passing). Includes real PTY idle,
command-buffer preservation and active-job checks, PIN verification, nested search, detached power
scheduling, SSH-session selection, installer isolation and noninteractive SSH. All process/VPN/power
mutations are mocked; no real shutdown, restart or disconnection is performed in tests.

## Full terminal frame

Open terminal now starts an isolated tmux viewport with a persistent HN Group header, lavender borders
and a footer. Command output and fullscreen applications stay inside its central pane. Header/side/footer
sizes are maintained on resize; exiting the shell closes the decorative panes and private tmux server.
Each SSH connection has its own private socket, with no shared sessions. The idle-aware bridge continues
inside the framed viewport. Press F8 for scrollback (q to leave); the usual tmux prefix is disabled so
normal shell/application keys continue to work. Existing SSH sessions need reconnecting for the new frame.
`tmux` is available on this VPS; absent tmux or a terminal smaller than 42×15 falls back to the regular shell.
The installer includes `frame.py` and never changes unrelated tmux configuration.

All 27 checks pass, including real isolated tmux tests for output containment, alternate-screen programs,
resize, focus and logout, plus a manual framed shell check. No services were stopped or restarted.

Menu display fix: menus clear/reset their viewport before drawing and read the actual TTY dimensions
rather than inherited COLUMNS/LINES. Inside the full frame they use its existing border and a compact
heading; shorter viewports omit optional hints/metrics. The 120×30 SSH case has a 116×24 shell viewport
and fits the complete menu plus input in 17 rows. 28 checks pass, including this exact framed-menu case.

SSH now creates the full terminal frame first and opens the Horizon main menu inside it immediately.
There is no separate unframed menu or required first Open terminal selection. A layout-ready barrier
keeps the initial menu from drawing before its final viewport dimensions exist. 29 checks pass;
manual startup and L/logout verified without starting/stopping any hosted service.

The frame header now reads HN Group / SECURE ACCESS TERMINAL. F9 leaves a Codex session launched
from the Horizon menu and returns to that menu; it never logs out of SSH or affects another session.
F8 remains scrollback, and ordinary L keystrokes continue to reach Codex. Reconnect an existing SSH
session once to load the new frame and key binding. The two-minute idle return applies only to an
idle Bash prompt: Codex and every other foreground job are exempt, including while waiting for input.
Regression checks use an isolated fake Codex process; no live Codex session is stopped by testing.

Power management option 4, **Shutdown server**, performs a full graceful VPS power-off. The system admin code is required to enter Power management and is requested again for this action, followed by an explicit confirmation. The detached job uses `systemctl poweroff`; afterwards the server must be started from the hosting control panel, since SSH and the Horizon power-up menu are unavailable while it is off. Soft shutdown remains option 2 for stopping services while retaining public SSH access.

## Recover a locked HN account

Run `sudo horizon unlock-account`, or run `horizon` as root and choose **5 — Unlock an HN account**. Enter the terminal’s existing system-admin PIN, then the sign-in email. Recovery goes through the running private account service, which clears the account lock and failed-attempt counter and records an audit event. Passwords and PINs are unchanged; an account disabled before locking stays disabled. The root-only service secret stays in an HTTP header on loopback, never in the command line or terminal output. The shortcut does not edit account files or restart services. If `hn-accounts` is stopped, start it through the normal PM2 controls before recovery.
