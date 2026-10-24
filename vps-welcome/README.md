# HN Group VPS welcome

Install on the VPS: `sudo bash /root/HorizonNetwork/vps-welcome/install.sh`.

Interactive SSH logins open a welcome with live uptime, memory/disk use and accurate shortcuts. It stays open and waits for a numbered choice: **0 opens the normal console**, and 1–8 run the listed shortcuts. Empty or invalid input keeps the menu open. Each shortcut returns to the menu; Ctrl+C stops following logs and returns to the menu. Confirmations use 1 to continue or 0 to cancel. Type `horizon` to reopen the menu, `horizon help` for exact commands, or use a shortcut directly:

- `horizon status`: PM2 process status.
- `horizon update`: git pull followed by the existing selective root website installer; asks once before running.
- `horizon logs`: choose one process from website control's catalog. `horizon logs hn-auth` follows Auth logs; Ctrl+C returns to the shell. The private account backend is also available for diagnostics.
- `horizon nginx-check`: check nginx configuration.
- `horizon nginx-reload`: check then reload nginx, with confirmation.
- `horizon vpn`: WireGuard `wg-hn` status.
- `horizon resources`: uptime, memory and root-disk use.
- `horizon git`: repository status and latest commit.

Root-operated shortcuts tell other users to use `sudo horizon …`. The menu grants no additional permissions. It never stops or restarts PM2 processes and never runs unvalidated command text.

The shell hook requires an interactive shell, SSH_CONNECTION, a usable terminal on stdin/stdout, and TERM other than dumb. It opens the interactive menu once per login environment. Command-based SSH (even `ssh -t host command`), SFTP/SCP and noninteractive tools receive no output or prompt. Set `HN_HORIZON_DISABLE=1` in the session environment to opt out; `horizon` continues to work manually. `horizon --welcome` remains a display-only preview that never reads input. Ctrl+C or end-of-input at the main menu also returns safely to the console.

This is the user's requested replacement of the earlier decision to have no server welcome. It does not revive the old Secure Enclave menu. The isolated installer changes only `/usr/local/lib/hn-horizon`, `/usr/local/bin/horizon` and `/etc/profile.d/90-hn-horizon.sh`. Remove the hook file to disable automatic display.

Checks: `python3 -m unittest discover -s vps-welcome -p 'test_*.py'`.
