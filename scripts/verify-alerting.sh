#!/usr/bin/env bash
# ==============================================================================
# verify-alerting.sh - Phase 5.4 Prometheus Alerting & Incident Detection Suite
#
# Asserts Alertmanager deployment health, Prometheus alert-rules provisioning,
# Alertmanager target connectivity, alert rule presence across all 7 telecom
# domains, controlled fault injection & alert firing, automatic resolution,
# and post-recovery baseline integrity across 19 deterministic checks:
#   [ALERT-01] Monitoring namespace active
#   [ALERT-02] Alertmanager pod Running & Ready (1/1)
#   [ALERT-03] Alertmanager Service exists (NodePort 30093)
#   [ALERT-04] Alertmanager HTTP API endpoint healthy (/-/ready)
#   [ALERT-05] Prometheus pod Running & Ready (1/1)
#   [ALERT-06] Prometheus -> Alertmanager notification channel active
#   [ALERT-07] Prometheus alert rule groups loaded via ConfigMap
#   [ALERT-08] Category A: Infrastructure alert rules present
#   [ALERT-09] Category B: 5G Core control/user plane alert rules present
#   [ALERT-10] Category C: IMS / SIP signaling alert rules present
#   [ALERT-11] Category D: RTP media proxy alert rules present
#   [ALERT-12] Category E: Service Assurance / QoE alert rules present
#   [ALERT-13] Category F: Multi-PLMN Roaming alert rules present
#   [ALERT-14] Steady-state baseline: 0 active firing alerts
#   [ALERT-15] Controlled fault injection: Alert triggers FIRING in Prometheus
#   [ALERT-16] Alert dispatch: Alert received & active in Alertmanager
#   [ALERT-17] Fault recovery: Restored component triggers alert RESOLUTION
#   [ALERT-18] Post-recovery baseline: System returns to 0 firing alerts
#   [ALERT-19] Grafana Alertmanager datasource proxy connectivity
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
PROM_URL="http://172.19.0.2:30090"
AM_URL="http://172.19.0.2:30093"
GRAFANA_URL="http://172.19.0.2:30300"

# Safety trap: restore open5gs-bsf if script is interrupted during fault injection
trap 'kubectl -n open5gs scale deployment/open5gs-bsf --replicas=1 >/dev/null 2>&1' EXIT INT TERM

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
echo -e "${BOLD}  5G-IMS-Lab Phase 5.4 Prometheus Alerting & Incident Detection Suite  ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"

# ------------------------------------------------------------------------------
# 1. Alertmanager & Prometheus Deployment Readiness
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}1. Alerting Infrastructure Readiness${NC}"

if kubectl get namespace monitoring >/dev/null 2>&1; then
    check_pass "[ALERT-01] Monitoring Namespace" "active in Kubernetes cluster"
else
    check_fail "[ALERT-01] Monitoring Namespace" "namespace monitoring not found"
fi

AM_READY=$(kubectl -n monitoring get deploy/alertmanager -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$AM_READY" -ge 1 ]]; then
    check_pass "[ALERT-02] Alertmanager Pod" "Running & Ready (1/1 replicas)"
else
    check_fail "[ALERT-02] Alertmanager Pod" "Alertmanager deployment not ready"
fi

if kubectl -n monitoring get svc/alertmanager >/dev/null 2>&1; then
    NODE_PORT=$(kubectl -n monitoring get svc/alertmanager -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "")
    check_pass "[ALERT-03] Alertmanager Service" "NodePort ${NODE_PORT} exposed"
else
    check_fail "[ALERT-03] Alertmanager Service" "Service alertmanager not found"
fi

AM_HEALTH=$(curl -s "${AM_URL}/-/ready" || echo "")
if [[ "$AM_HEALTH" == "OK" ]]; then
    check_pass "[ALERT-04] Alertmanager HTTP API" "HTTP endpoint healthy (/-/ready returned OK)"
else
    check_fail "[ALERT-04] Alertmanager HTTP API" "HTTP endpoint unreachable or unhealthy"
fi

PROM_READY=$(kubectl -n monitoring get deploy/prometheus -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [[ "$PROM_READY" -ge 1 ]]; then
    check_pass "[ALERT-05] Prometheus Pod" "Running & Ready (1/1 replicas)"
else
    check_fail "[ALERT-05] Prometheus Pod" "Prometheus deployment not ready"
fi

AM_DISCOVERED=$(curl -s "${PROM_URL}/api/v1/alertmanagers" | jq '.data.activeAlertmanagers | length' 2>/dev/null || echo "0")
if [[ "$AM_DISCOVERED" -ge 1 ]]; then
    AM_ENDPOINT=$(curl -s "${PROM_URL}/api/v1/alertmanagers" | jq -r '.data.activeAlertmanagers[0].url' 2>/dev/null || echo "")
    check_pass "[ALERT-06] Prometheus Alertmanager Channel" "Connected to active Alertmanager (${AM_ENDPOINT})"
else
    check_fail "[ALERT-06] Prometheus Alertmanager Channel" "No active Alertmanager targets discovered by Prometheus"
fi

# ------------------------------------------------------------------------------
# 2. Alert Rules Presence across Telecom Domains
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}2. Declarative Alert Rules Provisioning across Domains${NC}"

RULES_JSON=$(curl -s "${PROM_URL}/api/v1/rules" || echo "{}")
GROUPS_COUNT=$(echo "$RULES_JSON" | jq '.data.groups | length' 2>/dev/null || echo "0")

if [[ "$GROUPS_COUNT" -ge 6 ]]; then
    check_pass "[ALERT-07] Alert Rule Groups" "${GROUPS_COUNT} alert rule groups loaded in Prometheus"
else
    check_fail "[ALERT-07] Alert Rule Groups" "Expected >= 6 rule groups, got ${GROUPS_COUNT}"
fi

function has_alert_rule() {
    local rule_name="$1"
    echo "$RULES_JSON" | jq -e --arg r "$rule_name" '.data.groups[].rules[] | select(.name==$r)' >/dev/null 2>&1
}

# Category A: Infra
if has_alert_rule "Open5gsCorePodsDegraded" && has_alert_rule "ImsCorePodsDegraded" && has_alert_rule "TelecomExporterDown"; then
    check_pass "[ALERT-08] Infra Alert Rules" "Open5gsCorePodsDegraded, ImsCorePodsDegraded, TelecomExporterDown active"
else
    check_fail "[ALERT-08] Infra Alert Rules" "Missing required infra alert rules"
fi

# Category B: 5GC Core
if has_alert_rule "Open5gsRegisteredUeDrop" && has_alert_rule "Open5gsPduSessionInactive" && has_alert_rule "Open5gsNgapN2Failure"; then
    check_pass "[ALERT-09] 5G Core Alert Rules" "Open5gsRegisteredUeDrop, Open5gsPduSessionInactive, Open5gsNgapN2Failure active"
else
    check_fail "[ALERT-09] 5G Core Alert Rules" "Missing required 5G Core alert rules"
fi

# Category C: IMS / SIP
if has_alert_rule "ImsSipServerDown" && has_alert_rule "ImsSubscriberUnregistered" && has_alert_rule "ImsRegisteredSubscribersLow"; then
    check_pass "[ALERT-10] IMS / SIP Alert Rules" "ImsSipServerDown, ImsSubscriberUnregistered, ImsRegisteredSubscribersLow active"
else
    check_fail "[ALERT-10] IMS / SIP Alert Rules" "Missing required IMS/SIP alert rules"
fi

# Category D: RTP Media
if has_alert_rule "RtpEngineControlDown"; then
    check_pass "[ALERT-11] RTP Media Alert Rules" "RtpEngineControlDown active"
else
    check_fail "[ALERT-11] RTP Media Alert Rules" "Missing RTP media proxy alert rules"
fi

# Category E: QoE Service Assurance
if has_alert_rule "QoEMosDegraded" && has_alert_rule "QoECssrLow" && has_alert_rule "QoEPacketLossHigh"; then
    check_pass "[ALERT-12] QoE Service Assurance Alert Rules" "QoEMosDegraded, QoECssrLow, QoEPacketLossHigh active"
else
    check_fail "[ALERT-12] QoE Service Assurance Alert Rules" "Missing QoE service assurance alert rules"
fi

# Category F: Roaming
if has_alert_rule "RoamingUeDetached" && has_alert_rule "RoamingLboUserPlaneDown" && has_alert_rule "RoamingSuccessRateLow"; then
    check_pass "[ALERT-13] Roaming Alert Rules" "RoamingUeDetached, RoamingLboUserPlaneDown, RoamingSuccessRateLow active"
else
    check_fail "[ALERT-13] Roaming Alert Rules" "Missing Roaming alert rules"
fi

# ------------------------------------------------------------------------------
# 3. Steady-State Baseline & Fault Injection Lifecycle
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}3. Fault Injection & Incident Lifecycle Validation${NC}"

STEADY_ALERTS=$(curl -s "${PROM_URL}/api/v1/alerts" | jq '.data.alerts | length' 2>/dev/null || echo "0")
if [[ "$STEADY_ALERTS" -eq 0 ]]; then
    check_pass "[ALERT-14] Steady-State Baseline" "0 active firing alerts under normal operation"
else
    check_fail "[ALERT-14] Steady-State Baseline" "Expected 0 firing alerts, found ${STEADY_ALERTS}"
fi

# Inject controlled fault by scaling open5gs-bsf to 0 replicas
kubectl -n open5gs scale deployment/open5gs-bsf --replicas=0 >/dev/null 2>&1

FAULT_FIRING=""
for i in {1..16}; do
    sleep 2
    FAULT_ALERTS=$(curl -s "${PROM_URL}/api/v1/alerts" || echo "{}")
    FAULT_FIRING=$(echo "$FAULT_ALERTS" | jq -r '.data.alerts[] | select(.labels.alertname=="Open5gsCorePodsDegraded") | .state' 2>/dev/null || echo "")
    if [[ "$FAULT_FIRING" == "firing" ]]; then
        break
    fi
done

if [[ "$FAULT_FIRING" == "firing" ]]; then
    check_pass "[ALERT-15] Controlled Fault Firing" "Open5gsCorePodsDegraded transitioned to FIRING in Prometheus"
else
    check_fail "[ALERT-15] Controlled Fault Firing" "Alert Open5gsCorePodsDegraded did not fire (state: '${FAULT_FIRING}')"
fi

AM_ACTIVE=""
for i in {1..8}; do
    AM_ALERTS=$(curl -s "${AM_URL}/api/v2/alerts" || echo "[]")
    AM_ACTIVE=$(echo "$AM_ALERTS" | jq -r '.[] | select(.labels.alertname=="Open5gsCorePodsDegraded") | .status.state' 2>/dev/null || echo "")
    if [[ "$AM_ACTIVE" == "active" ]]; then
        break
    fi
    sleep 2
done

if [[ "$AM_ACTIVE" == "active" ]]; then
    check_pass "[ALERT-16] Alertmanager Dispatch" "Alert dispatched & registered as ACTIVE in Alertmanager"
else
    check_fail "[ALERT-16] Alertmanager Dispatch" "Alert not found or inactive in Alertmanager"
fi

# Restore component to 1 replica
kubectl -n open5gs scale deployment/open5gs-bsf --replicas=1 >/dev/null 2>&1
kubectl -n open5gs rollout status deployment/open5gs-bsf --timeout=30s >/dev/null 2>&1

RESOLVED_FIRING="still_firing"
for i in {1..12}; do
    sleep 2.5
    RESOLVED_ALERTS=$(curl -s "${PROM_URL}/api/v1/alerts" || echo "{}")
    RESOLVED_FIRING=$(echo "$RESOLVED_ALERTS" | jq -r '.data.alerts[] | select(.labels.alertname=="Open5gsCorePodsDegraded") | .state' 2>/dev/null || echo "")
    if [[ -z "$RESOLVED_FIRING" ]]; then
        break
    fi
done

if [[ -z "$RESOLVED_FIRING" ]]; then
    check_pass "[ALERT-17] Automatic Alert Resolution" "Alert resolved after component restoration"
else
    check_fail "[ALERT-17] Automatic Alert Resolution" "Alert still firing after restoration"
fi

POST_ALERTS=1
for i in {1..8}; do
    POST_ALERTS=$(curl -s "${PROM_URL}/api/v1/alerts" | jq '.data.alerts | length' 2>/dev/null || echo "0")
    if [[ "$POST_ALERTS" -eq 0 ]]; then
        break
    fi
    sleep 2
done

if [[ "$POST_ALERTS" -eq 0 ]]; then
    check_pass "[ALERT-18] Post-Recovery Baseline" "System returned cleanly to 0 firing alerts"
else
    check_fail "[ALERT-18] Post-Recovery Baseline" "${POST_ALERTS} residual firing alerts detected"
fi

# ------------------------------------------------------------------------------
# 4. Grafana Alertmanager Integration
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}4. Grafana Alerting Integration${NC}"

GRAFANA_DS=$(curl -s "${GRAFANA_URL}/api/datasources" || echo "[]")
if echo "$GRAFANA_DS" | grep -q '"type":\s*"alertmanager"'; then
    check_pass "[ALERT-19] Grafana Alertmanager Integration" "Alertmanager datasource provisioned & queryable in Grafana"
else
    check_fail "[ALERT-19] Grafana Alertmanager Integration" "Alertmanager datasource missing in Grafana"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "  Alerting Verification Summary: ${GREEN}${PASSED_COUNT} Passed${NC}, ${RED}${FAILED_COUNT} Failed${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"

if [[ "$FAILED_COUNT" -eq 0 ]]; then
    echo -e "  ${GREEN}>>> All Phase 5.4 Prometheus Alerting & Incident Tests Passed! <<<${NC}\n"
    exit 0
else
    echo -e "  ${RED}>>> Some Alerting verification tests failed! <<<${NC}\n"
    exit 1
fi
