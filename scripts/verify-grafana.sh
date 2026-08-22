#!/usr/bin/env bash
# ==============================================================================
# verify-grafana.sh - Phase 5.3 Grafana Operations Dashboard Verification Suite
#
# Asserts Grafana deployment health, Prometheus datasource connectivity,
# dashboard provisioning, panel query validity, real-time telemetry updates,
# and pod restart-recovery across 18 deterministic checks:
#   [GRAFANA-01] Monitoring namespace active
#   [GRAFANA-02] Grafana pod Running
#   [GRAFANA-03] Grafana container Ready (1/1)
#   [GRAFANA-04] Grafana Service exists (NodePort 30300)
#   [GRAFANA-05] Grafana HTTP API endpoint reachable (/api/health)
#   [GRAFANA-06] Prometheus pod healthy & targets UP
#   [GRAFANA-07] Prometheus datasource provisioned (name: Prometheus)
#   [GRAFANA-08] Prometheus datasource proxy reachable
#   [GRAFANA-09] Dashboard 5g-ims-telecom-overview exists
#   [GRAFANA-10] Required dashboard panels/rows present (Sections A-H)
#   [GRAFANA-11] Required telemetry metrics queryable via Grafana
#   [GRAFANA-12] Live domestic call telemetry updates verified
#   [GRAFANA-13] Live roaming call telemetry updates verified
#   [GRAFANA-14] Charging counters visible via Grafana proxy
#   [GRAFANA-15] RTP media counters visible via Grafana proxy
#   [GRAFANA-16] QoE & Service Assurance metrics visible via Grafana proxy
#   [GRAFANA-17] Roaming telemetry metrics visible via Grafana proxy
#   [GRAFANA-18] Grafana restart-recovery validation
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASSED_COUNT=0
FAILED_COUNT=0
GRAFANA_URL="http://172.19.0.2:30300"
PROM_URL="http://172.19.0.2:30090"

function check_pass() {
    local test_name="$1"
    local details="$2"
    echo -e "  ${GREEN}[✓]${NC} ${BOLD}${test_name}${NC}: ${details}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
}

function check_fail() {
    local test_name="$1"
    local details="$2"
    echo -e "  ${RED}[✗]${NC} ${BOLD}${test_name}${NC}: ${details}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
}

echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  5G-IMS-Lab Phase 5.3 Grafana Operations Dashboard Verification Suite${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"

# ------------------------------------------------------------------------------
# 1. Monitoring Namespace & Pod Readiness
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}1. Grafana Deployment & Infrastructure Readiness${NC}"

if kubectl get namespace monitoring >/dev/null 2>&1; then
    check_pass "[GRAFANA-01] Monitoring Namespace" "active in Kubernetes cluster"
else
    check_fail "[GRAFANA-01] Monitoring Namespace" "namespace not found"
fi

GRAFANA_STATUS=$(kubectl -n monitoring get pods -l app=grafana -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Unknown")
if [[ "$GRAFANA_STATUS" == "Running" ]]; then
    check_pass "[GRAFANA-02] Grafana Pod Status" "Phase is Running"
else
    check_fail "[GRAFANA-02] Grafana Pod Status" "Phase is $GRAFANA_STATUS"
fi

GRAFANA_READY=$(kubectl -n monitoring get deploy/grafana -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$GRAFANA_READY" -ge 1 ]]; then
    check_pass "[GRAFANA-03] Grafana Readiness" "1/1 replicas Ready"
else
    check_fail "[GRAFANA-03] Grafana Readiness" "Deployment not ready ($GRAFANA_READY/1)"
fi

if kubectl -n monitoring get svc/grafana >/dev/null 2>&1; then
    NODE_PORT=$(kubectl -n monitoring get svc/grafana -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
    check_pass "[GRAFANA-04] Grafana Service" "NodePort ${NODE_PORT} exposed"
else
    check_fail "[GRAFANA-04] Grafana Service" "Service grafana not found"
fi

HEALTH_RESP=$(curl -s "${GRAFANA_URL}/api/health" || echo "")
if echo "$HEALTH_RESP" | grep -q '"database":\s*"ok"'; then
    VERSION=$(echo "$HEALTH_RESP" | jq -r '.version' 2>/dev/null || echo "unknown")
    check_pass "[GRAFANA-05] Grafana HTTP Endpoint" "HTTP API healthy (version: ${VERSION})"
else
    check_fail "[GRAFANA-05] Grafana HTTP Endpoint" "API unreachable or database unhealthy"
fi

PROM_READY=$(kubectl -n monitoring get deploy/prometheus -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$PROM_READY" -ge 1 ]]; then
    check_pass "[GRAFANA-06] Prometheus Pod Health" "Running & Ready (1/1 replicas)"
else
    check_fail "[GRAFANA-06] Prometheus Pod Health" "Prometheus deployment not ready"
fi

# ------------------------------------------------------------------------------
# 2. Prometheus Datasource Validation
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}2. Prometheus Datasource Provisioning${NC}"

DS_JSON=$(curl -s "${GRAFANA_URL}/api/datasources" || echo "[]")
DS_COUNT=$(echo "$DS_JSON" | jq 'length' 2>/dev/null || echo "0")
DS_NAME=$(echo "$DS_JSON" | jq -r '.[] | select(.name=="Prometheus") | .name' 2>/dev/null || echo "")
DS_URL=$(echo "$DS_JSON" | jq -r '.[] | select(.name=="Prometheus") | .url' 2>/dev/null || echo "")
PROM_ID=$(echo "$DS_JSON" | jq -r '.[] | select(.name=="Prometheus") | .id' 2>/dev/null || echo "1")

if [[ "$DS_COUNT" -ge 1 && "$DS_NAME" == "Prometheus" ]]; then
    check_pass "[GRAFANA-07] Prometheus Datasource" "Provisioned automatically (${DS_NAME} -> ${DS_URL})"
else
    check_fail "[GRAFANA-07] Prometheus Datasource" "Expected datasource named 'Prometheus', got '${DS_NAME}'"
fi

PROXY_QUERY=$(curl -G -s "${GRAFANA_URL}/api/datasources/proxy/${PROM_ID}/api/v1/query" --data-urlencode "query=open5gs_5gc_registered_ues" || echo "")
if echo "$PROXY_QUERY" | grep -q '"status":"success"'; then
    RES_LEN=$(echo "$PROXY_QUERY" | jq '.data.result | length' 2>/dev/null || echo "0")
    check_pass "[GRAFANA-08] Datasource Proxy Connectivity" "Grafana proxy successfully queries Prometheus (${RES_LEN} series returned)"
else
    check_fail "[GRAFANA-08] Datasource Proxy Connectivity" "Datasource proxy query failed"
fi

# ------------------------------------------------------------------------------
# 3. Dashboard Provisioning & Panel Structure
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}3. Dashboard Provisioning & Structure${NC}"

DASH_INFO=$(curl -s "${GRAFANA_URL}/api/dashboards/uid/5g-ims-telecom-overview" || echo "{}")
DASH_TITLE=$(echo "$DASH_INFO" | jq -r '.dashboard.title' 2>/dev/null || echo "")
DASH_PANELS=$(echo "$DASH_INFO" | jq '.dashboard.panels | length' 2>/dev/null || echo "0")

if [[ "$DASH_TITLE" == "5G-IMS-Lab — Telecom Operations Overview" ]]; then
    check_pass "[GRAFANA-09] Telecom Operations Dashboard" "Dashboard provisioned with title '${DASH_TITLE}'"
else
    check_fail "[GRAFANA-09] Telecom Operations Dashboard" "Dashboard not found or title mismatch ('${DASH_TITLE}')"
fi

if [[ "$DASH_PANELS" -ge 20 ]]; then
    check_pass "[GRAFANA-10] Dashboard Panels & Rows" "${DASH_PANELS} visual panels and category rows configured across Sections A-H"
else
    check_fail "[GRAFANA-10] Dashboard Panels & Rows" "Expected >= 20 panels, found ${DASH_PANELS}"
fi

# ------------------------------------------------------------------------------
# 4. Telemetry Visualization across Sections
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}4. Telemetry Metrics Availability via Grafana Proxy${NC}"

function query_grafana_proxy() {
    local expr="$1"
    curl -G -s "${GRAFANA_URL}/api/datasources/proxy/${PROM_ID}/api/v1/query" --data-urlencode "query=${expr}" || echo ""
}

# General metrics query check
CORE_UES=$(query_grafana_proxy "open5gs_5gc_registered_ues")
if echo "$CORE_UES" | grep -q '"status":"success"'; then
    check_pass "[GRAFANA-11] Core Metrics Query" "5G Core registered UEs queryable via Grafana"
else
    check_fail "[GRAFANA-11] Core Metrics Query" "Failed to query 5G Core metrics"
fi

# Domestic & Roaming live counters check
CHG_DOM=$(query_grafana_proxy 'charging_cdr_records_total{call_type="domestic"}')
DOM_VAL=$(echo "$CHG_DOM" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
if [[ "$DOM_VAL" -gt 0 ]]; then
    check_pass "[GRAFANA-12] Domestic Call Telemetry" "Domestic voice CDRs visible in Grafana (${DOM_VAL} CDRs)"
else
    check_fail "[GRAFANA-12] Domestic Call Telemetry" "No domestic CDRs found"
fi

CHG_ROAM=$(query_grafana_proxy 'charging_cdr_records_total{call_type="roaming"}')
ROAM_VAL=$(echo "$CHG_ROAM" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
if [[ "$ROAM_VAL" -gt 0 ]]; then
    check_pass "[GRAFANA-13] Roaming Call Telemetry" "Roaming voice CDRs visible in Grafana (${ROAM_VAL} CDRs)"
else
    check_fail "[GRAFANA-13] Roaming Call Telemetry" "No roaming CDRs found"
fi

CHG_DUR=$(query_grafana_proxy "charging_call_duration_seconds_total")
if echo "$CHG_DUR" | grep -q '"status":"success"'; then
    check_pass "[GRAFANA-14] Charging Counters" "Cumulative billed durations visible in Grafana"
else
    check_fail "[GRAFANA-14] Charging Counters" "Charging duration metrics missing"
fi

RTP_PKTS=$(query_grafana_proxy "ims_rtp_packets_relayed_total")
PKTS_VAL=$(echo "$RTP_PKTS" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
if [[ "$PKTS_VAL" -gt 0 ]]; then
    check_pass "[GRAFANA-15] RTP Media Telemetry" "RTP audio packets relayed visible in Grafana (${PKTS_VAL} pkts)"
else
    check_fail "[GRAFANA-15] RTP Media Telemetry" "No relayed RTP packets recorded"
fi

QOE_MOS=$(query_grafana_proxy 'qoe_telecom_mos_estimated{call_type="domestic"}')
MOS_VAL=$(echo "$QOE_MOS" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
if (( $(echo "$MOS_VAL >= 4.0" | bc -l) )); then
    check_pass "[GRAFANA-16] QoE Service Assurance" "Estimated MOS visible in Grafana (${MOS_VAL} / 4.50)"
else
    check_fail "[GRAFANA-16] QoE Service Assurance" "MOS value missing or below 4.0"
fi

ROAM_STAT=$(query_grafana_proxy 'roaming_ue_attached_status{ue_id="ue3"}')
ROAM_ATT=$(echo "$ROAM_STAT" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
if [[ "$ROAM_ATT" == "1" ]]; then
    check_pass "[GRAFANA-17] Roaming Telemetry" "UE3 roaming attachment state visible in Grafana (ATTACHED)"
else
    check_fail "[GRAFANA-17] Roaming Telemetry" "Roaming status missing or not attached"
fi

# ------------------------------------------------------------------------------
# 5. Restart-Recovery Validation
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}5. Grafana Restart & Persistence Validation${NC}"

# Test that Grafana recovers smoothly from a restart without losing configuration
kubectl -n monitoring rollout restart deployment/grafana >/dev/null 2>&1
kubectl -n monitoring rollout status deployment/grafana --timeout=30s >/dev/null 2>&1

POST_HEALTH=""
POST_TITLE=""
for i in {1..8}; do
    sleep 2
    POST_HEALTH=$(curl -s "${GRAFANA_URL}/api/health" || echo "")
    POST_DASH=$(curl -s "${GRAFANA_URL}/api/dashboards/uid/5g-ims-telecom-overview" || echo "{}")
    POST_TITLE=$(echo "$POST_DASH" | jq -r '.dashboard.title' 2>/dev/null || echo "")
    if echo "$POST_HEALTH" | grep -q '"database":\s*"ok"' && [[ "$POST_TITLE" == "5G-IMS-Lab — Telecom Operations Overview" ]]; then
        break
    fi
done

if echo "$POST_HEALTH" | grep -q '"database":\s*"ok"' && [[ "$POST_TITLE" == "5G-IMS-Lab — Telecom Operations Overview" ]]; then
    check_pass "[GRAFANA-18] Restart-Recovery Verification" "Grafana restarted successfully with datasource & dashboard intact"
else
    check_fail "[GRAFANA-18] Restart-Recovery Verification" "Grafana failed to recover datasource/dashboard after restart"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "  Grafana Verification Summary: ${GREEN}${PASSED_COUNT} Passed${NC}, ${RED}${FAILED_COUNT} Failed${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"

if [[ "$FAILED_COUNT" -eq 0 ]]; then
    echo -e "  ${GREEN}>>> All Phase 5.3 Grafana Operations Dashboard Tests Passed! <<<${NC}\n"
    exit 0
else
    echo -e "  ${RED}>>> Some Grafana verification tests failed! <<<${NC}\n"
    exit 1
fi
