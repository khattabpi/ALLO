#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Open Telecom Lab — Launch UERANSIM gNodeB Instances
# ─────────────────────────────────────────────────────────────────
# Usage:
#   sudo bash scripts/run-gnb.sh              # Launch both Home & Visited gNodeBs
#   sudo bash scripts/run-gnb.sh all          # Launch both Home & Visited gNodeBs
#   sudo bash scripts/run-gnb.sh home         # Launch gNodeB-Home (PLMN 602/03, 602/04)
#   sudo bash scripts/run-gnb.sh visited      # Launch gNodeB-Visited (PLMN 218/90)
#   sudo bash scripts/run-gnb.sh stop         # Stop all running gNodeB instances
#   sudo bash scripts/run-gnb.sh stop home    # Stop gNodeB-Home only
#   sudo bash scripts/run-gnb.sh stop visited # Stop gNodeB-Visited only
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${EUID}" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

GNB_HOME_CONFIG="${REPO_ROOT}/configs/ueransim/open5gs-gnb-home.yaml"
[ ! -f "${GNB_HOME_CONFIG}" ] && GNB_HOME_CONFIG="${REPO_ROOT}/configs/ueransim/gnb-home.yaml"

GNB_VISITED_CONFIG="${REPO_ROOT}/configs/ueransim/open5gs-gnb-visited.yaml"
[ ! -f "${GNB_VISITED_CONFIG}" ] && GNB_VISITED_CONFIG="${REPO_ROOT}/configs/ueransim/gnb-visited.yaml"

GNB_HOME2_CONFIG="${REPO_ROOT}/configs/ueransim/open5gs-gnb-home2.yaml"

GNB_BIN="${REPO_ROOT}/UERANSIM/build/nr-gnb"
[ ! -x "${GNB_BIN}" ] && [ -x "/home/abdulrhamn/core/UERANSIM/build/nr-gnb" ] && GNB_BIN="/home/abdulrhamn/core/UERANSIM/build/nr-gnb"

LOG_HOME="/tmp/ueransim-gnb-home.log"
LOG_VISITED="/tmp/ueransim-gnb-visited.log"
LOG_HOME2="/tmp/ueransim-gnb-home2.log"

if [ ! -x "${GNB_BIN}" ]; then
    echo "[-] Error: nr-gnb binary not found at ${GNB_BIN}" >&2
    exit 1
fi

ensure_bridge_ips() {
    local bridge_dev
    bridge_dev=$(ip -4 addr show 2>/dev/null | grep -B 2 "172.19.0.1" | awk '/^[0-9]+:/ {print $2}' | tr -d ':' | head -n 1 || echo "")
    if [ -n "${bridge_dev}" ]; then
        if ! ip -4 addr show dev "${bridge_dev}" | grep -q "172.19.0.3"; then
            ip addr add 172.19.0.3/16 dev "${bridge_dev}" 2>/dev/null || true
        fi
        if ! ip -4 addr show dev "${bridge_dev}" | grep -q "172.19.0.4"; then
          ip addr add 172.19.0.4/16 dev "${bridge_dev}" 2>/dev/null || true
        fi
    fi
}

stop_gnb() {
    local target="${1:-all}"
    case "${target}" in
        home)
            echo "[+] Stopping gNodeB-Home..."
            pkill -9 -f 'nr-gnb.*(open5gs-gnb-home|gnb-home)\.yaml' 2>/dev/null || true
            ;;
        visited)
            echo "[+] Stopping gNodeB-Visited..."
            pkill -9 -f 'nr-gnb.*(open5gs-gnb-visited|gnb-visited)\.yaml' 2>/dev/null || true
            ;;
        home2)
            echo "[+] Stopping gNodeB-Home2..."
            pkill -9 -f 'nr-gnb.*open5gs-gnb-home2\.yaml' 2>/dev/null || true
            ;;
        all|"")
            echo "[+] Stopping all nr-gnb instances..."
            pkill -9 -f 'nr-gnb' 2>/dev/null || true
            ;;
    esac
    sleep 1
}

start_single_gnb() {
    local name="$1"
    local config="$2"
    local log_file="$3"

    echo "─────────────────────────────────────────────────────────────────"
    echo "[+] Starting ${name} with config ${config}..."
    : > "${log_file}"
    setsid "${GNB_BIN}" -c "${config}" >> "${log_file}" 2>&1 < /dev/null &
    local pid=$!

    sleep 2
    if ps -p "${pid}" > /dev/null 2>&1; then
        echo "[✓] ${name} started successfully (PID: ${pid})"
        echo "[+] Log output: ${log_file}"
        head -n 20 "${log_file}" || true
    else
        echo "[-] Failed to start ${name}. Log output:"
        cat "${log_file}"
        return 1
    fi
}

ACTION="${1:-all}"

case "${ACTION}" in
    stop)
        stop_gnb "${2:-all}"
        ;;
    home)
        stop_gnb home
        ensure_bridge_ips
        start_single_gnb "gNodeB-Home (PLMN 602/03, 602/04 -> HAMF :38412)" "${GNB_HOME_CONFIG}" "${LOG_HOME}"
        ln -sf "${LOG_HOME}" /tmp/ueransim-gnb.log 2>/dev/null || true
        ;;
    home2)
        stop_gnb home2
        ensure_bridge_ips
        start_single_gnb "gNodeB-Home2 (PLMN 602/04 -> HAMF :38412)" "${GNB_HOME2_CONFIG}" "${LOG_HOME2}"
        ;;
    visited)
        stop_gnb visited
        ensure_bridge_ips
        start_single_gnb "gNodeB-Visited (PLMN 218/90 -> VAMF :38413)" "${GNB_VISITED_CONFIG}" "${LOG_VISITED}"
        ;;
    all|"")
        stop_gnb all
        ensure_bridge_ips
        start_single_gnb "gNodeB-Home (PLMN 602/03, 602/04 -> HAMF :38412)" "${GNB_HOME_CONFIG}" "${LOG_HOME}"
        ln -sf "${LOG_HOME}" /tmp/ueransim-gnb.log 2>/dev/null || true
        start_single_gnb "gNodeB-Home2 (PLMN 602/04 -> HAMF :38412)" "${GNB_HOME2_CONFIG}" "${LOG_HOME2}"
        start_single_gnb "gNodeB-Visited (PLMN 218/90 -> VAMF :38413)" "${GNB_VISITED_CONFIG}" "${LOG_VISITED}"
        echo "─────────────────────────────────────────────────────────────────"
        echo "[✓] gNodeB-Home, gNodeB-Home2 and gNodeB-Visited are active and isolated."
        ;;
    *)
        echo "[-] Usage: bash scripts/run-gnb.sh [all|home|home2|visited|stop [home|home2|visited]]" >&2
        exit 1
        ;;
esac
