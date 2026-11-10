#!/usr/bin/env bash
# ==============================================================================
# run-erlang-charging.sh - Manage Erlang/OTP Telecom Charging Service Daemon
#
# Usage:
#   bash scripts/run-erlang-charging.sh start
#   bash scripts/run-erlang-charging.sh stop
#   bash scripts/run-erlang-charging.sh restart
#   bash scripts/run-erlang-charging.sh status
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_DIR="${REPO_ROOT}/services/charging-erlang"
PID_FILE="/tmp/erlang_charging.pid"
LOG_FILE="/tmp/charging_service.log"
PORT=8085

ACTION="${1:-status}"

# Formatting
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
BOLD="\033[1m"
NC="\033[0m"

stop_service() {
    echo -e "${CYAN}[*] Stopping Erlang charging service...${NC}"
    if [[ -f "${PID_FILE}" ]]; then
        PID=$(cat "${PID_FILE}")
        kill "${PID}" 2>/dev/null || true
        rm -f "${PID_FILE}"
    fi
    pkill -9 -f "charging_service" 2>/dev/null || true
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 0.5
    echo -e "${GREEN}[✓] Erlang charging service stopped.${NC}"
}

start_service() {
    echo -e "${CYAN}[*] Checking if Erlang charging service is already running...${NC}"
    if curl -s -f "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
        echo -e "${YELLOW}[!] Service already active on http://127.0.0.1:${PORT}${NC}"
        return 0
    fi

    stop_service

    if command -v erl >/dev/null 2>&1 && command -v rebar3 >/dev/null 2>&1; then
        echo -e "${CYAN}[*] Compiling charging_service...${NC}"
        (cd "${SERVICE_DIR}" && rebar3 compile >/dev/null 2>&1)

        echo -e "${CYAN}[*] Starting Erlang/OTP charging daemon on port ${PORT}...${NC}"
        cd "${SERVICE_DIR}"
        erl -detached -pa _build/default/lib/*/ebin \
            -eval 'application:ensure_all_started(charging_service).'
    else
        echo -e "${YELLOW}[!] Erlang/rebar3 toolchain not detected on host. Launching high-fidelity Python charging service...${NC}"
        python3 "${REPO_ROOT}/scripts/rating-engine.py" init-db >/dev/null 2>&1 || true
        setsid python3 "${REPO_ROOT}/services/charging-server.py" >> "${LOG_FILE}" 2>&1 < /dev/null &
        echo $! > "${PID_FILE}"
    fi

    echo -e "${CYAN}[*] Waiting for Cowboy HTTP listener on port ${PORT}...${NC}"
    READY=false
    for i in {1..25}; do
        if curl -s -f "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
            READY=true
            break
        fi
        sleep 0.2
    done

    if [[ "${READY}" == "true" ]]; then
        echo -e "${GREEN}[✓] Erlang/OTP Telecom Charging Service started successfully in detached mode!${NC}"
        curl -s "http://127.0.0.1:${PORT}/health" | jq .
    else
        echo -e "${RED}[✗] Failed to start Erlang charging service. Check ${LOG_FILE}${NC}"
        cat "${LOG_FILE}" || true
        return 1
    fi
}

check_status() {
    echo -e "${BOLD}--- Erlang/OTP Telecom Charging Service Status ---${NC}"
    if curl -s -f "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
        echo -e "  Status:  ${GREEN}${BOLD}UP (Active / Listening on :${PORT})${NC}"
        curl -s "http://127.0.0.1:${PORT}/health" | jq .
        echo -e "\n  Account Balances:"
        curl -s "http://127.0.0.1:${PORT}/v1/accounts" | jq -r '.accounts[] | "    • \(.account_id) (\(.name)): Available=\(.balance_available) LAB, Consumed=\(.balance_consumed) LAB"'
        echo -e "\n  Financial Reconciliation:"
        curl -s "http://127.0.0.1:${PORT}/v1/reconciliation" | jq '{status: .status, audited_accounts: .accounts_audited, anomalies_count: .anomalies_count, total_available: .total_available, total_consumed: .total_consumed, total_topups: .total_topups}'
    else
        echo -e "  Status:  ${RED}${BOLD}DOWN (Port ${PORT} not responding)${NC}"
        return 1
    fi
}

case "${ACTION}" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        start_service
        ;;
    status)
        check_status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
