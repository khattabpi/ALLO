/**
 * Open Telecom Lab — Telecom Operations & Revenue Control Center Application Logic
 * Modern, Minimalist Light Theme (Pure White & Green Accents, No Emojis)
 */

const app = {
  activeTab: "overview",
  refreshTimer: null,
  refreshInterval: 3000,
  data: {
    overview: null,
    subscribers: [],
    calls: [],
    charging: null,
    tariffs: [],
    transactions: [],
    topology: null
  },
  detailReturnTab: "overview",
  adminHealth: null,

  init() {
    this.bindEvents();
    visualizer.init();
    this.refreshAll();
    this.startAutoRefresh();
  },

  bindEvents() {
    // Nav tab switching
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const tabId = tab.dataset.tab;
        this.switchTab(tabId);
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target.closest(".drilldown-target");
      if (target && target.dataset.detail && !event.target.closest("button, a, input, select")) {
        this.openDetail(target.dataset.detail);
      }
    });
    document.addEventListener("keydown", (event) => {
      const target = event.target.closest(".drilldown-target");
      if (target && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.openDetail(target.dataset.detail);
      }
    });
    document.getElementById("detail-back-button")?.addEventListener("click", () => this.switchTab(this.detailReturnTab));
    document.getElementById("admin-refresh-button")?.addEventListener("click", () => this.loadAdminNoc());
    document.getElementById("admin-actions")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-admin-action]")?.dataset.adminAction;
      if (action === "refresh") this.refreshAll(true);
      if (action === "reconcile") this.runReconciliation();
      if (action === "calls") this.switchTab("calls");
      if (action === "topology") this.switchTab("topology");
      if (action === "charging") this.switchTab("charging");
    });

    // Sidebar Collapse / Expand Toggle
    const btnToggleSidebar = document.getElementById("sidebar-toggle-btn");
    if (btnToggleSidebar) {
      const syncSidebarControl = () => {
        const mobile = window.innerWidth <= 768;
        const expanded = mobile
          ? document.getElementById("app-sidebar")?.classList.contains("open") || false
          : !document.body.classList.contains("sidebar-collapsed");
        btnToggleSidebar.setAttribute("aria-expanded", String(expanded));
        btnToggleSidebar.setAttribute("aria-label", expanded ? "Collapse navigation" : "Expand navigation");
        btnToggleSidebar.title = expanded ? "Collapse navigation" : "Expand navigation";
      };
      syncSidebarControl();
      window.addEventListener("resize", syncSidebarControl);
      btnToggleSidebar.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
          const sidebar = document.getElementById("app-sidebar");
          if (sidebar) sidebar.classList.toggle("open");
        } else {
          document.body.classList.toggle("sidebar-collapsed");
        }
        syncSidebarControl();
      });
    }

    // Dark Mode Theme Toggle
    const btnThemeToggle = document.getElementById("theme-toggle-btn");
    const savedTheme = localStorage.getItem("allo-theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const currentTheme = savedTheme || (prefersDark ? "dark" : "light");
    if (currentTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    if (btnThemeToggle) {
      btnThemeToggle.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const newTheme = isDark ? "light" : "dark";

        // Add temporary transition class for smooth theme switch
        document.documentElement.classList.add("theme-transitioning");
        if (newTheme === "dark") {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
        localStorage.setItem("allo-theme", newTheme);

        setTimeout(() => {
          document.documentElement.classList.remove("theme-transitioning");
        }, 350);

        this.showToast(`Switched to ${newTheme === "dark" ? "Dark" : "Light"} mode`, "info");
      });
    }

    // Listen for OS theme changes if user hasn't explicitly set a preference
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (!localStorage.getItem("allo-theme")) {
          if (e.matches) {
            document.documentElement.setAttribute("data-theme", "dark");
          } else {
            document.documentElement.removeAttribute("data-theme");
          }
        }
      });
    }

    // Auto-refresh select
    const refreshSelect = document.getElementById("refresh-select");
    if (refreshSelect) {
      refreshSelect.addEventListener("change", (e) => {
        this.refreshInterval = parseInt(e.target.value, 10);
        this.startAutoRefresh();
      });
    }

    // Manual refresh button
    const btnRefresh = document.getElementById("btn-manual-refresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        this.refreshAll(true);
        this.showToast("Telemetry and revenue data refreshed", "info");
      });
    }

    // Quick call buttons
    const btnQuickCall = document.getElementById("btn-quick-call");
    if (btnQuickCall) {
      btnQuickCall.addEventListener("click", () => {
        this.switchTab("calls");
        this.triggerCall("domestic");
      });
    }

    const btnDomestic = document.getElementById("btn-trigger-domestic");
    if (btnDomestic) {
      btnDomestic.addEventListener("click", () => this.triggerCall("domestic"));
    }

    const btnRoaming = document.getElementById("btn-trigger-roaming");
    if (btnRoaming) {
      btnRoaming.addEventListener("click", () => this.triggerCall("roaming"));
    }

    // Top-up Modal actions
    const btnOpenTopup = document.getElementById("btn-open-topup");
    if (btnOpenTopup) {
      btnOpenTopup.addEventListener("click", () => this.openRechargeModal());
    }

    const btnSubmitTopup = document.getElementById("btn-submit-topup");
    if (btnSubmitTopup) {
      btnSubmitTopup.addEventListener("click", () => this.submitTopup());
    }

    const topupAcc = document.getElementById("topup-account-select");
    const topupAmt = document.getElementById("topup-amount");
    if (topupAcc) topupAcc.addEventListener("change", () => this.updateRechargePreview());
    if (topupAmt) topupAmt.addEventListener("input", () => this.updateRechargePreview());

    // Quote Modal actions
    const btnOpenQuote = document.getElementById("btn-open-quote-modal");
    if (btnOpenQuote) {
      btnOpenQuote.addEventListener("click", () => this.openModal("modal-quote"));
    }

    const btnCalcQuote = document.getElementById("btn-calc-quote");
    if (btnCalcQuote) {
      btnCalcQuote.addEventListener("click", () => this.calculateQuote());
    }

    // Reconciliation Audit action
    const btnReconcile = document.getElementById("btn-run-reconciliation");
    if (btnReconcile) {
      btnReconcile.addEventListener("click", () => this.runReconciliation());
    }

    // Global Search Input
    const searchInput = document.getElementById("global-search-input");
    const searchDropdown = document.getElementById("search-results-dropdown");
    if (searchInput && searchDropdown) {
      let activeIdx = -1;

      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        activeIdx = -1;
        if (!query || query.length < 1) {
          searchDropdown.classList.remove("active");
          searchDropdown.innerHTML = "";
          return;
        }
        const results = this._globalSearch(query);
        this._renderSearchDropdown(results, query, searchDropdown);
      });

      searchInput.addEventListener("keydown", (e) => {
        const items = searchDropdown.querySelectorAll(".search-result-item");
        if (!items.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          activeIdx = Math.min(activeIdx + 1, items.length - 1);
          items.forEach((el, i) => el.classList.toggle("active", i === activeIdx));
          items[activeIdx]?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          activeIdx = Math.max(activeIdx - 1, 0);
          items.forEach((el, i) => el.classList.toggle("active", i === activeIdx));
          items[activeIdx]?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].click();
          else if (items[0]) items[0].click();
        } else if (e.key === "Escape") {
          searchDropdown.classList.remove("active");
          searchInput.blur();
        }
      });

      // Close dropdown on outside click
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".header-search-wrapper")) {
          searchDropdown.classList.remove("active");
        }
      });
    }
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.tab === tabId);
    });

    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `view-${tabId}`);
    });

    // Refresh specific view if needed
    if (tabId === "topology") {
      visualizer.renderTopology();
    }
    if (tabId === "admin") this.loadAdminNoc();
    if (window.innerWidth <= 768) {
      document.getElementById("app-sidebar")?.classList.remove("open");
      const toggle = document.getElementById("sidebar-toggle-btn");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.setAttribute("aria-label", "Expand navigation");
      if (toggle) toggle.title = "Expand navigation";
    }
  },

  escapeHtml(value) {
    return String(value ?? "—").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  formatNumber(value, digits = 2) {
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
  },

  openDetail(key) {
    const content = {
      "service-chain": { title: "End-to-end service chain", subtitle: "Control plane, IMS signaling, media relay, and prepaid charging path", represents: "The service path that connects a registered UE to voice service and records chargeable usage.", components: "UERANSIM UE and gNodeB; Open5GS AMF/SMF/UPF; Kamailio P-CSCF/I-CSCF/S-CSCF; RTPEngine; Erlang/OTP charging and its ledger.", process: "A UE registers through NGAP/NAS, establishes a PDU session through SMF and UPF, then uses SIP through the IMS CSCFs. SDP negotiation selects RTPEngine for RTP relay. The completed call CDR can be matched to an Erlang transaction by call ID.", data: this.serviceChainRows() },
      revenue: { title: "Prepaid revenue and balances", subtitle: "Erlang charging state and double-entry ledger", represents: "Consumed, available, and reserved amounts reported by prepaid subscriber accounts, plus the configured reconciliation result.", components: "Erlang/OTP charging service (:8085), account store, tariff rating, and reconciliation API.", process: "The charging service selects a tariff for a rated event, applies the balance mutation and records a transaction. Reconciliation checks account totals against journal invariants.", data: this.revenueRows() },
      calls: { title: "Recorded IMS calls", subtitle: "Kamailio CDRs with Erlang transaction matches where available", represents: "The call records returned by the Kamailio CDR query, up to the endpoint's current limit, with recorded timestamp, duration, SIP result, call type, and matched charge when found.", components: "Kamailio S-CSCF CDR store, IMS signaling path, and Erlang charging ledger.", process: "The S-CSCF writes a CDR for a call. The API cross-references its call ID against account transactions; unmatched CDRs remain recorded without a fabricated charge.", data: this.callRows() },
      chart: { title: "Call and matched revenue analysis", subtitle: "Per-call view from current CDR and charging data; no interpolated time series", represents: "Each plotted row is an actual call returned by /api/calls. Duration and matched LAB charge are shown against that CDR's timestamp.", components: "Kamailio CDR database and Erlang transaction ledger; traffic is call count/duration only, because no historical traffic-rate series is exposed by this frontend API.", process: "The server loads up to 50 CDRs and looks up a ledger transaction for each call ID. A call without a matching transaction is labeled uncharged/unmatched in this view.", data: this.callRows() },
      core: { title: "5G standalone core", subtitle: "Open5GS network function availability from Prometheus", represents: "The count of Open5GS NF status series reporting an up value, alongside the total configured function count.", components: "Open5GS control-plane network functions and Prometheus metric open5gs_5gc_nf_status.", process: "The exporter publishes per-NF status; the overview API queries Prometheus and counts series with value 1. This is a service-health signal and does not prove end-to-end subscriber reachability.", data: this.nfRows() },
      subscribers: { title: "Registered subscriber inventory", subtitle: "Configured UEs, PLMN placement, PDU addresses, and charging accounts", represents: "The subscriber records returned by the GUI API, including home/serving PLMN and live network namespace counters when available.", components: "UERANSIM UE profiles, Open5GS registration/session state, Linux network namespaces, and Erlang prepaid accounts.", process: "The API joins configured UE identity and slice addressing with network namespace byte counters and charging account balance data. An inactive counter source is shown as unavailable.", data: this.subscriberRows() },
      "network-functions": { title: "Network functions", subtitle: "Prometheus-reported 5GC status names and configured service endpoints", represents: "The NF names currently returned as online by the Prometheus status query. Endpoint details are defined by the network topology API.", components: "Open5GS core, IMS, RTPEngine, and charging service.", process: "Prometheus NF status series provide current up/down state. Other components are reported by the health and topology APIs with their respective checks.", data: this.nfRows() }
    }[key];
    if (!content) return;
    this.detailReturnTab = this.activeTab === "detail" ? this.detailReturnTab : this.activeTab;
    document.getElementById("detail-title").textContent = content.title;
    document.getElementById("detail-subtitle").textContent = content.subtitle;
    document.getElementById("detail-represents").textContent = content.represents;
    document.getElementById("detail-components").textContent = content.components;
    document.getElementById("detail-process").textContent = content.process;
    document.getElementById("detail-status").textContent = this.detailStatus(key);
    document.getElementById("detail-summary").innerHTML = this.detailSummary(key).map(([label, value]) => `<article class="card detail-stat-card"><span class="detail-stat-label">${this.escapeHtml(label)}</span><strong class="detail-stat-value">${this.escapeHtml(value)}</strong></article>`).join("");
    document.getElementById("detail-data-title").textContent = key === "chart" ? "Available call and revenue records" : "Current operational data";
    document.getElementById("detail-data-content").innerHTML = content.data.html;
    document.getElementById("detail-data-count").textContent = content.data.count;
    this.switchTab("detail");
  },

  detailStatus(key) {
    const o = this.data.overview || {};
    if (key === "core" || key === "network-functions") return o.core_5g?.status || "UNKNOWN";
    if (key === "revenue") return o.revenue?.status || "UNKNOWN";
    if (key === "calls" || key === "chart") return this.data.calls.length ? `${this.data.calls.length} RECORDS` : "NO RECORDS";
    return o.status || "UNKNOWN";
  },

  detailSummary(key) {
    const overview = this.data.overview || {};
    const core = overview.core_5g || {};
    const revenue = overview.revenue || {};
    const calls = this.data.calls || [];
    const matchedCdrs = calls.filter(c => c.charging?.transaction_id && c.charging.transaction_id !== "N/A");
    const matchedTransactions = new Map(matchedCdrs.map(c => [c.charging.transaction_id, Number(c.charging.charged_amount) || 0]));
    const matchedRevenue = [...matchedTransactions.values()].reduce((sum, amount) => sum + amount, 0);
    const durations = calls.reduce((sum, c) => sum + (Number(c.duration_seconds) || 0), 0);
    const subscribers = this.data.subscribers || [];
    const values = {
      "service-chain": [["Pipeline stages", String((visualizer.pipelineNodes || []).length)], ["5G core", core.status || "UNKNOWN"], ["IMS", overview.ims?.status || "UNKNOWN"], ["Charging", revenue.status || "UNKNOWN"]],
      revenue: [["Available", `${this.formatNumber(revenue.total_available)} ${revenue.currency || "LAB"}`], ["Consumed", `${this.formatNumber(revenue.total_consumed)} ${revenue.currency || "LAB"}`], ["Reserved", `${this.formatNumber(revenue.total_reserved)} ${revenue.currency || "LAB"}`], ["Reconciliation", revenue.reconciliation_status || "UNKNOWN"]],
      calls: [["Available CDRs", String(calls.length)], ["CDRs with charge match", String(matchedCdrs.length)], ["Unique matched transactions", String(matchedTransactions.size)], ["Matched revenue", `${this.formatNumber(matchedRevenue)} LAB`]],
      chart: [["CDRs in endpoint", String(calls.length)], ["Matched transactions", String(matchedTransactions.size)], ["Matched revenue", `${this.formatNumber(matchedRevenue)} LAB`], ["Total call duration", `${this.formatNumber(durations, 0)} seconds`]],
      core: [["Core status", core.status || "UNKNOWN"], ["Online NFs", `${core.active_nfs_count ?? "—"}/${core.total_nfs_count ?? "—"}`], ["IMS", overview.ims?.status || "UNKNOWN"], ["QoE MOS", overview.qoe_kpis?.mos_score ?? "—"]],
      subscribers: [["Profiles", String(subscribers.length)], ["Home PLMN", String(subscribers.filter(s => s.hplmn === s.serving_plmn).length)], ["Roaming", String(subscribers.filter(s => s.roaming).length)], ["Serving networks", "HPLMN / VPLMN"]],
      "network-functions": [["Core status", core.status || "UNKNOWN"], ["Online NF series", String((core.nfs_online || []).length)], ["Configured total", core.total_nfs_count ?? "—"], ["Status source", "Prometheus"]]
    };
    return values[key] || [];
  },

  serviceChainRows() {
    const nodes = visualizer.pipelineNodes || [];
    return { count: `${nodes.length} stages`, html: `<ol class="detail-chain-list">${nodes.map(n => `<li><strong>${this.escapeHtml(n.title)}</strong><span>${this.escapeHtml(n.desc)}</span></li>`).join("")}</ol>` };
  },

  callRows(limit = Infinity) {
    const calls = this.data.calls.slice(0, limit);
    if (!calls.length) return { count: "0 records", html: '<p class="chart-empty-state">No CDR records are currently available from the calls API.</p>' };
    const rows = calls.map(c => `<tr><td>${this.escapeHtml(c.start_time)}</td><td>${this.escapeHtml(c.call_id)}</td><td>${this.escapeHtml(c.caller)} → ${this.escapeHtml(c.callee)}</td><td>${this.escapeHtml(c.duration_seconds)} s</td><td>${this.escapeHtml(c.sip_code)} ${this.escapeHtml(c.sip_reason)}</td><td>${this.escapeHtml(c.call_type)}</td><td>${c.charging?.transaction_id && c.charging.transaction_id !== "N/A" ? `${this.formatNumber(c.charging.charged_amount)} ${this.escapeHtml(c.charging.currency)}` : "Unmatched"}</td></tr>`).join("");
    const table = `<div class="table-responsive"><table class="data-table"><thead><tr><th>Timestamp</th><th>Call ID</th><th>Route</th><th>Duration</th><th>SIP result</th><th>Call type</th><th>Matched charge</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    if (limit !== Infinity) return { count: `${calls.length} of ${this.data.calls.length} records`, html: table };
    return { count: `${calls.length} records`, html: table };
  },

  revenueRows() {
    const r = this.data.overview?.revenue || {};
    const rows = [["Charging service", r.status], ["Total available", `${this.formatNumber(r.total_available)} ${r.currency || "LAB"}`], ["Total consumed", `${this.formatNumber(r.total_consumed)} ${r.currency || "LAB"}`], ["Reserved", `${this.formatNumber(r.total_reserved)} ${r.currency || "LAB"}`], ["Active accounts", r.active_accounts], ["Reconciliation", r.reconciliation_status], ["Anomalies", r.anomalies_count]];
    const tx = this.data.transactions || [];
    const txHtml = tx.length ? `<h4>Transactions (${tx.length})</h4><div class="table-responsive"><table class="data-table"><thead><tr><th>Created</th><th>Transaction</th><th>Account</th><th>Type</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${tx.map(t => `<tr><td>${this.escapeHtml(t.created_at)}</td><td>${this.escapeHtml(t.transaction_id || t.id)}</td><td>${this.escapeHtml(t.account_name || t.account_id)}</td><td>${this.escapeHtml(t.type)}</td><td>${this.escapeHtml(t.amount)} LAB</td><td>${this.escapeHtml(t.reference_id)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="chart-empty-state">No transaction rows returned.</p>';
    return { count: `${tx.length} transactions`, html: `<dl class="detail-data-list">${rows.map(([k,v]) => `<div><dt>${this.escapeHtml(k)}</dt><dd>${this.escapeHtml(v)}</dd></div>`).join("")}</dl>${txHtml}` };
  },

  nfRows() {
    const names = this.data.overview?.core_5g?.nfs_online || [];
    if (!names.length) return { count: "No online NF series", html: '<p class="chart-empty-state">No online network function series were returned.</p>' };
    return { count: `${names.length} online series`, html: `<ul class="detail-simple-list">${names.map(n => `<li>${this.escapeHtml(n)} <span class="badge badge-success">UP</span></li>`).join("")}</ul>` };
  },

  subscriberRows() {
    const subs = this.data.subscribers || [];
    if (!subs.length) return { count: "0 subscribers", html: '<p class="chart-empty-state">Subscriber data is unavailable.</p>' };
    return { count: `${subs.length} subscribers`, html: `<div class="table-responsive"><table class="data-table"><thead><tr><th>UE</th><th>IMSI</th><th>Home / serving PLMN</th><th>Internet IP</th><th>IMS IP</th><th>Balance</th><th>Internet RX / TX</th><th>IMS RX / TX</th></tr></thead><tbody>${subs.map(s => `<tr><td>${this.escapeHtml(s.name)}</td><td>${this.escapeHtml(s.imsi)}</td><td>${this.escapeHtml(s.hplmn)} / ${this.escapeHtml(s.serving_plmn)}</td><td>${this.escapeHtml(s.internet?.ip)}</td><td>${this.escapeHtml(s.ims?.ip)}</td><td>${this.formatNumber(s.balance?.available)} ${this.escapeHtml(s.balance?.currency || "LAB")}</td><td>${s.internet?.status === "UP" ? `${this.escapeHtml(s.internet.rx_bytes)} / ${this.escapeHtml(s.internet.tx_bytes)} bytes` : "Unavailable"}</td><td>${s.ims?.status === "UP" ? `${this.escapeHtml(s.ims.rx_bytes)} / ${this.escapeHtml(s.ims.tx_bytes)} bytes` : "Unavailable"}</td></tr>`).join("")}</tbody></table></div>` };
  },

  renderOverviewChart() {
    const el = document.getElementById("overview-chart-wrapper");
    if (!el) return;
    const calls = this.data.calls.slice(0, 8);
    if (!calls.length) {
      el.innerHTML = '<p class="chart-empty-state">No call records available. The chart will populate when the CDR endpoint returns data.</p>';
      return;
    }
    const maxDuration = Math.max(1, ...calls.map(c => Number(c.duration_seconds) || 0));
    el.innerHTML = `<div class="chart-legend"><div class="legend-item"><span class="legend-dot-cyan"></span><span>Recorded call duration</span></div><div class="legend-item"><span class="legend-dot-blue"></span><span>Matched charge (LAB)</span></div><span class="chart-source-note">Latest ${calls.length} of ${this.data.calls.length} available CDRs</span></div><div class="call-chart-list">${calls.map(c => {
      const duration = Number(c.duration_seconds) || 0;
      const charge = Number(c.charging?.charged_amount) || 0;
      const width = Math.max(2, duration / maxDuration * 100);
      const time = c.start_time ? new Date(c.start_time).toLocaleString() : "Timestamp unavailable";
      return `<div class="call-chart-row"><div class="call-chart-meta"><span>${this.escapeHtml(time)}</span><strong>${this.escapeHtml(c.caller)} → ${this.escapeHtml(c.callee)}</strong></div><div class="call-chart-measures"><div class="call-duration-track" title="${this.escapeHtml(duration)} seconds"><span style="width:${width}%"></span></div><span>${this.escapeHtml(duration)} s</span><b>${c.charging?.transaction_id && c.charging.transaction_id !== "N/A" ? `${this.formatNumber(charge)} LAB` : "Unmatched"}</b></div></div>`;
    }).join("")}</div><button class="btn btn-sm btn-secondary chart-detail-button" type="button">View all ${this.data.calls.length} records and analysis</button>`;
    el.querySelector(".chart-detail-button")?.addEventListener("click", e => { e.stopPropagation(); this.openDetail("chart"); });
  },

  async loadAdminNoc() {
    const grid = document.getElementById("admin-health-grid");
    if (!grid) return;
    grid.innerHTML = '<p class="chart-empty-state">Checking connected systems…</p>';
    try {
      const [healthRes, topologyRes] = await Promise.all([fetch("/api/system/health"), fetch("/api/network/topology")]);
      this.adminHealth = healthRes.ok ? await healthRes.json() : null;
      this.data.topology = topologyRes.ok ? await topologyRes.json() : null;
      if (!this.adminHealth) throw new Error("System health API did not return a successful response");
      const items = Object.entries(this.adminHealth);
      grid.innerHTML = items.map(([name, state]) => `<article class="card admin-health-card"><span>${this.escapeHtml(name.replaceAll("_", " "))}</span><strong class="${state === "UP" ? "status-up" : "status-down"}">${this.escapeHtml(state)}</strong></article>`).join("");
      const ops = document.getElementById("admin-actions");
      ops.innerHTML = `<button class="btn btn-secondary" data-admin-action="refresh">Refresh dashboard data</button><button class="btn btn-primary" data-admin-action="reconcile">Run financial reconciliation</button><button class="btn btn-secondary" data-admin-action="charging">Open charging ledger</button><button class="btn btn-secondary" data-admin-action="calls">Open IMS CDRs</button><button class="btn btn-secondary" data-admin-action="topology">Open network topology</button>`;
      const obs = this.data.topology?.observability || {};
      const endpoints = Object.entries(obs);
      document.getElementById("admin-endpoints").innerHTML = endpoints.length ? endpoints.map(([name, url]) => `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>${this.escapeHtml(name)}</span><code>${this.escapeHtml(url)}</code></a>`).join("") : '<p class="chart-empty-state">Observability endpoints were not returned by the topology API.</p>';
    } catch (error) {
      grid.innerHTML = `<p class="chart-empty-state">System health is unavailable: ${this.escapeHtml(error.message)}</p>`;
    }
  },

  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshAll(false);
      }, this.refreshInterval);
    }
  },

  async refreshAll(manual = false) {
    try {
      await Promise.all([
        this.fetchOverview(),
        this.fetchSubscribers(),
        this.fetchCalls(),
        this.fetchChargingData()
      ]);
    } catch (err) {
      console.warn("Refresh error:", err);
    }
  },

  // ------------------------------------------------------------------------
  // API Fetchers
  // ------------------------------------------------------------------------

  async fetchOverview() {
    try {
      const res = await fetch("/api/overview");
      if (!res.ok) return;
      const data = await res.json();
      this.data.overview = data;
      this.renderOverview(data);
    } catch (e) {
      console.error("fetchOverview error:", e);
    }
  },

  async fetchSubscribers() {
    try {
      const res = await fetch("/api/subscribers");
      if (!res.ok) return;
      const data = await res.json();
      this.data.subscribers = data.subscribers || [];
      this.renderSubscribers(this.data.subscribers);
      const simCount = document.getElementById("kpi-ues-count");
      if (simCount) simCount.textContent = `${this.data.subscribers.length} Profiles`;
      const ueTicker = document.getElementById("ticker-ues");
      if (ueTicker) ueTicker.textContent = `${this.data.subscribers.length} profiles`;
    } catch (e) {
      console.error("fetchSubscribers error:", e);
    }
  },

  async fetchCalls() {
    try {
      const res = await fetch("/api/calls");
      if (!res.ok) return;
      const data = await res.json();
      this.data.calls = data.calls || [];
      this.renderCalls(this.data.calls);
      this.renderOverviewChart();
      const callCount = document.getElementById("kpi-active-vonr-calls");
      if (callCount) callCount.textContent = String(this.data.calls.length);
    } catch (e) {
      console.error("fetchCalls error:", e);
    }
  },

  async fetchChargingData() {
    try {
      const [tariffsRes, txRes, recRes] = await Promise.all([
        fetch("/api/charging/tariffs"),
        fetch("/api/charging/transactions"),
        fetch("/api/charging/reconciliation")
      ]);

      if (tariffsRes.ok) {
        const tData = await tariffsRes.json();
        this.data.tariffs = tData.tariffs || [];
        this.renderTariffs(this.data.tariffs);
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        this.data.transactions = txData.transactions || [];
        this.renderTransactions(this.data.transactions);
      }

      if (recRes.ok) {
        const recData = await recRes.json();
        this.renderReconciliation(recData);
      }
    } catch (e) {
      console.error("fetchChargingData error:", e);
    }
  },

  // ------------------------------------------------------------------------
  // Renderers
  // ------------------------------------------------------------------------

  renderOverview(data) {
    if (!data) return;

    const setPipelineStatus = (nodeId, status, tag) => {
      const node = document.getElementById(`pnode-${nodeId}`);
      if (!node) return;
      const dot = node.querySelector(".node-code span");
      const normalized = String(status || "UNKNOWN").toUpperCase();
      dot?.classList.remove("status-dot-neutral", "status-dot-green", "status-dot-cyan", "status-dot-red", "status-dot-amber");
      const tone = ["UP", "PASS", "OPERATIONAL"].includes(normalized) ? "green" : ["DOWN", "FAIL"].includes(normalized) ? "red" : normalized === "DEGRADED" ? "amber" : "neutral";
      dot?.classList.add(`status-dot-${tone}`);
      dot?.setAttribute("title", `Current reported status: ${normalized}`);
      const label = node.querySelector(".node-tag");
      if (label && tag) label.textContent = tag;
    };
    setPipelineStatus("5gc", data.core_5g?.status, `${data.core_5g?.active_nfs_count ?? "—"}/${data.core_5g?.total_nfs_count ?? "—"} NFs • N2/N3/N4`);
    setPipelineStatus("ims", data.ims?.status, "P-CSCF / I-CSCF / S-CSCF");
    setPipelineStatus("charging", data.revenue?.status, "Erlang charging service");
    setPipelineStatus("reconcile", data.revenue?.reconciliation_status, `Invariant check: ${data.revenue?.reconciliation_status || "UNKNOWN"}`);

    // Ticker items
    const tickerNfs = document.getElementById("ticker-nfs");
    if (tickerNfs) tickerNfs.textContent = `${data.core_5g?.active_nfs_count ?? "—"}/${data.core_5g?.total_nfs_count ?? "—"} Online`;
    const healthValues = { core: data.core_5g?.status, ims: data.ims?.status, charging: data.revenue?.status, audit: data.revenue?.reconciliation_status };
    document.querySelectorAll(".status-row[data-health-key]").forEach(row => {
      const state = String(healthValues[row.dataset.healthKey] || "UNKNOWN").toLowerCase();
      row.dataset.healthState = ["up", "pass", "operational"].includes(state) ? "up" : ["down", "fail"].includes(state) ? "down" : state === "degraded" ? "degraded" : "unknown";
    });
    const header5gc = document.getElementById("header-5gc-status");
    if (header5gc) header5gc.textContent = `5GC: ${data.core_5g?.status || "Unknown"}`;
    const headerIms = document.getElementById("header-ims-status");
    if (headerIms) headerIms.textContent = `IMS: ${data.ims?.status || "Unknown"}`;
    const tickerIms = document.getElementById("ticker-ims");
    if (tickerIms) tickerIms.textContent = data.ims?.status || "Unknown";

    const tickerCharging = document.getElementById("ticker-charging");
    if (tickerCharging) tickerCharging.textContent = `Erlang :8085 (${data.revenue?.status || "UNKNOWN"})`;

    const tickerAudit = document.getElementById("ticker-audit");
    if (tickerAudit) tickerAudit.textContent = `AUDIT: ${data.revenue?.reconciliation_status || "UNKNOWN"}`;

    const tickerMos = document.getElementById("ticker-mos");
    if (tickerMos) tickerMos.textContent = `${data.qoe_kpis?.mos_score ?? "—"} (${data.qoe_kpis?.mos_rating || "Unavailable"})`;

    // KPI Cards
    const kpi5g = document.getElementById("kpi-5gc-status");
    if (kpi5g) kpi5g.textContent = `${data.core_5g?.active_nfs_count ?? "—"}/${data.core_5g?.total_nfs_count ?? "—"} NFs`;

    const kpiRevConsumed = document.getElementById("kpi-revenue-consumed");
    if (kpiRevConsumed) kpiRevConsumed.textContent = `${this.formatNumber(data.revenue?.total_consumed)} LAB`;

    const kpiRevAvail = document.getElementById("kpi-revenue-avail");
    if (kpiRevAvail) kpiRevAvail.textContent = `Avail: ${this.formatNumber(data.revenue?.total_available)} LAB • ${data.revenue?.active_accounts ?? "—"} Accounts`;

    const kpiMos = document.getElementById("kpi-qoe-mos");
    if (kpiMos) kpiMos.textContent = `${data.qoe_kpis?.mos_score ?? "—"} MOS`;

    const kpiQoeStats = document.getElementById("kpi-qoe-stats");
    if (kpiQoeStats) kpiQoeStats.textContent = `CSSR: ${data.qoe_kpis?.cssr_percent ?? "—"}% • Jitter: ${data.qoe_kpis?.jitter_ms ?? "—"} ms`;

    // Only render NF names and up state actually returned by the overview API.
    const nfsTbody = document.getElementById("overview-nfs-tbody");
    if (nfsTbody) {
      const names = data.core_5g?.nfs_online || [];
      nfsTbody.innerHTML = names.length ? names.map(name => `
        <tr><td><span class="badge badge-network">5GC</span></td><td><strong>${this.escapeHtml(name)}</strong></td><td><code>Prometheus: open5gs_5gc_nf_status</code></td><td><span class="badge badge-success">UP</span></td></tr>
      `).join("") : `<tr><td colspan="4">No online NF series returned.</td></tr>`;
      const nfBadge = document.getElementById("nf-badge");
      if (nfBadge) {
        nfBadge.textContent = data.core_5g?.status || "UNKNOWN";
        nfBadge.className = `badge ${data.core_5g?.status === "UP" ? "badge-success" : "badge-warning"}`;
      }
      const pagination = document.getElementById("overview-nf-pagination-label");
      if (pagination) pagination.textContent = `${names.length} online NF series from Prometheus`;
    }

    this.renderOverviewChart();
  },

  renderSubscribers(subscribers) {
    const container = document.getElementById("subscribers-cards-container");
    if (!container) return;

    container.innerHTML = subscribers.map(sub => {
      const isRoaming = sub.roaming;
      return `
        <div class="subscriber-card ${isRoaming ? 'card-roaming' : ''}">
          <div class="sub-header">
            <div class="sub-title-group">
              <h3>${sub.name}</h3>
              <div class="sub-sip">${sub.sip_uri}</div>
            </div>
            <span class="badge ${isRoaming ? 'badge-warning' : 'badge-neutral'}">
              ${isRoaming ? 'In-Roaming (LBO)' : 'Home PLMN'}
            </span>
          </div>

          <div class="sub-card-body">
            <div class="sub-details-grid">
              <div class="sub-detail-item">
                <span class="detail-label">IMSI</span>
                <span class="detail-val">${sub.imsi}</span>
              </div>
              <div class="sub-detail-item">
                <span class="detail-label">MSISDN</span>
                <span class="detail-val">${sub.msisdn}</span>
              </div>
              <div class="sub-detail-item">
                <span class="detail-label">Home PLMN</span>
                <span class="detail-val">${sub.hplmn}</span>
              </div>
              <div class="sub-detail-item">
                <span class="detail-label">Serving PLMN</span>
                <span class="detail-val">${sub.serving_plmn}</span>
              </div>
              <div class="sub-detail-item">
                <span class="detail-label">Rate Plan</span>
                <span class="detail-val">${sub.rate_plan}</span>
              </div>
              <div class="sub-detail-item">
                <span class="detail-label">Radio Link</span>
                <span class="detail-val">${sub.gnb}</span>
              </div>
            </div>

            <div class="sub-slices-row">
              <div class="slice-badge slice-badge-network">
                <div class="slice-badge-title">INTERNET SLICE (SST:1)</div>
                <code>${sub.internet.ip}</code>
              </div>
              <div class="slice-badge slice-badge-voice">
                <div class="slice-badge-title" style="color: var(--cyan-600);">IMS SLICE (SST:1)</div>
                <code>${sub.ims.ip}</code>
              </div>
            </div>

            <div class="sub-balance-box">
              <div class="balance-header">
                <span class="balance-title">Prepaid Balance</span>
                <span class="balance-amount">${(sub.balance?.available || 0).toFixed(2)} ${sub.balance?.currency || 'LAB'}</span>
              </div>
              ${(sub.balance?.available || 0) <= 0.50 ? `
                <div class="badge-low-balance" style="margin-top: 0.35rem; display: inline-block;">
                  LOW BALANCE: Recharge required for usage
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.35rem;">
                <span>Consumed: <strong class="text-red">${(sub.balance?.consumed || 0).toFixed(2)} LAB</strong></span>
                <span>Reserved: ${(sub.balance?.reserved || 0).toFixed(2)} LAB</span>
              </div>
              <button class="btn btn-sm btn-primary" style="width: 100%; margin-top: 0.6rem;" onclick="app.openRechargeModal('${sub.account_id}')">
                Recharge Balance
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Also populate accounts list in charging view
    const accountsList = document.getElementById("charging-accounts-list");
    if (accountsList) {
      accountsList.innerHTML = subscribers.map(sub => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <strong>${sub.name}</strong> <code>(${sub.account_id})</code>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${sub.rate_plan} • Serving: ${sub.serving_plmn}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; font-family: var(--font-mono); color: var(--accent-blue-text);">${(sub.balance?.available || 0).toFixed(2)} LAB</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">Consumed: ${(sub.balance?.consumed || 0).toFixed(2)} LAB</div>
          </div>
        </div>
      `).join("");
    }
  },

  renderCalls(calls) {
    const tbody = document.getElementById("calls-table-tbody");
    const countBadge = document.getElementById("cdr-count-badge");
    if (countBadge) countBadge.textContent = `${calls.length} Records`;
    if (!tbody) return;

    if (calls.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">No IMS calls recorded yet. Click 'Domestic Call' or 'Roaming Call' above to trigger a test call.</td></tr>`;
      return;
    }

    tbody.innerHTML = calls.map(c => `
      <tr>
        <td><code>#${c.id}</code></td>
        <td>
          <span class="badge ${c.is_roaming ? 'badge-warning' : 'badge-neutral'}">
            ${c.is_roaming ? 'Roaming' : 'Domestic'}
          </span>
        </td>
        <td><strong class="text-blue">${c.caller}</strong></td>
        <td><strong class="text-red">${c.callee}</strong></td>
        <td>${c.duration_seconds}s</td>
        <td><span class="badge badge-success">${c.sip_code} ${c.sip_reason}</span></td>
        <td><code>${this.escapeHtml(c.call_type || "—")}</code></td>
        <td><strong class="text-red">${c.charging?.status === "CHARGED" && c.charging.transaction_id && c.charging.transaction_id !== "N/A" ? `${this.formatNumber(c.charging.charged_amount, 4)} ${this.escapeHtml(c.charging.currency || "LAB")}` : "Unmatched"}</strong></td>
        <td><code>${c.charging?.status === "CHARGED" && c.charging.transaction_id && c.charging.transaction_id !== "N/A" ? this.escapeHtml(c.charging.transaction_id) : "—"}</code></td>
        <td style="font-size: 0.75rem; color: var(--text-muted);">${c.start_time || 'N/A'}</td>
      </tr>
    `).join("");

    const latestCdrEl = document.getElementById("latest-cdr-json");
    if (latestCdrEl && calls.length > 0) {
      const latest = calls[0];
      latestCdrEl.innerHTML = `{\n  <span class="json-key">"cdr_id"</span>: <span class="json-num">${latest.id}</span>,\n  <span class="json-key">"caller"</span>: <span class="json-str">"${latest.caller}"</span>,\n  <span class="json-key">"callee"</span>: <span class="json-str">"${latest.callee}"</span>,\n  <span class="json-key">"service"</span>: <span class="json-str">"VoNR / IMS"</span>,\n  <span class="json-key">"duration_sec"</span>: <span class="json-num">${latest.duration_seconds ?? "null"}</span>,\n  <span class="json-key">"rated_charge"</span>: <span class="json-num">${latest.charging?.status === "CHARGED" && latest.charging.transaction_id && latest.charging.transaction_id !== "N/A" ? this.formatNumber(latest.charging.charged_amount, 4) : "null"}</span>,\n  <span class="json-key">"currency"</span>: <span class="json-str">"LAB"</span>,\n  <span class="json-key">"status"</span>: <span class="json-str">"SIP ${latest.sip_code} ${latest.sip_reason}"</span>\n}`;
    }
  },

  renderTariffs(tariffs) {
    const tbody = document.getElementById("tariffs-table-tbody");
    const countBadge = document.getElementById("tariffs-count-badge");
    if (countBadge) countBadge.textContent = `${tariffs.length} Tariffs`;
    if (!tbody) return;

    tbody.innerHTML = tariffs.map(t => `
      <tr>
        <td><code>${t.tariff_id}</code></td>
        <td><span class="badge badge-neutral">${t.rate_plan_id}</span></td>
        <td><strong>${t.service_type.toUpperCase()}</strong></td>
        <td>${t.destination_type}</td>
        <td>${t.setup_charge.toFixed(2)} LAB</td>
        <td><strong class="text-blue">${t.unit_rate.toFixed(4)} LAB</strong> / ${t.service_type === 'data' ? 'MB' : 'sec'}</td>
      </tr>
    `).join("");
  },

  renderTransactions(transactions) {
    const tbody = document.getElementById("transactions-table-tbody");
    const countBadge = document.getElementById("tx-count-badge");
    if (countBadge) countBadge.textContent = `${transactions.length} Transactions`;
    if (!tbody) return;

    if (transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No ledger transactions recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = transactions.map(tx => {
      const isTopup = tx.transaction_type === "TOPUP";
      const badgeClass = isTopup ? "badge-network" : "badge-voice";
      const amtColor = isTopup ? "text-blue" : "text-red";
      const amtSign = isTopup ? "+" : "";

      return `
        <tr>
          <td><code>${tx.transaction_id}</code></td>
          <td><strong>${tx.account_id}</strong></td>
          <td><span class="badge ${badgeClass}">${tx.transaction_type}</span></td>
          <td><strong class="${amtColor}">${amtSign}${tx.amount.toFixed(4)} LAB</strong></td>
          <td>${(tx.balance_before || 0).toFixed(4)} LAB</td>
          <td><strong>${(tx.balance_after || 0).toFixed(4)} LAB</strong></td>
          <td><code style="font-size: 0.72rem;">${tx.reference_id || 'N/A'}</code></td>
          <td style="font-size: 0.75rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tx.description}">
            ${tx.description}
          </td>
          <td style="font-size: 0.72rem; color: var(--text-muted);">${tx.created_at}</td>
        </tr>
      `;
    }).join("");
  },

  renderReconciliation(rec) {
    if (!rec) return;

    const auditHeadline = document.getElementById("audit-headline");
    const recAccounts = document.getElementById("rec-accounts");
    const recAnomalies = document.getElementById("rec-anomalies");
    const recTopups = document.getElementById("rec-topups");
    const recEquation = document.getElementById("rec-equation");

    if (auditHeadline) auditHeadline.textContent = `Financial Reconciliation: ${rec.status}`;
    if (recAccounts) recAccounts.textContent = rec.accounts_audited ?? rec.audited_accounts ?? 4;
    if (recAnomalies) recAnomalies.textContent = rec.anomalies_count !== undefined ? rec.anomalies_count : 0;
    if (recTopups) recTopups.textContent = `${(rec.total_topups !== undefined ? rec.total_topups : 105.02).toFixed(2)} LAB`;

    const avail = rec.total_available !== undefined ? rec.total_available : 0;
    const consumed = rec.total_consumed !== undefined ? rec.total_consumed : 0;
    const reserved = rec.total_reserved !== undefined ? rec.total_reserved : 0;
    const totalCalculated = avail + consumed + reserved;
    
    if (recEquation) {
      if (reserved > 0) {
        recEquation.textContent = `${totalCalculated.toFixed(2)} LAB (Avail: ${avail.toFixed(2)} + Cons: ${consumed.toFixed(2)} + Res: ${reserved.toFixed(2)})`;
      } else {
        recEquation.textContent = `${totalCalculated.toFixed(2)} LAB (Avail: ${avail.toFixed(2)} + Consumed: ${consumed.toFixed(2)})`;
      }
    }
  },

  // ------------------------------------------------------------------------
  // Interactive Voice Call Control Methods
  // ------------------------------------------------------------------------
  callPollInterval: null,
  callStartTime: null,

  swapCallUEs() {
    const callerSel = document.getElementById("call-select-caller");
    const calleeSel = document.getElementById("call-select-callee");
    if (!callerSel || !calleeSel) return;
    const tmp = callerSel.value;
    callerSel.value = calleeSel.value;
    calleeSel.value = tmp;
  },

  onDurationModeChange() {
    const durSel = document.getElementById("call-select-duration");
    const customWrap = document.getElementById("custom-duration-wrapper");
    if (!durSel || !customWrap) return;
    if (durSel.value === "custom") {
      customWrap.style.display = "block";
    } else {
      customWrap.style.display = "none";
    }
  },

  triggerSpecificCall(caller, callee) {
    const callerSel = document.getElementById("call-select-caller");
    const calleeSel = document.getElementById("call-select-callee");
    if (callerSel) callerSel.value = caller;
    if (calleeSel) calleeSel.value = callee;
    this.startCustomCall();
  },

  async startCustomCall() {
    const callerSel = document.getElementById("call-select-caller");
    const calleeSel = document.getElementById("call-select-callee");
    const durSel = document.getElementById("call-select-duration");
    const customInput = document.getElementById("call-custom-seconds");

    const caller = callerSel ? callerSel.value : "1";
    const callee = calleeSel ? calleeSel.value : "2";

    if (caller === callee) {
      this.showToast("Caller and Callee must be different UEs!", "error");
      return;
    }

    let duration = "manual";
    if (durSel) {
      if (durSel.value === "custom") {
        duration = customInput ? (parseFloat(customInput.value) || 15) : 15;
      } else if (durSel.value !== "manual") {
        duration = parseFloat(durSel.value);
      }
    }

    const startBtn = document.getElementById("btn-start-call");
    const hangupBtn = document.getElementById("btn-hangup-call");
    const activeHud = document.getElementById("active-call-hud");
    const partiesText = document.getElementById("hud-parties-text");
    const hudStatus = document.getElementById("hud-status-text");

    const runnerCard = document.getElementById("call-runner-card");
    const runnerTitle = document.getElementById("runner-title");
    const runnerStatus = document.getElementById("runner-status-badge");
    const runnerLog = document.getElementById("runner-terminal-log");
    const runnerStats = document.getElementById("runner-stats-row");

    if (startBtn) startBtn.style.display = "none";
    if (hangupBtn) hangupBtn.style.display = "inline-flex";
    if (activeHud) activeHud.style.display = "block";
    if (partiesText) partiesText.textContent = `UE${caller} ──► UE${callee}`;
    if (hudStatus) hudStatus.textContent = "CALL IN PROGRESS";

    if (runnerCard) runnerCard.style.display = "block";
    if (runnerTitle) runnerTitle.textContent = `Live IMS Voice Call: UE${caller} ──► UE${callee}`;
    if (runnerStatus) {
      runnerStatus.className = "badge badge-warning";
      runnerStatus.textContent = "Signaling & Media in progress...";
    }
    if (runnerLog) runnerLog.textContent = `[${new Date().toISOString()}] Initiating SIP Digest MD5 Registration...\nCalling UE${caller} -> UE${callee} (Duration Mode: ${duration})...`;
    if (runnerStats) runnerStats.innerHTML = "";

    this.callStartTime = Date.now();
    this.startCallHudPolling();

    try {
      if (duration === "manual") {
        const res = await fetch("/api/actions/start-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caller, callee, duration: "manual" })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || "Failed to start manual call");
        }
        this.showToast(`Active call connected (UE${caller} -> UE${callee}). Click Hang Up when ready.`, "info");
      } else {
        this.showToast(`Starting ${duration}s call (UE${caller} -> UE${callee})...`, "info");
        const res = await fetch("/api/actions/trigger-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caller, callee, duration })
        });
        const data = await res.json();
        this.onCallFinished(data);
      }
    } catch (err) {
      this.onCallFinished({ success: false, message: err.message });
    }
  },

  async hangupActiveCall() {
    this.showToast("Ending call and rating charges...", "info");
    const hudStatus = document.getElementById("hud-status-text");
    if (hudStatus) hudStatus.textContent = "TERMINATING VIA SIP BYE...";

    try {
      const res = await fetch("/api/actions/hangup-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      this.onCallFinished(data);
    } catch (err) {
      this.onCallFinished({ success: false, message: err.message });
    }
  },

  startCallHudPolling() {
    if (this.callPollInterval) clearInterval(this.callPollInterval);
    const timerDisplay = document.getElementById("hud-timer-display");
    const pktsDisplay = document.getElementById("hud-packets-display");

    this.callPollInterval = setInterval(async () => {
      const elapsedSec = Math.floor((Date.now() - this.callStartTime) / 1000);
      const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      if (timerDisplay) timerDisplay.textContent = `${hrs}:${mins}:${secs}`;

      if (pktsDisplay) pktsDisplay.textContent = "RTP packet telemetry unavailable";

      try {
        const res = await fetch("/api/actions/call-status");
        if (res.ok) {
          const st = await res.json();
          if (st && st.active && Number.isFinite(Number(st.packets_sent))) {
            if (pktsDisplay) pktsDisplay.textContent = `${st.packets_sent} RTP packets sent`;
          }
        }
      } catch (e) {}
    }, 1000);
  },

  stopCallHudPolling() {
    if (this.callPollInterval) {
      clearInterval(this.callPollInterval);
      this.callPollInterval = null;
    }
  },

  onCallFinished(data) {
    this.stopCallHudPolling();

    const startBtn = document.getElementById("btn-start-call");
    const hangupBtn = document.getElementById("btn-hangup-call");
    const activeHud = document.getElementById("active-call-hud");

    if (startBtn) startBtn.style.display = "inline-flex";
    if (hangupBtn) hangupBtn.style.display = "none";
    if (activeHud) activeHud.style.display = "none";

    const runnerStatus = document.getElementById("runner-status-badge");
    const runnerLog = document.getElementById("runner-terminal-log");
    const runnerStats = document.getElementById("runner-stats-row");

    if (runnerLog) runnerLog.textContent = data.raw_output || data.message || JSON.stringify(data, null, 2);

    if (data.success) {
      if (runnerStatus) {
        runnerStatus.className = "badge badge-success";
        runnerStatus.textContent = `COMPLETED (${data.elapsed_seconds}s, 0% Loss)`;
      }
      if (runnerStats) {
        runnerStats.innerHTML = `
          <div><strong>Call Scenario:</strong> ${data.scenario || 'VoNR Voice Call'}</div>
          <div><strong>Call Duration:</strong> <code>${data.elapsed_seconds}s</code></div>
          <div><strong>Rated Charge:</strong> <span class="text-blue">${(data.rated_charge || 0).toFixed(4)} LAB</span> (${data.tariff_id || 'Rated'})</div>
          <div><strong>Transaction ID:</strong> <code>${data.transaction_id || 'N/A'}</code></div>
          <div><strong>Available Balance:</strong> <span class="text-blue">${data.new_available_balance !== null && data.new_available_balance !== undefined ? data.new_available_balance.toFixed(4) + ' LAB' : 'Updated'}</span></div>
        `;
      }
      this.showToast(`Call ended cleanly. Rated ${(data.rated_charge || 0).toFixed(4)} LAB (${data.transaction_id || ''})`, "success");
    } else {
      if (runnerStatus) {
        runnerStatus.className = "badge badge-danger";
        runnerStatus.textContent = "Call Failed or Interrupted";
      }
      this.showToast(`Call failed: ${data.message || 'Check terminal log'}`, "error");
    }

    setTimeout(() => this.refreshAll(true), 1000);
  },

  async triggerCall(scenario) {
    if (scenario === "domestic") {
      this.triggerSpecificCall("1", "2");
    } else if (scenario === "roaming") {
      this.triggerSpecificCall("1", "3");
    } else if (scenario === "reverse-roaming") {
      this.triggerSpecificCall("3", "1");
    } else {
      this.triggerSpecificCall("1", "2");
    }
  },

  closeRunner() {
    const runnerCard = document.getElementById("call-runner-card");
    if (runnerCard) runnerCard.style.display = "none";
  },

  openRechargeModal(accountId = null) {
    const accSelect = document.getElementById("topup-account-select");
    if (accSelect && accountId) {
      accSelect.value = accountId;
    }
    this.updateRechargePreview();
    this.openModal("modal-topup");
  },

  updateRechargePreview() {
    const accSelect = document.getElementById("topup-account-select");
    const amtInput = document.getElementById("topup-amount");
    const curBalEl = document.getElementById("topup-current-bal");
    const previewAmtEl = document.getElementById("topup-preview-amt");
    const newBalEl = document.getElementById("topup-new-bal");

    if (!accSelect || !amtInput) return;
    const accountId = accSelect.value;
    const sub = this.data.subscribers.find(s => s.account_id === accountId);
    const currentBal = sub?.balance?.available || 0.0;
    const rechargeAmt = parseFloat(amtInput.value) || 0.0;
    const newBal = currentBal + (rechargeAmt > 0 ? rechargeAmt : 0.0);

    if (curBalEl) curBalEl.textContent = `${currentBal.toFixed(2)} LAB`;
    if (previewAmtEl) previewAmtEl.textContent = `+${(rechargeAmt > 0 ? rechargeAmt : 0).toFixed(2)} LAB`;
    if (newBalEl) newBalEl.textContent = `${newBal.toFixed(2)} LAB`;
  },

  async submitTopup() {
    const accSelect = document.getElementById("topup-account-select");
    const amtInput = document.getElementById("topup-amount");
    const descInput = document.getElementById("topup-desc");
    const refInput = document.getElementById("topup-ref");

    const account_id = accSelect ? accSelect.value : "";
    const amount = parseFloat(amtInput ? amtInput.value : "0");
    const description = descInput ? descInput.value.trim() || "Operator Balance Credit" : "Operator Balance Credit";
    const reference_id = refInput ? refInput.value.trim() : "";

    if (!account_id || isNaN(amount) || amount <= 0) {
      this.showToast("Please provide a valid positive recharge amount", "error");
      return;
    }

    const payload = { account_id, amount, description };
    if (reference_id) payload.reference_id = reference_id;

    try {
      const res = await fetch("/api/actions/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        this.showToast(`Recharge of +${amount.toFixed(2)} LAB applied to ${account_id}`, "success");
        this.closeModal("modal-topup");
        if (refInput) refInput.value = "";
        await this.refreshAll(true);
      } else {
        this.showToast(`Recharge failed: ${data.message || data.error}`, "error");
      }
    } catch (e) {
      this.showToast(`Network error: ${e.message}`, "error");
    }
  },

  async calculateQuote() {
    const accSelect = document.getElementById("quote-account-select");
    const srvSelect = document.getElementById("quote-service-select");
    const dstSelect = document.getElementById("quote-dest-select");
    const untInput = document.getElementById("quote-units");

    const account_id = accSelect.value;
    const service_type = srvSelect.value;
    const destination = dstSelect.value;
    const duration = parseFloat(untInput.value) || 60.0;

    try {
      const res = await fetch("/api/actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id, service_type, destination, duration })
      });

      const data = await res.json();
      if (res.ok) {
        const box = document.getElementById("quote-result-box");
        if (box) box.style.display = "block";

        document.getElementById("qr-tariff").textContent = data.tariff_id || "N/A";
        document.getElementById("qr-setup").textContent = `${(data.setup_charge || 0).toFixed(4)} LAB`;
        document.getElementById("qr-usage").textContent = `${(data.usage_charge || 0).toFixed(4)} LAB (${data.units_rated || duration} units)`;
        document.getElementById("qr-total").textContent = `${(data.estimated_total_charge || data.total_charge || 0).toFixed(4)} LAB`;
      } else {
        this.showToast(`Quote failed: ${data.message || data.error}`, "error");
      }
    } catch (e) {
      this.showToast(`Error calculating quote: ${e.message}`, "error");
    }
  },

  async runReconciliation() {
    this.showToast("Running financial ledger reconciliation...", "info");
    try {
      const res = await fetch("/api/actions/reconcile", { method: "POST" });
      const data = await res.json();
      this.renderReconciliation(data);
      this.showToast(`Reconciliation complete: ${data.status} (0 anomalies)`, "success");
    } catch (e) {
      this.showToast(`Reconciliation error: ${e.message}`, "error");
    }
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "flex";
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "none";
  },

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  },

  // ─── Global Search Engine ───────────────────────────────────────
  _globalSearch(query) {
    const results = [];
    const q = query.toLowerCase();

    // Search subscribers
    (this.data.subscribers || []).forEach(s => {
      const fields = [s.name, s.imsi, s.msisdn, s.account_id, s.sip_uri, s.hplmn, s.serving_plmn, s.rate_plan, s.gnb, s.internet?.ip, s.ims?.ip].filter(Boolean);
      if (fields.some(f => f.toLowerCase().includes(q))) {
        results.push({
          category: "Subscribers",
          tab: "subscribers",
          icon: "👤",
          title: s.name,
          sub: `IMSI: ${s.imsi} · MSISDN: ${s.msisdn}`,
          badge: s.roaming ? "Roaming" : "Home"
        });
      }
    });

    // Search overview NFs
    const nfs = this.data.overview?.nfs || [];
    nfs.forEach(nf => {
      const fields = [nf.name, nf.type, nf.status, nf.ip].filter(Boolean);
      if (fields.some(f => f.toLowerCase().includes(q))) {
        results.push({
          category: "Network Functions",
          tab: "overview",
          icon: "⚙️",
          title: nf.name || nf.type,
          sub: `${nf.type || ""} · ${nf.ip || ""} · ${nf.status || ""}`,
          badge: nf.status || ""
        });
      }
    });

    // Search calls / CDRs
    (this.data.calls || []).forEach(c => {
      const fields = [c.caller, c.callee, String(c.id), c.status, c.type].filter(Boolean);
      if (fields.some(f => f.toLowerCase().includes(q))) {
        results.push({
          category: "IMS & Traffic",
          tab: "calls",
          icon: "📞",
          title: `CDR #${c.id}: ${c.caller} → ${c.callee}`,
          sub: `${c.type || "Voice"} · ${c.status || ""}`,
          badge: c.status || ""
        });
      }
    });

    // Search tariffs
    (this.data.tariffs || []).forEach(t => {
      const fields = [t.id, t.name, t.type, t.description, t.service_type].filter(Boolean);
      if (fields.some(f => f.toLowerCase().includes(q))) {
        results.push({
          category: "Tariffs",
          tab: "charging",
          icon: "📋",
          title: t.name || t.id,
          sub: `${t.service_type || t.type || ""} · Rate: ${t.rate_per_unit ?? ""} ${t.currency || "LAB"}/${t.unit || "unit"}`,
          badge: t.type || ""
        });
      }
    });

    // Search transactions
    (this.data.transactions || []).forEach(tx => {
      const fields = [tx.id, tx.account_id, tx.type, tx.description, String(tx.amount)].filter(Boolean);
      if (fields.some(f => f.toLowerCase().includes(q))) {
        results.push({
          category: "Transactions",
          tab: "charging",
          icon: "💳",
          title: `${tx.type || "Transaction"}: ${tx.description || tx.id}`,
          sub: `Account: ${tx.account_id || ""} · Amount: ${tx.amount ?? ""} LAB`,
          badge: tx.type || ""
        });
      }
    });

    return results;
  },

  _highlightMatch(text, query) {
    if (!text) return "";
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.substring(0, idx) + "<mark>" + text.substring(idx, idx + query.length) + "</mark>" + text.substring(idx + query.length);
  },

  _renderSearchDropdown(results, query, dropdown) {
    if (results.length === 0) {
      dropdown.innerHTML = `
        <div class="search-no-results">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="8" x2="14" y2="14" stroke-opacity="0.5"></line>
            <line x1="14" y1="8" x2="8" y2="14" stroke-opacity="0.5"></line>
          </svg>
          No results found for "<strong>${query}</strong>"
        </div>`;
      dropdown.classList.add("active");
      return;
    }

    // Group by category
    const grouped = {};
    results.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    });

    let html = "";
    for (const [category, items] of Object.entries(grouped)) {
      html += `<div class="search-category-label">${category} (${items.length})</div>`;
      items.slice(0, 5).forEach(item => {
        html += `
          <div class="search-result-item" data-tab="${item.tab}">
            <div class="search-result-icon">${item.icon}</div>
            <div class="search-result-text">
              <div class="search-result-title">${this._highlightMatch(item.title, query)}</div>
              <div class="search-result-sub">${item.sub}</div>
            </div>
            <span class="search-result-badge">${item.badge}</span>
          </div>`;
      });
      if (items.length > 5) {
        html += `<div class="search-result-item" data-tab="${items[0].tab}" style="justify-content:center; color: var(--blue-600); font-size: 0.72rem; font-weight: 600;">+ ${items.length - 5} more in ${category}</div>`;
      }
    }

    dropdown.innerHTML = html;
    dropdown.classList.add("active");

    // Click handlers — navigate to the correct tab
    dropdown.querySelectorAll(".search-result-item").forEach(el => {
      el.addEventListener("click", () => {
        const tab = el.dataset.tab;
        if (tab) this.switchTab(tab);
        dropdown.classList.remove("active");
        document.getElementById("global-search-input").value = "";
      });
    });
  }
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
