#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Open Telecom Lab — Telecom Operations & Revenue Control Center GUI Runner
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   bash scripts/run-gui.sh              # Start GUI server in background (:8088)
#   bash scripts/run-gui.sh start        # Start GUI server in background (:8088)
#   bash scripts/run-gui.sh stop         # Stop GUI server
#   bash scripts/run-gui.sh restart      # Restart GUI server
#   bash scripts/run-gui.sh status       # Check status & connectivity
#   bash scripts/run-gui.sh logs         # Follow GUI server logs
#   bash scripts/run-gui.sh foreground   # Run directly in foreground
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GUI_DIR="${REPO_ROOT}/services/telecom-gui"
SERVER_SCRIPT="${GUI_DIR}/server.py"
PID_FILE="/tmp/telecom-gui.pid"
LOG_FILE="/tmp/telecom-gui.log"
PORT="${GUI_PORT:-8088}"
HOST="${GUI_HOST:-0.0.0.0}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

get_pid() {
    if [ -f "${PID_FILE}" ]; then
        local pid
        pid=$(cat "${PID_FILE}" 2>/dev/null || echo "")
        if [ -n "${pid}" ] && ps -p "${pid}" >/dev/null 2>&1; then
            echo "${pid}"
            return 0
        fi
    fi
    # Fallback to pgrep
    pgrep -f "python3.*${SERVER_SCRIPT}" 2>/dev/null || echo ""
}

start_gui() {
    local pid
    pid=$(get_pid)
    if [ -n "${pid}" ]; then
        echo -e "${YELLOW}[!] Telecom Control Center GUI is already running (PID: ${pid})${NC}"
        echo -e "    Access UI at: ${CYAN}http://127.0.0.1:${PORT}${NC}"
        return 0
    fi

    echo -e "${BOLD}[+] Starting Telecom Operations & Revenue Control Center GUI...${NC}"
    : > "${LOG_FILE}"

    export GUI_PORT="${PORT}"
    export GUI_HOST="${HOST}"

    setsid python3 "${SERVER_SCRIPT}" >> "${LOG_FILE}" 2>&1 < /dev/null &
    local new_pid=$!
    echo "${new_pid}" > "${PID_FILE}"

    sleep 1.5
    if ps -p "${new_pid}" >/dev/null 2>&1; then
        echo -e "  ${GREEN}[✓] GUI Server started successfully (PID: ${new_pid})${NC}"
        echo -e "  ${BOLD}🌐 Dashboard URL:${NC}   ${CYAN}http://127.0.0.1:${PORT}${NC}"
        echo -e "  ${BOLD}📄 Server Log:${NC}      ${LOG_FILE}"
        echo -e "  ${BOLD}🔌 Erlang Charging:${NC} http://127.0.0.1:8085"
        echo -e "  ${BOLD}📊 Prometheus:${NC}      http://172.19.0.2:30090"
        echo -e "  ${BOLD}🎯 Alertmanager:${NC}    http://172.19.0.2:30093"
    else
        echo -e "  ${RED}[✗] Failed to start GUI server. Log output:${NC}"
        cat "${LOG_FILE}"
        return 1
    fi
}

stop_gui() {
    local pid
    pid=$(get_pid)
    if [ -z "${pid}" ]; then
        echo -e "${YELLOW}[!] Telecom GUI server is not running.${NC}"
        rm -f "${PID_FILE}" 2>/dev/null || true
        return 0
    fi

    echo -e "${BOLD}[+] Stopping Telecom Control Center GUI (PID: ${pid})...${NC}"
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if ps -p "${pid}" >/dev/null 2>&1; then
        kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${PID_FILE}" 2>/dev/null || true
    echo -e "  ${GREEN}[✓] GUI Server stopped.${NC}"
}

status_gui() {
    local pid
    pid=$(get_pid)
    echo -e "${BOLD}═════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Telecom Operations & Revenue Control Center GUI Status            ${NC}"
    echo -e "${BOLD}═════════════════════════════════════════════════════════════════════${NC}"

    if [ -n "${pid}" ]; then
        echo -e "  Status:        ${GREEN}RUNNING${NC} (PID: ${pid})"
        echo -e "  Dashboard URL: ${CYAN}http://127.0.0.1:${PORT}${NC}"
        echo -e "  Server Script: ${SERVER_SCRIPT}"
        echo -e "  Log Location:  ${LOG_FILE}"
        echo ""
        echo -e "${BOLD}Backend Connectivity Check:${NC}"
        
        # Test GUI API
        if curl -s -f --connect-timeout 2 "http://127.0.0.1:${PORT}/api/system/health" >/dev/null 2>&1; then
            echo -e "  [✓] GUI REST API (:8088):         ${GREEN}UP & RESPONSIVE${NC}"
        else
            echo -e "  [✗] GUI REST API (:8088):         ${RED}DOWN OR UNRESPONSIVE${NC}"
        fi

        # Test Erlang Charging
        if curl -s -f --connect-timeout 2 "http://127.0.0.1:8085/health" >/dev/null 2>&1; then
            echo -e "  [✓] Erlang Charging Engine (:8085): ${GREEN}CONNECTED${NC}"
        else
            echo -e "  [!] Erlang Charging Engine (:8085): ${YELLOW}OFFLINE${NC}"
        fi

        # Test Prometheus
        if curl -s -f --connect-timeout 2 "http://172.19.0.2:30090/-/ready" >/dev/null 2>&1; then
            echo -e "  [✓] Prometheus Telemetry (:30090):  ${GREEN}CONNECTED${NC}"
        else
            echo -e "  [!] Prometheus Telemetry (:30090):  ${YELLOW}OFFLINE${NC}"
        fi
    else
        echo -e "  Status:        ${RED}STOPPED${NC}"
        echo -e "  Run 'bash scripts/run-gui.sh start' to launch the GUI."
    fi
    echo -e "${BOLD}═════════════════════════════════════════════════════════════════════${NC}"
}

follow_logs() {
    if [ ! -f "${LOG_FILE}" ]; then
        echo -e "${YELLOW}[!] Log file ${LOG_FILE} does not exist yet.${NC}"
        return 1
    fi
    echo -e "${BOLD}[+] Tailing logs from ${LOG_FILE} (Ctrl+C to exit)...${NC}"
    tail -f "${LOG_FILE}"
}

run_foreground() {
    stop_gui
    export GUI_PORT="${PORT}"
    export GUI_HOST="${HOST}"
    echo -e "${BOLD}[+] Launching Telecom Control Center GUI in foreground on http://${HOST}:${PORT}...${NC}"
    exec python3 "${SERVER_SCRIPT}"
}

TARGET="${1:-start}"

case "${TARGET}" in
    start)
        start_gui
        ;;
    stop)
        stop_gui
        ;;
    restart)
        stop_gui
        sleep 1
        start_gui
        ;;
    status)
        status_gui
        ;;
    logs)
        follow_logs
        ;;
    foreground|fg)
        run_foreground
        ;;
    *)
        echo "Usage: bash scripts/run-gui.sh [start|stop|restart|status|logs|foreground]"
        exit 1
        ;;
esac
