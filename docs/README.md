# Documentation Index

> Reference index for technical architecture, operations, validation, and troubleshooting in ALLO - الو.

---

## 🚀 Operations & Runbook

- [**Platform Operations & Runbook**](OPERATIONS.md) — Comprehensive guide on prerequisites, end-to-end startup sequence, Web GUI operations, CLI commands, KPI measurements, monitoring, verification, shutdown, and troubleshooting.

---

## 📐 Architecture & IMS Call Flow

- [5G SA Network & IMS Architecture](architecture/README.md) — 5G SA SBA overview, NF roles, reference points, Kubernetes pod topology, and IP address plan.
- [IMS Call Flow Validation & Live Traces](IMS-CALL-FLOW-VALIDATION.md) — Live SIP traces, RTPEngine media path, root-cause analysis, and verification procedures.
- [IMS Manifest Architecture](../k8s/ims/README.md) — Kamailio P/I/S-CSCF and RTPEngine manifest design, module ordering, and subscriber credentials.

## 🔬 System Networking & Troubleshooting

- [Linux Networking & Namespace Architecture](engineering-notes/linux-networking-behind-5g.md) — Network namespaces, TUN interfaces (`ogstun`, `uesimtun`), GTP-U encapsulation, and NAT.
- [PDU Session Establishment & Debugging](engineering-notes/debugging-pdu-session.md) — Troubleshooting PDU session creation, PFCP transactions, and UPF routing.
