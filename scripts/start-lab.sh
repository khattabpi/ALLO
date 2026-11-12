#!/usr/bin/env bash
#
# start-lab.sh — bring up the Open5GS-on-kind 5G SA lab and Kamailio IMS for local UERANSIM.
#
# Steps:
#   1. Stop any native Open5GS systemd services (avoid port/SCTP conflicts).
#   2. Configure Linux host kernel settings (ip_forward, rp_filter, iptables).
#   3. Ensure the kind cluster exists, is running, and pinned to 172.19.0.2.
#   4. Pre-load container images into kind cluster.
#   5. Apply Kubernetes manifests (open5gs 5GC and ims service layer).
#   6. Wait for deployments/statefulsets in open5gs and ims namespaces to become Ready.
#   7. Provision the test subscribers into MongoDB.
#   8. Print status and next steps.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Config -----------------------------------------------------------------
CLUSTER_NAME="open5gs-cluster"
NODE_CONTAINER="${CLUSTER_NAME}-control-plane"
KIND_NETWORK="kind"
NODE_IP="172.19.0.2"
NAMESPACE="open5gs"
IMS_NAMESPACE="ims"
POD_WAIT_TIMEOUT="180s"

log()  { printf '\033[1;34m[start-lab]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start-lab]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[start-lab]\033[0m %s\n' "$*" >&2; }
pass() { printf '\033[1;32m[start-lab]\033[0m %s\n' "$*"; }

SUDO=""
[[ "${EUID}" -ne 0 ]] && SUDO="sudo"

# --- 1. Stop native Open5GS systemd services -------------------------------
stop_native_open5gs() {
  log "Checking for conflicting native Open5GS systemd services..."
  local units
  units=$(systemctl list-units 'open5gs-*' --all --no-legend 2>/dev/null | awk '{print $1}') || true
  if [[ -n "${units}" ]]; then
    log "Stopping native open5gs-* units: ${units}"
    ${SUDO} systemctl stop 'open5gs-*' 2>/dev/null || true
  else
    log "No active native open5gs-* units found."
  fi
}

# --- 2. Host networking prerequisites --------------------------------------
ensure_bridge_ips() {
  local bridge_dev
  bridge_dev=$(ip -4 addr show 2>/dev/null | grep -B 2 "172.19.0.1" | awk '/^[0-9]+:/ {print $2}' | tr -d ':' | head -n 1 || echo "")
  if [ -n "${bridge_dev}" ]; then
    if ! ip -4 addr show dev "${bridge_dev}" | grep -q "172.19.0.3"; then
      ${SUDO} ip addr add 172.19.0.3/16 dev "${bridge_dev}" 2>/dev/null || true
    fi
    if ! ip -4 addr show dev "${bridge_dev}" | grep -q "172.19.0.4"; then
      ${SUDO} ip addr add 172.19.0.4/16 dev "${bridge_dev}" 2>/dev/null || true
    fi
  fi
}

setup_host_networking() {
  log "Configuring host kernel networking parameters..."
  ${SUDO} sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
  ${SUDO} sysctl -w net.ipv4.conf.all.rp_filter=0 >/dev/null 2>&1 || true
  ${SUDO} sysctl -w net.ipv4.conf.default.rp_filter=0 >/dev/null 2>&1 || true
  ensure_bridge_ips
}

# --- 3. Ensure kind node is running and pinned to NODE_IP -------------------
ensure_node_ip() {
  local current_ip
  current_ip=$(docker inspect -f \
    "{{ (index .NetworkSettings.Networks \"${KIND_NETWORK}\").IPAddress }}" \
    "${NODE_CONTAINER}" 2>/dev/null || echo "")

  if [[ "${current_ip}" == "${NODE_IP}" ]]; then
    log "Node ${NODE_CONTAINER} already on ${KIND_NETWORK} at ${NODE_IP}."
    return 0
  fi

  warn "Node IP is '${current_ip:-none}', expected ${NODE_IP}. Re-pinning..."
  docker network disconnect "${KIND_NETWORK}" "${NODE_CONTAINER}" 2>/dev/null || true
  docker network connect --ip "${NODE_IP}" "${KIND_NETWORK}" "${NODE_CONTAINER}"
  log "Reconnected ${NODE_CONTAINER} to ${KIND_NETWORK} with --ip ${NODE_IP}."
}

ensure_cluster() {
  if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    log "Creating kind cluster '${CLUSTER_NAME}'..."
    kind create cluster --config "${REPO_ROOT}/k8s/kind-config.yaml"
  fi

  local state
  state=$(docker inspect -f '{{.State.Running}}' "${NODE_CONTAINER}" 2>/dev/null || echo "false")

  if [[ "${state}" != "true" ]]; then
    log "Starting stopped container ${NODE_CONTAINER}..."
    docker start "${NODE_CONTAINER}" >/dev/null
  fi

  ensure_node_ip

  log "Waiting for Kubernetes API to respond..."
  local i
  for i in $(seq 1 30); do
    if kubectl get --raw='/readyz' >/dev/null 2>&1; then
      log "Kubernetes API is ready."
      break
    fi
    sleep 2
  done
}

# --- 4. Preload images into kind -------------------------------------------
preload_images() {
  log "Ensuring container images are available in kind cluster..."
  docker exec "${NODE_CONTAINER}" crictl pull mongo:8.0 >/dev/null 2>&1 || true
  if docker image inspect gradiant/open5gs:2.8.0 >/dev/null 2>&1; then
    kind load docker-image gradiant/open5gs:2.8.0 --name "${CLUSTER_NAME}" 2>/dev/null || true
  fi
  if docker image inspect ims-node:latest >/dev/null 2>&1; then
    kind load docker-image ims-node:latest --name "${CLUSTER_NAME}" 2>/dev/null || true
  fi
}

# --- 5. Apply manifests ----------------------------------------------------
apply_manifests() {
  log "Applying Open5GS 5GC manifests in ${REPO_ROOT}/k8s/..."
  kubectl apply -f "${REPO_ROOT}/k8s/namespace.yaml"
  kubectl apply -f "${REPO_ROOT}/k8s/mongodb.yaml"
  kubectl apply -f "${REPO_ROOT}/k8s/configmap.yaml"
  kubectl apply -f "${REPO_ROOT}/k8s/control-plane.yaml"
  kubectl apply -f "${REPO_ROOT}/k8s/upf.yaml"

  if [ -d "${REPO_ROOT}/k8s/ims" ]; then
    log "Applying Kamailio IMS manifests in ${REPO_ROOT}/k8s/ims/..."
    kubectl apply -f "${REPO_ROOT}/k8s/ims/namespace.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/ims/configmap.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/ims/rtpengine.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/ims/scscf.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/ims/icscf.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/ims/pcscf.yaml"
  fi

  if [ -d "${REPO_ROOT}/k8s/monitoring" ]; then
    log "Applying Prometheus, Alertmanager & Grafana manifests in ${REPO_ROOT}/k8s/monitoring/..."
    kubectl apply -f "${REPO_ROOT}/k8s/monitoring/namespace.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/monitoring/rbac.yaml"
    kubectl apply -f "${REPO_ROOT}/k8s/monitoring/telecom-exporter.yaml"
    if [ -f "${REPO_ROOT}/k8s/monitoring/prometheus-alert-rules.yaml" ]; then
      kubectl apply -f "${REPO_ROOT}/k8s/monitoring/prometheus-alert-rules.yaml"
    fi
    if [ -f "${REPO_ROOT}/k8s/monitoring/alertmanager.yaml" ]; then
      kubectl apply -f "${REPO_ROOT}/k8s/monitoring/alertmanager.yaml"
    fi
    kubectl apply -f "${REPO_ROOT}/k8s/monitoring/prometheus.yaml"
    if [ -f "${REPO_ROOT}/k8s/monitoring/grafana-dashboard-configmap.yaml" ]; then
      kubectl apply -f "${REPO_ROOT}/k8s/monitoring/grafana-dashboard-configmap.yaml"
    fi
    if [ -f "${REPO_ROOT}/k8s/monitoring/grafana.yaml" ]; then
      kubectl apply -f "${REPO_ROOT}/k8s/monitoring/grafana.yaml"
    fi
  fi
}

# --- 6. Wait for pods -------------------------------------------------------
wait_for_pods() {
  log "Waiting for deployments and statefulsets in namespace '${NAMESPACE}' to become Ready..."
  kubectl -n "${NAMESPACE}" rollout status statefulset/mongodb --timeout="${POD_WAIT_TIMEOUT}"
  local dep
  for dep in open5gs-nrf open5gs-udr open5gs-udm open5gs-ausf open5gs-amf open5gs-smf open5gs-pcf open5gs-bsf open5gs-upf; do
    kubectl -n "${NAMESPACE}" rollout status "deployment/${dep}" --timeout="${POD_WAIT_TIMEOUT}"
  done
  pass "All Open5GS control-plane and user-plane deployments are Ready."

  if kubectl get ns "${IMS_NAMESPACE}" >/dev/null 2>&1; then
    log "Waiting for IMS deployments in namespace '${IMS_NAMESPACE}' to become Ready..."
    for dep in kamailio-scscf kamailio-icscf kamailio-pcscf rtpengine; do
      kubectl -n "${IMS_NAMESPACE}" rollout status "deployment/${dep}" --timeout="${POD_WAIT_TIMEOUT}"
    done
    pass "All Kamailio IMS deployments are Ready."
  fi

  if kubectl get ns monitoring >/dev/null 2>&1; then
    log "Waiting for Observability deployments (Prometheus, Alertmanager, Grafana) to become Ready..."
    for dep in telecom-exporter alertmanager prometheus grafana; do
      kubectl -n monitoring rollout status "deployment/${dep}" --timeout="${POD_WAIT_TIMEOUT}"
    done
    pass "All Prometheus, Alertmanager & Grafana Observability deployments are Ready."
  fi
}

# --- 7. Provision subscriber ------------------------------------------------
provision_subscriber() {
  log "Provisioning test subscribers (UE1 & UE2) in MongoDB..."
  bash "${REPO_ROOT}/scripts/add-subscriber.sh" all
}

# --- 8. Status --------------------------------------------------------------
print_status() {
  echo
  pass "═══════════════════════════════════════════════════════════════"
  pass "  5G SA Core & IMS Lab is Online and Operational!"
  pass "═══════════════════════════════════════════════════════════════"
  echo
  log "Open5GS 5G Core Pods (namespace: ${NAMESPACE}):"
  kubectl get pods -n "${NAMESPACE}" -o wide
  echo
  log "Kamailio IMS Pods (namespace: ${IMS_NAMESPACE}):"
  kubectl get pods -n "${IMS_NAMESPACE}" -o wide
  echo
  log "Observability Pods (namespace: monitoring):"
  kubectl get pods -n monitoring -o wide
  echo
  log "Node IP (AMF/UPF endpoint): ${NODE_IP}"
  log "AMF NGAP (SCTP N2):          ${NODE_IP}:38412"
  log "UPF GTP-U (UDP N3):          ${NODE_IP}:2152"
  log "UPF PFCP  (UDP N4):          ${NODE_IP}:8805"
  log "P-CSCF SIP (UDP/TCP):        10.46.0.1:5060"
  log "Prometheus Server:           http://${NODE_IP}:30090"
  log "Alertmanager Dashboard:      http://${NODE_IP}:30093"
  log "Grafana Operations Dashboard:http://${NODE_IP}:30300"
  echo
  log "To start RAN simulation (Isolated Home & Visited gNodeBs):"
  echo "    sudo bash scripts/run-gnb.sh all"
  echo "    sudo bash scripts/run-ue.sh all"
  echo
  log "To test end-to-end IMS SIP calls & RTP voice streams:"
  echo "    sudo bash scripts/test-ims-call.sh all"
  echo
  log "To verify full end-to-end lab health:"
  echo "    sudo bash scripts/verify-lab.sh"
  echo
}

main() {
  stop_native_open5gs
  setup_host_networking
  ensure_cluster
  preload_images
  apply_manifests
  wait_for_pods
  provision_subscriber
  print_status
}

main "$@"
