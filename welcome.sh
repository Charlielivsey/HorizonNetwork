#!/usr/bin/env bash

BLUE='\033[1;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
RESET='\033[0m'

clear

echo ""
echo -e "${BLUE}  ╔═══════════════════════════════════════════════════╗"
echo -e "  ║                                                   ║"
echo -e "  ║            H O R I Z O N   N E T W O R K          ║"
echo -e "  ║                                                   ║"
echo -e "  ╚═══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GRAY}VPS: 217.154.34.205${RESET}"
echo ""
echo -e "  ${WHITE}Select an option:${RESET}"
echo ""
echo -e "  ${CYAN}[1]${RESET}  Open Console"
echo -e "  ${CYAN}[2]${RESET}  System Status"
echo -e "  ${CYAN}[3]${RESET}  Manage Services"
echo -e "  ${CYAN}[4]${RESET}  View Logs"
echo -e "  ${CYAN}[5]${RESET}  Network Info"
echo -e "  ${CYAN}[0]${RESET}  Exit"
echo ""

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
            echo -e "  ${BLUE}── Active Services ──${RESET}"
            systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | \
                awk '{printf "  %-40s %s\n", $1, $4}' | head -20
            echo ""
            ;;
        4)
            echo ""
            echo -e "  ${BLUE}── Recent Logs ──${RESET}"
            journalctl --no-pager -n 20 2>/dev/null || echo "  No journal access"
            echo ""
            ;;
        5)
            echo ""
            echo -e "  ${BLUE}── Network Info ──${RESET}"
            echo -e "  ${GRAY}Public IP:${RESET}  217.154.34.205"
            ip -4 addr show 2>/dev/null | awk '/inet /{printf "  %-12s %s\n", $NF, $2}'
            echo ""
            ;;
        0)
            echo -e "\n  ${GRAY}Goodbye.${RESET}\n"
            exit 0
            ;;
        *)
            echo -e "  ${GRAY}Invalid option. Try again.${RESET}"
            ;;
    esac
done
