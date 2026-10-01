#!/usr/bin/env bash

BLUE='\033[1;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

HA_DIR="/opt/horizon-advertising"

show_menu() {
    clear
    echo ""
    echo -e "${BLUE}  ╔═══════════════════════════════════════════════════╗"
    echo -e "  ║                                                   ║"
    echo -e "  ║            H O R I Z O N   N E T W O R K          ║"
    echo -e "  ║                                                   ║"
    echo -e "  ╚═══════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${GRAY}VPS: 217.154.34.205  |  Tailscale: 100.95.232.62${RESET}"
    echo ""
    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""
    echo -e "  ${CYAN}[1]${RESET}  Open Console"
    echo -e "  ${CYAN}[2]${RESET}  System Status"
    echo -e "  ${CYAN}[3]${RESET}  PM2 Services"
    echo -e "  ${CYAN}[4]${RESET}  Horizon Advertising"
    echo -e "  ${CYAN}[5]${RESET}  Manage Services (systemd)"
    echo -e "  ${CYAN}[6]${RESET}  View Logs"
    echo -e "  ${CYAN}[7]${RESET}  Network Info"
    echo -e "  ${CYAN}[0]${RESET}  Exit"
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
    echo -e "  ${GRAY}Website:   http://100.95.232.62:3100${RESET}"
    echo ""

    # Show HA service status
    if command -v pm2 &>/dev/null; then
        local status
        status=$(pm2 jlist 2>/dev/null | grep -o '"name":"ha-[^"]*","[^}]*"status":"[^"]*"' | head -5)
        if [ -n "$status" ]; then
            echo -e "  ${WHITE}Services:${RESET}"
            pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'].startswith('ha-'):
            s = p['pm2_env']['status']
            color = '\033[0;32m' if s == 'online' else '\033[0;31m'
            print(f\"  {color}●\033[0m  {p['name']:20s} {s}\")
except: pass
" 2>/dev/null
            echo ""
        else
            echo -e "  ${YELLOW}No HA services running${RESET}"
            echo ""
        fi
    fi

    echo -e "  ${WHITE}Select an option:${RESET}"
    echo ""
    echo -e "  ${CYAN}[1]${RESET}  Open HA Console"
    echo -e "  ${CYAN}[2]${RESET}  Restart All HA Services"
    echo -e "  ${CYAN}[3]${RESET}  Stop All HA Services"
    echo -e "  ${CYAN}[4]${RESET}  Start All HA Services"
    echo -e "  ${CYAN}[5]${RESET}  View HA Logs"
    echo -e "  ${CYAN}[m]${RESET}  Back to Main Menu"
    echo ""
}

ha_get_services() {
    pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'].startswith('ha-'):
            print(p['name'])
except: pass
" 2>/dev/null
}

ha_submenu() {
    show_ha_menu
    while true; do
        echo -ne "  ${WHITE}HA ➤ ${RESET}"
        read -r ha_choice
        case $ha_choice in
            1)
                echo -e "\n  ${CYAN}Opening Horizon Advertising console...${RESET}\n"
                cd "$HA_DIR" 2>/dev/null || echo -e "  ${RED}Directory ${HA_DIR} not found${RESET}"
                exec bash --login
                ;;
            2)
                echo ""
                local services
                services=$(ha_get_services)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${CYAN}Restarting all HA services...${RESET}"
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
                services=$(ha_get_services)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${CYAN}Stopping all HA services...${RESET}"
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
                services=$(ha_get_services)
                if [ -z "$services" ]; then
                    echo -e "  ${YELLOW}No HA services found in PM2${RESET}"
                else
                    echo -e "  ${CYAN}Starting all HA services...${RESET}"
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
                services=$(ha_get_services)
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

show_menu

while true; do
    echo -ne "  ${WHITE}➤ ${RESET}"
    read -r choice
    case $choice in
        1)
            echo -e "\n  ${CYAN}Opening console...${RESET}\n"
            exec bash --login
            ;;
        2)
            echo ""
            echo -e "  ${BLUE}── System Status ──${RESET}"
            echo -e "  ${GRAY}Hostname:${RESET}  $(hostname)"
            echo -e "  ${GRAY}Uptime:${RESET}    $(uptime -p 2>/dev/null || uptime)"
            echo -e "  ${GRAY}Load:${RESET}      $(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}')"
            echo -e "  ${GRAY}Memory:${RESET}    $(free -h 2>/dev/null | awk '/Mem:/{print $3 "/" $2}')"
            echo -e "  ${GRAY}Disk:${RESET}      $(df -h / 2>/dev/null | awk 'NR==2{print $3 "/" $2 " (" $5 " used)"}')"
            echo ""
            ;;
        3)
            echo ""
            if ! command -v pm2 &>/dev/null; then
                echo -e "  ${RED}PM2 is not installed.${RESET}"
                echo -e "  ${GRAY}Run: npm install -g pm2${RESET}"
            else
                echo -e "  ${BLUE}── PM2 Services ──${RESET}"
                echo ""
                pm2 list 2>/dev/null
                echo ""
                echo -e "  ${WHITE}PM2 Actions:${RESET}"
                echo -e "  ${CYAN}[a]${RESET}  Start a process    ${CYAN}[b]${RESET}  Stop a process"
                echo -e "  ${CYAN}[c]${RESET}  Restart a process  ${CYAN}[d]${RESET}  Delete a process"
                echo -e "  ${CYAN}[e]${RESET}  View process logs  ${CYAN}[f]${RESET}  PM2 monit"
                echo -e "  ${CYAN}[m]${RESET}  Back to main menu"
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
                            show_menu
                            break
                            ;;
                        *)
                            echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
                            ;;
                    esac
                done
            fi
            echo ""
            ;;
        4)
            ha_submenu
            ;;
        5)
            echo ""
            echo -e "  ${BLUE}── Active Services (systemd) ──${RESET}"
            systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | \
                awk '{printf "  %-40s %s\n", $1, $4}' | head -20
            echo ""
            ;;
        6)
            echo ""
            echo -e "  ${BLUE}── Recent Logs ──${RESET}"
            journalctl --no-pager -n 20 2>/dev/null || echo "  No journal access"
            echo ""
            ;;
        7)
            echo ""
            echo -e "  ${BLUE}── Network Info ──${RESET}"
            echo -e "  ${GRAY}Public IP:${RESET}  217.154.34.205"
            echo -e "  ${GRAY}Tailscale:${RESET} 100.95.232.62"
            ip -4 addr show 2>/dev/null | awk '/inet /{printf "  %-12s %s\n", $NF, $2}'
            echo ""
            ;;
        0)
            echo -e "\n  ${GRAY}Disconnecting...${RESET}\n"
            kill -HUP "$(ps -o ppid= -p $$ | tr -d ' ')" 2>/dev/null
            exit 0
            ;;
        *)
            echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
            ;;
    esac
done
