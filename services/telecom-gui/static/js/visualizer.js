/**
 * Open Telecom Lab — Minimalist Telecom Pipeline Visualizer & Topology Engine
 * Clean, professional, and emoji-free data flow mapping:
 * 5G UE -> 5GC (Open5GS) -> IMS (Kamailio) -> Media (RTPEngine) -> Rating (Erlang) -> Ledger -> Reconciliation
 */

const visualizer = {
  // Nodes in the main pipeline
  pipelineNodes: [
    {
      id: "ue",
      code: "UE-RAN",
      title: "5G UE Simulation",
      subtitle: "UERANSIM (UE1/2/3)",
      tag: "Dual PDU / NetNS",
      category: "network",
      desc: "3GPP TS 38.413 / TS 24.501. Isolated network namespaces with Internet (10.45.0.0/16) and IMS (10.46.0.0/16) bearer tunnels."
    },
    {
      id: "5gc",
      code: "5GC-SA",
      title: "5G Standalone Core",
      subtitle: "Open5GS 3GPP Rel-16",
      tag: "12 NFs • N2/N3/N4",
      category: "network",
      desc: "Isolated Home AMF (:38412) & Visited AMF (:38413), SMF, UPF (GTP-U/PFCP), UDM, UDR, AUSF, PCF, BSF, NRF on Kubernetes."
    },
    {
      id: "ims",
      code: "IMS-SIP",
      title: "Kamailio IMS Core",
      subtitle: "P-CSCF / I-CSCF / S-CSCF",
      tag: "SIP Digest MD5 :5060",
      category: "voice",
      desc: "RFC 3261 / 3327 SIP proxy & registrar with SQLite subscriber repository and Path-based routing."
    },
    {
      id: "rtp",
      code: "RTP-PROXY",
      title: "RTPEngine Media",
      subtitle: "Sipwise Media Proxy",
      tag: "G.711 PCMU :22222",
      category: "voice",
      desc: "Kernel-assisted RTP proxy with dynamic SDP offer/answer rewriting and zero-loss media bridging."
    },
    {
      id: "charging",
      code: "CHF-RATING",
      title: "Erlang/OTP Rating",
      subtitle: "Cowboy REST API :8085",
      tag: "Deterministic Tariffs",
      category: "voice",
      desc: "Real-time telecom rating engine calculating domestic vs roaming tariffs with setup fees and second/MB granularity."
    },
    {
      id: "ledger",
      code: "CGF-LEDGER",
      title: "Prepaid Ledger",
      subtitle: "Double-Entry Balance Store",
      tag: "ACID Transactions",
      category: "network",
      desc: "Double-entry transactional ledger tracking available, reserved, and consumed balances with immutable audit trail."
    },
    {
      id: "reconcile",
      code: "AUDIT-REC",
      title: "Reconciliation",
      subtitle: "Financial Audit Engine",
      tag: "Invariant Check: PASS",
      category: "network",
      desc: "Automated verification ensuring sum of account balances strictly equals total credits minus consumed revenue."
    }
  ],

  connectors: [
    { label: "N1/N2/N3" },
    { label: "IMS Bearer" },
    { label: "NG Protocol" },
    { label: "CDR" },
    { label: "Balance" },
    { label: "Verification" }
  ],

  init() {
    this.renderPipeline();
    this.renderTopology();
  },

  renderPipeline() {
    const container = document.getElementById("telecom-pipeline");
    if (!container) return;

    let html = "";
    this.pipelineNodes.forEach((node, idx) => {
      const isVoice = node.category === "voice";
      const nodeClass = isVoice ? "node-voice" : "node-network";
      const dotClass = isVoice ? "status-dot-cyan" : "status-dot-green";

      html += `
        <div class="pipeline-node ${nodeClass} ${idx === 0 ? 'node-active' : ''}" id="pnode-${node.id}" onclick="visualizer.showNodeDetail('${node.id}')">
          <div class="node-code"><span class="${dotClass}" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span>${node.code}</div>
          <div class="node-title">${node.title}</div>
          <div class="node-subtitle">${node.subtitle}</div>
          <div class="node-tag">${node.tag}</div>
        </div>
      `;

      if (idx < this.connectors.length) {
        html += `
          <div class="pipeline-connector">
            <span class="connector-label">${this.connectors[idx].label}</span>
            <div class="connector-line"></div>
          </div>
        `;
      }
    });

    container.innerHTML = html;
  },

  showNodeDetail(nodeId) {
    const node = this.pipelineNodes.find(n => n.id === nodeId);
    if (!node) return;

    document.querySelectorAll(".pipeline-node").forEach(el => el.classList.remove("node-active"));
    const activeEl = document.getElementById(`pnode-${nodeId}`);
    if (activeEl) activeEl.classList.add("node-active");

    app.showToast(`<strong>${node.title}</strong>: ${node.desc}`, "info");
  },

  renderTopology() {
    const container = document.getElementById("topology-map-container");
    if (!container) return;

    container.innerHTML = `
      <!-- Home PLMN (Egypt 602/03 & 602/04) -->
      <div class="topo-domain-box" style="border-top: 3px solid var(--blue-600);">
        <div class="topo-domain-title">
          <span>Home Network (HPLMN 602/03 &amp; 602/04)</span>
        </div>
        <div class="topo-items-list">
          <div class="topo-item">
            <span>gNodeB-Home</span>
            <code>127.0.0.1:38412</code>
          </div>
          <div class="topo-item">
            <span>Home AMF</span>
            <code>172.19.0.2:38412</code>
          </div>
          <div class="topo-item">
            <span>Home SMF</span>
            <code>open5gs-smf</code>
          </div>
          <div class="topo-item">
            <span>Connected UEs</span>
            <span class="badge badge-neutral">UE1 (602/03), UE2 (602/04)</span>
          </div>
        </div>
      </div>

      <!-- Visited PLMN (Bosnia 218/90) -->
      <div class="topo-domain-box" style="border-top: 3px solid var(--cyan-500);">
        <div class="topo-domain-title">
          <span>Visited Network (VPLMN 218/90 BH Telecom)</span>
        </div>
        <div class="topo-items-list">
          <div class="topo-item">
            <span>gNodeB-Visited</span>
            <code>127.0.0.2:38413</code>
          </div>
          <div class="topo-item">
            <span>Visited AMF (V-AMF)</span>
            <code>172.19.0.2:38413</code>
          </div>
          <div class="topo-item">
            <span>Visited SMF (V-SMF)</span>
            <code>open5gs-v-smf</code>
          </div>
          <div class="topo-item">
            <span>In-Roaming UE</span>
            <span class="badge badge-warning">UE3 (HPLMN 602/03 ➔ VPLMN 218/90)</span>
          </div>
        </div>
      </div>

      <!-- Shared User Plane & IMS -->
      <div class="topo-domain-box" style="border-top: 3px solid var(--navy-800);">
        <div class="topo-domain-title">
          <span>User Plane (UPF) &amp; IMS Service Core</span>
        </div>
        <div class="topo-items-list">
          <div class="topo-item">
            <span>UPF GTP-U / PFCP</span>
            <code>172.19.0.2:2152 / :8805</code>
          </div>
          <div class="topo-item">
            <span>Kamailio P-CSCF</span>
            <code>10.46.0.1:5060 (SIP Proxy)</code>
          </div>
          <div class="topo-item">
            <span>Kamailio S-CSCF</span>
            <code>10.46.0.1:5060 (Registrar)</code>
          </div>
          <div class="topo-item">
            <span>RTPEngine Media Proxy</span>
            <code>10.46.0.1:22222 (G.711u/a)</code>
          </div>
        </div>
      </div>

      <!-- Revenue & Observability -->
      <div class="topo-domain-box" style="border-top: 3px solid var(--teal-500);">
        <div class="topo-domain-title">
          <span>Revenue Engine & Observability</span>
        </div>
        <div class="topo-items-list">
          <div class="topo-item">
            <span>Erlang Charging Server</span>
            <code>http://127.0.0.1:8085</code>
          </div>
          <div class="topo-item">
            <span>Prometheus Telemetry</span>
            <code>http://172.19.0.2:30090</code>
          </div>
          <div class="topo-item">
            <span>Grafana Dashboard</span>
            <code>http://172.19.0.2:30300</code>
          </div>
          <div class="topo-item">
            <span>Alertmanager</span>
            <code>http://172.19.0.2:30093</code>
          </div>
        </div>
      </div>
    `;
  }
};
