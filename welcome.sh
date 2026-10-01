#!/usr/bin/env bash

BLUE='\033[1;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

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
    echo -e "  ${CYAN}[4]${RESET}  Manage Services (systemd)"
    echo -e "  ${CYAN}[5]${RESET}  View Logs"
    echo -e "  ${CYAN}[6]${RESET}  Network Info"
    echo -e "  ${CYAN}[0]${RESET}  Exit"
    echo ""
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
            echo ""
            echo -e "  ${BLUE}── Active Services (systemd) ──${RESET}"
            systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | \
                awk '{printf "  %-40s %s\n", $1, $4}' | head -20
            echo ""
            ;;
        5)
            echo ""
            echo -e "  ${BLUE}── Recent Logs ──${RESET}"
            journalctl --no-pager -n 20 2>/dev/null || echo "  No journal access"
            echo ""
            ;;
        6)
            echo ""
            echo -e "  ${BLUE}── Network Info ──${RESET}"
            echo -e "  ${GRAY}Public IP:${RESET}  217.154.34.205"
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
