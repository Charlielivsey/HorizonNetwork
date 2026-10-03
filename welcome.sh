#!/usr/bin/env bash

if [ "$HN_IN_CONSOLE" = "1" ] && [ "$(basename -- "$0")" != "horizon" ]; then
    exit 0
fi

BLUE='\033[1;34m'
LAVENDER='\033[38;5;183m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

HA_DIR="/opt/horizon-advertising"

pm2_count() {
    if ! command -v pm2 &>/dev/null; then
        echo "0/0"
        return
    fi
    local total online
    total=$(pm2 jlist 2>/dev/null | grep -o '"name"' | wc -l)
    online=$(pm2 jlist 2>/dev/null | grep -o '"status":"online"' | wc -l)
    echo "${online}/${total}"
}

ha_service_names() {
    if ! command -v pm2 &>/dev/null; then return; fi
    pm2 jlist 2>/dev/null | grep -o '"name":"ha-[^"]*"' | sed 's/"name":"//;s/"//'
}

show_user_menu() {
    clear
    echo ""
    echo -e "${BLUE}  ╔═══════════════════════════════════════════════════╗"
    echo -e "  ║                                                   ║"
    echo -e "  ║            U S E R   M A N A G E M E N T          ║"
    echo -e "  ║                                                   ║"
    echo -e "  ╚═══════════════════════════════════════════════════╝${RESET}"
    echo ""

    local user_count
    user_count=$(awk -F: '$3 >= 1000 && $1 != "nobody" {print $1}' /etc/passwd | wc -l)
    echo -e "  ${GRAY}Users on this system: ${user_count}${RESET}"
    echo ""
    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""
    echo -e "  ${LAVENDER}[1]${RESET}  Add User"
    echo -e "  ${LAVENDER}[2]${RESET}  Delete User"
    echo -e "  ${LAVENDER}[3]${RESET}  Manage Sudoers"
    echo -e "  ${LAVENDER}[m]${RESET}  Back to Main Menu"
    echo ""
}

add_user() {
    echo ""
    echo -ne "  ${WHITE}Username: ${RESET}"
    read -r new_user
    if [ -z "$new_user" ]; then
        echo -e "  ${RED}Username cannot be empty.${RESET}"
        return
    fi
    if ! echo "$new_user" | grep -qP '^[a-z_][a-z0-9_-]{0,31}$'; then
        echo -e "  ${RED}Invalid username. Use lowercase letters, numbers, hyphens and underscores.${RESET}"
        return
    fi
    if id "$new_user" &>/dev/null; then
        echo -e "  ${RED}User '${new_user}' already exists.${RESET}"
        return
    fi

    echo -ne "  ${WHITE}Display Name: ${RESET}"
    read -r display_name
    if [ -z "$display_name" ]; then
        display_name="$new_user"
    fi

    echo -ne "  ${WHITE}Password: ${RESET}"
    read -rs new_pass
    echo ""
    if [ -z "$new_pass" ]; then
        echo -e "  ${RED}Password cannot be empty.${RESET}"
        return
    fi
    echo -ne "  ${WHITE}Confirm Password: ${RESET}"
    read -rs confirm_pass
    echo ""
    if [ "$new_pass" != "$confirm_pass" ]; then
        echo -e "  ${RED}Passwords do not match.${RESET}"
        return
    fi

    echo ""
    echo -e "  ${LAVENDER}Creating user '${new_user}'...${RESET}"
    if useradd -m -c "$display_name" -s /bin/bash "$new_user" 2>/dev/null; then
        echo "$new_user:$new_pass" | chpasswd 2>/dev/null
        echo -e "  ${GREEN}[✓]${RESET} User '${new_user}' created successfully"
        echo -e "  ${GRAY}    Display Name: ${display_name}${RESET}"
        echo -e "  ${GRAY}    Home:         /home/${new_user}${RESET}"
    else
        echo -e "  ${RED}[✗] Failed to create user. Are you running as root?${RESET}"
    fi
    echo ""
}

delete_user() {
    echo ""
    echo -e "  ${BLUE}── System Users ──${RESET}"
    echo ""
    awk -F: '$3 >= 1000 && $1 != "nobody" {printf "  %-20s %s (UID %s)\n", $1, $5, $3}' /etc/passwd
    echo ""
    echo -ne "  ${WHITE}Username to delete: ${RESET}"
    read -r del_user
    if [ -z "$del_user" ]; then
        echo -e "  ${GRAY}Cancelled.${RESET}"
        return
    fi
    if ! id "$del_user" &>/dev/null; then
        echo -e "  ${RED}User '${del_user}' does not exist.${RESET}"
        return
    fi
    if [ "$del_user" = "root" ]; then
        echo -e "  ${RED}Cannot delete the root user.${RESET}"
        return
    fi

    echo -ne "  ${YELLOW}Delete home directory too? [y/N]: ${RESET}"
    read -r del_home
    echo ""
    echo -ne "  ${RED}Are you sure you want to delete '${del_user}'? [y/N]: ${RESET}"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo -e "  ${GRAY}Cancelled.${RESET}"
        return
    fi

    echo ""
    if [ "$del_home" = "y" ] || [ "$del_home" = "Y" ]; then
        userdel -r "$del_user" 2>/dev/null
    else
        userdel "$del_user" 2>/dev/null
    fi

    if ! id "$del_user" &>/dev/null; then
        echo -e "  ${GREEN}[✓]${RESET} User '${del_user}' deleted"
    else
        echo -e "  ${RED}[✗] Failed to delete user. Are you running as root?${RESET}"
    fi
    echo ""
}

show_sudoers_menu() {
    echo ""
    echo -e "  ${BLUE}── Current Sudoers ──${RESET}"
    echo ""
    local found=0
    while IFS= read -r line; do
        if echo "$line" | grep -qP '^\s*[^#%].*\bALL\b'; then
            local sudoer
            sudoer=$(echo "$line" | awk '{print $1}')
            if id "$sudoer" &>/dev/null; then
                echo -e "  ${GREEN}●${RESET}  ${sudoer}  ${GRAY}(user)${RESET}"
                found=1
            fi
        fi
        if echo "$line" | grep -qP '^\s*%'; then
            local grp
            grp=$(echo "$line" | awk '{print $1}' | sed 's/^%//')
            echo -e "  ${LAVENDER}●${RESET}  %${grp}  ${GRAY}(group)${RESET}"
            found=1
        fi
    done < /etc/sudoers

    if [ -d /etc/sudoers.d ]; then
        for f in /etc/sudoers.d/*; do
            [ -f "$f" ] || continue
            while IFS= read -r line; do
                if echo "$line" | grep -qP '^\s*[^#%].*\bALL\b'; then
                    local sudoer
                    sudoer=$(echo "$line" | awk '{print $1}')
                    if id "$sudoer" &>/dev/null; then
                        echo -e "  ${GREEN}●${RESET}  ${sudoer}  ${GRAY}(user — $(basename "$f"))${RESET}"
                        found=1
                    fi
                fi
            done < "$f"
        done
    fi

    if [ "$found" = 0 ]; then
        echo -e "  ${GRAY}No sudoers entries found.${RESET}"
    fi

    # Also show members of the sudo group
    local sudo_members
    sudo_members=$(getent group sudo 2>/dev/null | cut -d: -f4)
    if [ -n "$sudo_members" ]; then
        echo ""
        echo -e "  ${GRAY}Members of 'sudo' group: ${sudo_members}${RESET}"
    fi

    echo ""
    echo -e "  ${WHITE}Actions:${RESET}"
    echo ""
    echo -e "  ${LAVENDER}[1]${RESET}  Add user to sudoers"
    echo -e "  ${LAVENDER}[2]${RESET}  Remove user from sudoers"
    echo -e "  ${LAVENDER}[m]${RESET}  Back"
    echo ""
    while true; do
        echo -ne "  ${WHITE}Sudoers ➤ ${RESET}"
        read -r sudo_choice
        case $sudo_choice in
            1)
                echo -ne "  ${WHITE}Username to grant sudo: ${RESET}"
                read -r sudo_user
                if [ -z "$sudo_user" ]; then
                    echo -e "  ${GRAY}Cancelled.${RESET}"
                elif ! id "$sudo_user" &>/dev/null; then
                    echo -e "  ${RED}User '${sudo_user}' does not exist.${RESET}"
                else
                    usermod -aG sudo "$sudo_user" 2>/dev/null
                    if groups "$sudo_user" 2>/dev/null | grep -q '\bsudo\b'; then
                        echo -e "  ${GREEN}[✓]${RESET} '${sudo_user}' added to sudoers"
                    else
                        echo -e "  ${RED}[✗] Failed. Are you running as root?${RESET}"
                    fi
                fi
                echo ""
                ;;
            2)
                echo -ne "  ${WHITE}Username to remove from sudo: ${RESET}"
                read -r unsudo_user
                if [ -z "$unsudo_user" ]; then
                    echo -e "  ${GRAY}Cancelled.${RESET}"
                elif [ "$unsudo_user" = "root" ]; then
                    echo -e "  ${RED}Cannot remove root from sudoers.${RESET}"
                elif ! id "$unsudo_user" &>/dev/null; then
                    echo -e "  ${RED}User '${unsudo_user}' does not exist.${RESET}"
                else
                    gpasswd -d "$unsudo_user" sudo 2>/dev/null
                    # Also remove from sudoers.d if present
                    rm -f "/etc/sudoers.d/$unsudo_user" 2>/dev/null
                    if ! groups "$unsudo_user" 2>/dev/null | grep -q '\bsudo\b'; then
                        echo -e "  ${GREEN}[✓]${RESET} '${unsudo_user}' removed from sudoers"
                    else
                        echo -e "  ${RED}[✗] Failed. Are you running as root?${RESET}"
                    fi
                fi
                echo ""
                ;;
            m)
                break
                ;;
            *)
                echo -e "  ${GRAY}Invalid option.${RESET}"
                ;;
        esac
    done
}

user_submenu() {
    show_user_menu
    while true; do
        echo -ne "  ${WHITE}Users ➤ ${RESET}"
        read -r user_choice
        case $user_choice in
            1)
                add_user
                ;;
            2)
                delete_user
                ;;
            3)
                show_sudoers_menu
                show_user_menu
                ;;
            m)
                show_menu
                break
                ;;
            *)
                echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
                ;;
        esac
    done
}

logout_all_sessions() {
    echo ""
    local my_tty
    my_tty=$(tty 2>/dev/null | sed 's|/dev/||')
    local sessions
    sessions=$(who 2>/dev/null | awk '{print $1, $2}')
    local count
    count=$(echo "$sessions" | grep -c . 2>/dev/null || echo 0)

    echo -e "  ${BLUE}── Active SSH Sessions ──${RESET}"
    echo ""
    if [ "$count" -le 1 ]; then
        echo -e "  ${GRAY}No other sessions are active.${RESET}"
        echo ""
        return
    fi

    who 2>/dev/null | while IFS= read -r line; do
        local tty
        tty=$(echo "$line" | awk '{print $2}')
        if [ "$tty" = "$my_tty" ]; then
            echo -e "  ${GREEN}●${RESET}  ${line}  ${GRAY}(this session)${RESET}"
        else
            echo -e "  ${YELLOW}●${RESET}  ${line}"
        fi
    done
    echo ""
    echo -ne "  ${RED}Log out ALL other sessions? [y/N]: ${RESET}"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo -e "  ${GRAY}Cancelled.${RESET}"
        echo ""
        return
    fi

    echo ""
    who 2>/dev/null | while IFS= read -r line; do
        local tty user pid
        tty=$(echo "$line" | awk '{print $2}')
        user=$(echo "$line" | awk '{print $1}')
        if [ "$tty" != "$my_tty" ]; then
            pid=$(ps -t "/dev/$tty" -o pid= 2>/dev/null | head -1 | tr -d ' ')
            if [ -n "$pid" ]; then
                kill -HUP "$pid" 2>/dev/null
                echo -e "  ${GREEN}[✓]${RESET} Logged out ${user} on ${tty}"
            fi
        fi
    done
    echo ""
    echo -e "  ${GREEN}Done.${RESET} Only this session remains."
    echo ""
}

center_text() {
    local text="$1" width="$2"
    local len=${#text}
    local pad=$(( (width - len) / 2 ))
    local right=$(( width - len - pad ))
    printf "%${pad}s%s%${right}s" "" "$text" ""
}

show_menu() {
    clear
    local cols
    cols=$(tput cols 2>/dev/null || echo 80)
    local box_w=$(( cols - 8 ))
    [ "$box_w" -gt 60 ] && box_w=60
    [ "$box_w" -lt 40 ] && box_w=40
    local inner=$(( box_w - 2 ))

    local border
    border=$(printf '═%.0s' $(seq 1 "$box_w"))
    local blank
    blank=$(printf ' %.0s' $(seq 1 "$inner"))

    local title1="H O R I Z O N   N E T W O R K   S E C U R E"
    local title2="E N C L A V E"
    local row1 row2
    row1=$(center_text "$title1" "$inner")
    row2=$(center_text "$title2" "$inner")

    echo ""
    echo -e "${LAVENDER}  ╔${border}╗"
    echo -e "  ║${blank}║"
    echo -e "  ║${row1}║"
    echo -e "  ║${row2}║"
    echo -e "  ║${blank}║"
    echo -e "  ╚${border}╝${RESET}"
    echo ""
    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""

    local col_w=$(( (cols - 6) / 2 ))
    [ "$col_w" -gt 35 ] && col_w=35
    [ "$col_w" -lt 20 ] && col_w=20

    local items_l=("Open Console" "Services" "Updates" "Network Info")
    local items_r=("System Status" "Horizon Advertising" "View Logs" "User Management")
    local nums_l=(1 3 5 7)
    local nums_r=(2 4 6 8)

    local i
    for i in 0 1 2 3; do
        local left right
        left=$(printf "${LAVENDER}[%s]${RESET}  %-*s" "${nums_l[$i]}" $(( col_w - 6 )) "${items_l[$i]}")
        right=$(printf "${LAVENDER}[%s]${RESET}  %s" "${nums_r[$i]}" "${items_r[$i]}")
        echo -e "  ${left}${right}"
    done
    echo ""
    local logout_all
    logout_all=$(printf "${LAVENDER}[9]${RESET}  %-*s" $(( col_w - 6 )) "Log Out All Sessions")
    echo -e "  ${logout_all}"
    local lo exit_opt
    lo=$(printf "${LAVENDER}[l]${RESET}  %-*s" $(( col_w - 6 )) "Log Out")
    exit_opt=$(printf "${LAVENDER}[0]${RESET}  %s" "Exit")
    echo -e "  ${lo}${exit_opt}"
    echo ""
}

show_ha_menu() {
    clear
    echo ""
    echo -e "${BLUE}  ╔═══════════════════════════════════════════════════╗"
    echo -e "  ║                                                   ║"
    echo -e "  ║         H O R I Z O N   A D V E R T I S I N G     ║"
    echo -e "  ║                                                   ║"
    echo -e "  ╚═══════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${GRAY}Directory: ${HA_DIR}${RESET}"
    echo -e "  ${GRAY}Website:   http://217.154.34.205/ha${RESET}"
    echo ""

    if command -v pm2 &>/dev/null; then
        local services
        services=$(ha_service_names)
        if [ -n "$services" ]; then
            echo -e "  ${WHITE}Services:${RESET}"
            echo "$services" | while read -r svc; do
                local status
                status=$(pm2 show "$svc" 2>/dev/null | grep "status" | head -1 | awk '{print $NF}')
                if [ "$status" = "online" ]; then
                    echo -e "  ${GREEN}●${RESET}  ${svc}  ${GREEN}${status}${RESET}"
                else
                    echo -e "  ${RED}●${RESET}  ${svc}  ${RED}${status}${RESET}"
                fi
            done
            echo ""
        else
            echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
            echo ""
        fi
    fi

    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""
    echo -e "  ${LAVENDER}[1]${RESET}  Open HA Console"
    echo -e "  ${LAVENDER}[2]${RESET}  Restart All HA Services"
    echo -e "  ${LAVENDER}[3]${RESET}  Stop All HA Services"
    echo -e "  ${LAVENDER}[4]${RESET}  Start All HA Services"
    echo -e "  ${LAVENDER}[5]${RESET}  View HA Logs"
    echo -e "  ${LAVENDER}[m]${RESET}  Back to Main Menu"
    echo ""
}

ha_submenu() {
    show_ha_menu
    while true; do
        echo -ne "  ${WHITE}HA ➤ ${RESET}"
        read -r ha_choice
        case $ha_choice in
            1)
                echo -e "\n  ${LAVENDER}Opening Horizon Advertising console...${RESET}\n"
                cd "$HA_DIR" 2>/dev/null || echo -e "  ${RED}Directory ${HA_DIR} not found${RESET}"
                HN_IN_CONSOLE=1 exec bash --login
                ;;
            2)
                echo ""
                local services
                services=$(ha_service_names)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${LAVENDER}Restarting all HA services...${RESET}"
                    echo "$services" | while read -r svc; do
                        pm2 restart "$svc" 2>/dev/null
                        echo -e "  ${GREEN}[✓]${RESET} Restarted $svc"
                    done
                fi
                echo ""
                ;;
            3)
                echo ""
                local services
                services=$(ha_service_names)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${LAVENDER}Stopping all HA services...${RESET}"
                    echo "$services" | while read -r svc; do
                        pm2 stop "$svc" 2>/dev/null
                        echo -e "  ${GREEN}[✓]${RESET} Stopped $svc"
                    done
                fi
                echo ""
                ;;
            4)
                echo ""
                local services
                services=$(ha_service_names)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${LAVENDER}Starting all HA services...${RESET}"
                    echo "$services" | while read -r svc; do
                        pm2 start "$svc" 2>/dev/null
                        echo -e "  ${GREEN}[✓]${RESET} Started $svc"
                    done
                fi
                echo ""
                ;;
            5)
                echo ""
                local services
                services=$(ha_service_names)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${BLUE}── HA Logs ──${RESET}"
                    echo "$services" | while read -r svc; do
                        pm2 logs "$svc" --lines 15 --nostream 2>/dev/null
                    done
                fi
                echo ""
                ;;
            m)
                show_menu
                break
                ;;
            *)
                echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
                ;;
        esac
    done
}

REPO_DIR="/root/HorizonNetwork"
REPO_BRANCH="claude/vps-welcome-screen-m373a1"

show_updates_menu() {
    clear
    echo ""
    echo -e "${BLUE}  ╔═══════════════════════════════════════════════════╗"
    echo -e "  ║                                                   ║"
    echo -e "  ║              U P D A T E S                        ║"
    echo -e "  ║                                                   ║"
    echo -e "  ╚═══════════════════════════════════════════════════╝${RESET}"
    echo ""

    if sudo test -d "$REPO_DIR/.git"; then
        local current_branch
        current_branch=$(sudo git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
        local last_commit
        last_commit=$(sudo git -C "$REPO_DIR" log -1 --format="%h %s" 2>/dev/null)
        local last_pull
        last_pull=$(sudo stat -c %Y "$REPO_DIR/.git/FETCH_HEAD" 2>/dev/null)
        if [ -n "$last_pull" ]; then
            last_pull=$(date -d @"$last_pull" "+%Y-%m-%d %H:%M" 2>/dev/null)
        else
            last_pull="never"
        fi
        echo -e "  ${GRAY}Repository:  ${REPO_DIR}${RESET}"
        echo -e "  ${GRAY}Branch:      ${current_branch}${RESET}"
        echo -e "  ${GRAY}Last commit: ${last_commit}${RESET}"
        echo -e "  ${GRAY}Last pull:   ${last_pull}${RESET}"
    else
        echo -e "  ${RED}Repository not found at ${REPO_DIR}${RESET}"
    fi

    echo ""
    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""
    echo -e "  ${LAVENDER}[1]${RESET}  Pull Latest Updates"
    echo -e "  ${LAVENDER}[2]${RESET}  Pull & Reinstall Welcome Screen"
    echo -e "  ${LAVENDER}[3]${RESET}  Pull & Rebuild Secure Enclave"
    echo -e "  ${LAVENDER}[4]${RESET}  Setup Clover Share"
    echo -e "  ${LAVENDER}[5]${RESET}  View Recent Commits"
    echo -e "  ${LAVENDER}[6]${RESET}  Open Update Console"
    echo -e "  ${LAVENDER}[m]${RESET}  Back to Main Menu"
    echo ""
}

updates_submenu() {
    show_updates_menu
    while true; do
        echo -ne "  ${WHITE}Updates ➤ ${RESET}"
        read -r upd_choice
        case $upd_choice in
            1)
                echo ""
                echo -e "  ${LAVENDER}Pulling latest from ${REPO_BRANCH}...${RESET}"
                echo ""
                sudo git -C "$REPO_DIR" fetch origin "$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                sudo git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                echo ""
                echo -e "  ${GREEN}[✓] Updated to latest${RESET}"
                echo ""
                ;;
            2)
                echo ""
                echo -e "  ${LAVENDER}Pulling and reinstalling welcome screen...${RESET}"
                echo ""
                sudo git -C "$REPO_DIR" fetch origin "$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                sudo git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                echo ""
                sudo bash "$REPO_DIR/setup-welcome.sh"
                echo -e "  ${GREEN}[✓] Welcome screen reinstalled. Changes take effect on next login.${RESET}"
                echo ""
                ;;
            3)
                echo ""
                echo -e "  ${LAVENDER}Pulling and rebuilding Secure Enclave...${RESET}"
                echo ""
                sudo git -C "$REPO_DIR" fetch origin "$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                sudo git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH" 2>&1 | sed 's/^/  /'
                echo ""
                if sudo test -f "$REPO_DIR/hn-terminal/build-and-share.sh"; then
                    sudo bash "$REPO_DIR/hn-terminal/build-and-share.sh"
                else
                    echo -e "  ${RED}Build script not found${RESET}"
                fi
                echo ""
                ;;
            4)
                echo ""
                if sudo test -f "$REPO_DIR/setup-clover-share.sh"; then
                    sudo bash "$REPO_DIR/setup-clover-share.sh"
                else
                    echo -e "  ${RED}Setup script not found. Pull latest code first.${RESET}"
                fi
                echo ""
                echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
                read -r
                show_updates_menu
                ;;
            5)
                echo ""
                echo -e "  ${BLUE}── Recent Commits ──${RESET}"
                echo ""
                sudo git -C "$REPO_DIR" log --oneline -15 2>/dev/null | sed 's/^/  /'
                echo ""
                ;;
            6)
                echo ""
                echo -e "  ${LAVENDER}Opening update console at ${REPO_DIR}...${RESET}"
                echo -e "  ${GRAY}Type 'exit' to return to the menu.${RESET}"
                echo ""
                sudo bash -c "cd '$REPO_DIR' && exec bash"
                show_updates_menu
                ;;
            m)
                show_menu
                break
                ;;
            *)
                echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
                ;;
        esac
    done
}

while true; do
    show_menu
    echo -ne "  ${WHITE}➤ ${RESET}"
    read -r choice
    case $choice in
        1)
            echo -e "\n  ${LAVENDER}Opening console...${RESET}\n"
            HN_IN_CONSOLE=1 exec bash --login
            ;;
        2)
            clear
            echo ""
            echo -e "  ${BLUE}── System Status ──${RESET}"
            echo ""
            echo -e "  ${GRAY}Hostname:${RESET}  $(hostname)"
            echo -e "  ${GRAY}Uptime:${RESET}    $(uptime -p 2>/dev/null || uptime)"
            echo -e "  ${GRAY}Load:${RESET}      $(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}')"
            echo -e "  ${GRAY}Memory:${RESET}    $(free -h 2>/dev/null | awk '/Mem:/{print $3 "/" $2}')"
            echo -e "  ${GRAY}Disk:${RESET}      $(df -h / 2>/dev/null | awk 'NR==2{print $3 "/" $2 " (" $5 " used)"}')"
            echo ""
            echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
            read -r
            ;;
        3)
            echo ""
            if ! command -v pm2 &>/dev/null; then
                echo -e "  ${RED}PM2 is not installed.${RESET}"
                echo -e "  ${GRAY}Run: npm install -g pm2${RESET}"
                echo ""
                echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
                read -r
            else
                echo -e "  ${BLUE}── Services ──${RESET}"
                echo ""
                pm2 list 2>/dev/null
                echo ""
                echo -e "  ${WHITE}PM2 Actions:${RESET}"
                echo -e "  ${LAVENDER}[a]${RESET}  Start a process    ${LAVENDER}[b]${RESET}  Stop a process"
                echo -e "  ${LAVENDER}[c]${RESET}  Restart a process  ${LAVENDER}[d]${RESET}  Delete a process"
                echo -e "  ${LAVENDER}[e]${RESET}  View process logs  ${LAVENDER}[f]${RESET}  PM2 monit"
                echo -e "  ${LAVENDER}[m]${RESET}  Back to main menu"
                echo ""
                while true; do
                    echo -ne "  ${WHITE}PM2 ➤ ${RESET}"
                    read -r pm2_choice
                    case $pm2_choice in
                        a)
                            echo -ne "  ${GRAY}Script/app path: ${RESET}"
                            read -r app_path
                            echo -ne "  ${GRAY}Process name (optional): ${RESET}"
                            read -r app_name
                            if [ -n "$app_name" ]; then
                                pm2 start "$app_path" --name "$app_name"
                            else
                                pm2 start "$app_path"
                            fi
                            echo ""
                            ;;
                        b)
                            echo -ne "  ${GRAY}Process name/id: ${RESET}"
                            read -r proc
                            pm2 stop "$proc"
                            echo ""
                            ;;
                        c)
                            echo -ne "  ${GRAY}Process name/id: ${RESET}"
                            read -r proc
                            pm2 restart "$proc"
                            echo ""
                            ;;
                        d)
                            echo -ne "  ${GRAY}Process name/id: ${RESET}"
                            read -r proc
                            pm2 delete "$proc"
                            echo ""
                            ;;
                        e)
                            echo -ne "  ${GRAY}Process name/id (blank for all): ${RESET}"
                            read -r proc
                            if [ -n "$proc" ]; then
                                pm2 logs "$proc" --lines 30 --nostream
                            else
                                pm2 logs --lines 30 --nostream
                            fi
                            echo ""
                            ;;
                        f)
                            pm2 monit
                            ;;
                        m)
                            break
                            ;;
                        *)
                            echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
                            ;;
                    esac
                done
            fi
            ;;
        4)
            ha_submenu
            ;;
        5)
            updates_submenu
            ;;
        6)
            clear
            echo ""
            echo -e "  ${BLUE}── Recent Logs ──${RESET}"
            echo ""
            journalctl --no-pager -n 20 2>/dev/null || echo "  No journal access"
            echo ""
            echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
            read -r
            ;;
        7)
            clear
            echo ""
            echo -e "  ${BLUE}── Network Info ──${RESET}"
            echo ""
            echo -e "  ${GRAY}Public IP:${RESET}  217.154.34.205"
            echo -e "  ${GRAY}Tailscale:${RESET} 100.95.232.62"
            ip -4 addr show 2>/dev/null | awk '/inet /{printf "  %-12s %s\n", $NF, $2}'
            echo ""
            echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
            read -r
            ;;
        8)
            user_submenu
            ;;
        9)
            logout_all_sessions
            echo ""
            echo -ne "  ${GRAY}Press Enter to continue...${RESET}"
            read -r
            ;;
        l|L)
            echo -e "\n  ${GRAY}Logging out...${RESET}\n"
            logout 2>/dev/null || exit 0
            ;;
        0)
            echo -e "\n  ${GRAY}Disconnecting...${RESET}\n"
            kill -HUP "$(ps -o ppid= -p $$ | tr -d ' ')" 2>/dev/null
            exit 0
            ;;
        *)
            ;;
    esac
done
