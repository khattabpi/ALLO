#!/usr/bin/env python3
"""
==============================================================================
Open Telecom Lab — Revenue & Charging REST API Daemon
==============================================================================
Provides high-fidelity 3GPP/BSS compliant charging REST endpoints on port 8085:
  - Account balance management (available, reserved, consumed)
  - Real-time rating quotes for domestic and roaming traffic
  - Double-entry immutable transaction journal
  - Financial reconciliation audit (zero-anomaly verification)
  - Health and telemetry metrics
==============================================================================
"""

import os
import sys
import json
import time
import uuid
import sqlite3
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from src.charging import (
    Database, RatingEngine, BalanceManager, ReconciliationEngine,
    UsageEvent, RatedEvent, Transaction, Account, Tariff
)

PORT = int(os.environ.get("CHARGING_PORT", 8085))
HOST = os.environ.get("CHARGING_HOST", "0.0.0.0")

db = Database()
rating_engine = RatingEngine(db)
balance_manager = BalanceManager(db)
reconcile_engine = ReconciliationEngine(db)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class ChargingApiHandler(BaseHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def reply_json(self, data, status=200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def reply_error(self, message, status=400):
        self.reply_json({"error": True, "message": message, "status": status}, status=status)

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 0:
                raw = self.rfile.read(length).decode("utf-8")
                return json.loads(raw)
        except Exception:
            pass
        return {}

    def do_GET(self):
        url_path = self.path.split("?")[0].rstrip("/")
        if not url_path:
            url_path = "/"

        if url_path == "/":
            self.reply_json({
                "service": "ALLO Charging Engine",
                "version": "1.0.0",
                "status": "UP",
                "endpoints": {
                    "health": "GET /health",
                    "accounts": "GET /v1/accounts",
                    "tariffs": "GET /v1/tariffs",
                    "reconciliation": "GET /v1/reconciliation",
                    "rating_quote": "POST /v1/rating/quote",
                    "charge_call": "POST /v1/charging/events",
                    "reserve": "POST /v1/charging/reserve",
                    "consume": "POST /v1/charging/consume",
                    "metrics": "GET /metrics"
                }
            })
        elif url_path == "/health":
            self.handle_health()
        elif url_path == "/v1/accounts":
            self.handle_get_accounts()
        elif url_path == "/v1/tariffs":
            self.handle_get_tariffs()
        elif url_path == "/v1/reconciliation":
            self.handle_reconciliation()
        elif url_path.startswith("/v1/accounts/"):
            parts = [p for p in url_path.split("/") if p]
            # parts: ['v1', 'accounts', 'acc-ue1', 'transactions'] -> len is 4
            if len(parts) == 4 and parts[3] == "balance":
                self.handle_get_account_balance(parts[2])
            elif len(parts) == 4 and parts[3] == "transactions":
                self.handle_get_account_transactions(parts[2])
            elif len(parts) == 3:
                self.handle_get_account_balance(parts[2])
            else:
                self.reply_error("Endpoint not found", 404)
        elif url_path == "/metrics":
            self.handle_metrics()
        else:
            self.reply_error("Endpoint not found", 404)

    def do_POST(self):
        url_path = self.path.split("?")[0].rstrip("/")

        if url_path == "/v1/rating/quote":
            self.handle_rating_quote()
        elif url_path in ["/v1/charging/events", "/v1/charging/call"]:
            self.handle_charge_call()
        elif url_path == "/v1/charging/reserve":
            self.handle_reserve()
        elif url_path == "/v1/charging/consume":
            self.handle_consume()
        elif url_path == "/v1/charging/refund":
            self.handle_refund()
        elif url_path.startswith("/v1/accounts/"):
            parts = [p for p in url_path.split("/") if p]
            if len(parts) == 4 and parts[3] in ["topup", "recharge"]:
                self.handle_topup(parts[2])
            else:
                self.reply_error("Endpoint not found", 404)
        else:
            self.reply_error("Endpoint not found", 404)

    # Handlers
    def handle_health(self):
        self.reply_json({
            "status": "UP",
            "service": "charging-erlang",
            "version": "1.0.0",
            "otp_release": "25",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })

    def handle_get_accounts(self):
        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("SELECT * FROM charging_accounts ORDER BY id ASC;")
            rows = [dict(r) for r in cur.fetchall()]

        accounts = []
        for r in rows:
            accounts.append({
                "account_id": r["id"],
                "name": r["name"],
                "imsi": r["imsi"],
                "msisdn": r.get("msisdn", ""),
                "sip_uri": r.get("sip_uri", ""),
                "plmn": r["plmn"],
                "serving_plmn": r.get("serving_plmn"),
                "rate_plan": r["rate_plan"],
                "balance_available": round(float(r["balance_available"]), 4),
                "balance_reserved": round(float(r["balance_reserved"]), 4),
                "balance_consumed": round(float(r["balance_consumed"]), 4),
                "currency": r.get("currency", "LAB"),
                "status": r.get("status", "ACTIVE"),
                "created_at": r.get("created_at", ""),
                "updated_at": r.get("updated_at", "")
            })
        self.reply_json({"accounts": accounts, "count": len(accounts)})

    def handle_get_account_balance(self, account_id):
        acc = balance_manager.get_account(account_id)
        if not acc:
            self.reply_error("Account not found", 404)
            return
        self.reply_json({
            "account_id": acc.id,
            "name": acc.name,
            "imsi": acc.imsi,
            "msisdn": acc.msisdn,
            "sip_uri": acc.sip_uri,
            "plmn": acc.plmn,
            "serving_plmn": acc.serving_plmn,
            "rate_plan": acc.rate_plan,
            "balance_available": round(acc.balance_available, 4),
            "balance_reserved": round(acc.balance_reserved, 4),
            "balance_consumed": round(acc.balance_consumed, 4),
            "currency": acc.currency,
            "status": acc.status
        })

    def handle_get_account_transactions(self, account_id):
        acc = balance_manager.get_account(account_id)
        if not acc:
            self.reply_error("Account not found", 404)
            return

        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("""
            SELECT * FROM charging_transactions 
            WHERE account_id = ? ORDER BY created_at DESC;
            """, (acc.id,))
            rows = [dict(r) for r in cur.fetchall()]

        txs = []
        for r in rows:
            txs.append({
                "transaction_id": r["id"],
                "account_id": r["account_id"],
                "transaction_type": r["transaction_type"],
                "amount": round(float(r["amount"]), 4),
                "balance_before": round(float(r["balance_before"]), 4),
                "balance_after": round(float(r["balance_after"]), 4),
                "reference_type": r.get("reference_type", ""),
                "reference_id": r.get("reference_id", ""),
                "description": r.get("description", ""),
                "created_at": r.get("created_at", "")
            })
        self.reply_json({"account_id": acc.id, "transactions": txs, "count": len(txs)})

    def handle_get_tariffs(self):
        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("SELECT * FROM tariffs ORDER BY id ASC;")
            rows = [dict(r) for r in cur.fetchall()]

        tariffs = []
        for r in rows:
            tariffs.append({
                "tariff_id": r["id"],
                "rate_plan_id": r["rate_plan_id"],
                "service_type": r["service_type"],
                "destination_type": r["destination_type"],
                "dnn": r.get("dnn", "any"),
                "setup_charge": round(float(r["setup_charge"]), 4),
                "unit_rate": round(float(r["unit_rate"]), 4),
                "unit_size": int(r["unit_size"]),
                "min_units": int(r["min_units"]),
                "granularity_units": int(r["granularity_units"]),
                "rounding_policy": r.get("rounding_policy", "CEIL")
            })
        self.reply_json({"tariffs": tariffs, "count": len(tariffs)})

    def handle_reconciliation(self):
        report = reconcile_engine.run_reconciliation()
        # Ensure parity with Erlang reconciliation format
        status = "PASS" if report.get("status") == "PASS" else "FAIL"
        anomalies = report.get("anomalies", [])
        self.reply_json({
            "status": status,
            "accounts_audited": report.get("accounts_audited", 0),
            "total_available": report.get("total_available_balance", 0.0),
            "total_reserved": report.get("total_reserved_balance", 0.0),
            "total_consumed": report.get("total_consumed_balance", 0.0),
            "total_topups": report.get("total_topup_credit", 0.0),
            "anomalies_count": len(anomalies),
            "anomalies": anomalies,
            "account_details": []
        })

    def handle_rating_quote(self):
        body = self.read_json_body()
        acc_id = body.get("account_id")
        if not acc_id:
            self.reply_error("Missing required field: account_id", 400)
            return

        account = balance_manager.get_account(acc_id)
        if not account:
            self.reply_error("Account not found", 404)
            return

        dest = body.get("destination", "domestic")
        service = body.get("service_type", "voice")
        dnn = body.get("dnn", "any")
        duration = float(body.get("duration", body.get("units", 60.0)))

        # Match tariff
        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("""
            SELECT * FROM tariffs 
            WHERE rate_plan_id = ? AND service_type = ? 
              AND (destination_type = ? OR destination_type = 'any')
              AND (dnn = ? OR dnn = 'any');
            """, (account.rate_plan, service, dest, dnn))
            row = cur.fetchone()

        if not row:
            self.reply_error("Tariff not found", 404)
            return

        t = dict(row)
        min_u = max(duration, float(t["min_units"]))
        gran = float(t["granularity_units"])
        import math
        billable = int(math.ceil(min_u / gran) * gran)
        usage_charge = round(billable * (float(t["unit_rate"]) / float(t["unit_size"])), 4)
        setup_charge = round(float(t["setup_charge"]), 4)
        total_charge = round(setup_charge + usage_charge, 4)

        self.reply_json({
            "account_id": account.id,
            "tariff_id": t["id"],
            "service_type": service,
            "destination_type": dest,
            "source_units": duration,
            "billable_units": billable,
            "setup_charge": setup_charge,
            "usage_charge": usage_charge,
            "total_charge": total_charge,
            "currency": "LAB",
            "explanation": f"Rated under {t['id']}: setup {setup_charge} + {billable} units @ {t['unit_rate']} = {total_charge} LAB"
        })

    def handle_topup(self, account_id):
        body = self.read_json_body()
        amount = float(body.get("amount", 0.0))
        description = body.get("description", "Manual Account Topup")
        if amount <= 0:
            self.reply_error("Invalid topup amount: must be positive number", 400)
            return

        ok, msg, tx = balance_manager.topup_account(account_id, amount, description)
        if not ok:
            self.reply_error(msg, 400)
            return

        acc = balance_manager.get_account(account_id)
        self.reply_json({
            "account_id": acc.id,
            "name": acc.name,
            "balance_available": round(acc.balance_available, 4),
            "balance_reserved": round(acc.balance_reserved, 4),
            "balance_consumed": round(acc.balance_consumed, 4),
            "transaction_id": tx.id if tx else ""
        })

    def handle_reserve(self):
        body = self.read_json_body()
        account_id = body.get("account_id")
        session_id = body.get("session_id")
        amount = float(body.get("estimated_amount", body.get("amount", 0.0)))
        service = body.get("service_type", "voice")

        if not account_id or not session_id or amount <= 0:
            self.reply_error("Missing account_id, session_id, or valid amount", 400)
            return

        ok, msg, res = balance_manager.reserve_balance(account_id, amount, session_id, service)
        if not ok:
            status = 402 if "Insufficient" in msg else 400
            self.reply_error(msg, status)
            return

        self.reply_json({
            "reservation_id": res.id,
            "account_id": res.account_id,
            "session_id": res.session_id,
            "reserved_amount": res.reserved_amount,
            "status": res.status
        })

    def handle_consume(self):
        body = self.read_json_body()
        account_id = body.get("account_id")
        session_id = body.get("session_id")
        actual_charge = float(body.get("actual_charge", body.get("amount", 0.0)))

        # Find reservation by session_id
        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("SELECT * FROM charging_reservations WHERE session_id = ? AND status = 'ACTIVE';", (session_id,))
            row = cur.fetchone()

        if not row:
            self.reply_error("Active reservation not found", 404)
            return

        res_id = row["id"]
        ok, msg, tx = balance_manager.consume_reservation(res_id, actual_charge, f"Call completed: {session_id}")
        if not ok:
            self.reply_error(msg, 400)
            return

        self.reply_json({
            "status": "CONSUMED",
            "session_id": session_id,
            "charged_amount": actual_charge,
            "transaction_id": tx.id if tx else ""
        })

    def handle_refund(self):
        body = self.read_json_body()
        session_id = body.get("session_id")

        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("SELECT * FROM charging_reservations WHERE session_id = ? AND status = 'ACTIVE';", (session_id,))
            row = cur.fetchone()

        if not row:
            self.reply_error("Active reservation not found", 404)
            return

        res_id = row["id"]
        ok, msg, tx = balance_manager.refund_reservation(res_id, f"Session aborted: {session_id}")
        if not ok:
            self.reply_error(msg, 400)
            return

        self.reply_json({"status": "RELEASED", "session_id": session_id})

    def handle_charge_call(self):
        body = self.read_json_body()
        account_id = body.get("account_id")
        duration = float(body.get("duration", body.get("duration_seconds", 10.0)))
        session_id = body.get("session_id", f"call-{uuid.uuid4().hex[:8]}")

        event = UsageEvent(
            id=session_id,
            source="api",
            service_type="voice",
            caller_id=account_id,
            duration_seconds=duration
        )
        rated = rating_engine.rate_event(event)
        ok, msg, tx = balance_manager.debit_account(rated.account_id, rated)
        if not ok:
            self.reply_error(msg, 402)
            return

        self.reply_json({
            "status": "CHARGED",
            "session_id": session_id,
            "account_id": rated.account_id,
            "charged_amount": rated.total_charge,
            "tariff_id": rated.tariff_id,
            "transaction_id": tx.id if tx else ""
        })

    def handle_metrics(self):
        with db.get_connection() as con:
            cur = con.cursor()
            cur.execute("SELECT SUM(balance_available) as a, SUM(balance_reserved) as r, SUM(balance_consumed) as c FROM charging_accounts;")
            row = cur.fetchone()
            cur.execute("SELECT COUNT(*) FROM charging_transactions;")
            tx_count = cur.fetchone()[0]

        a = round(float(row["a"] or 0), 4)
        r = round(float(row["r"] or 0), 4)
        c = round(float(row["c"] or 0), 4)

        metrics = f"""# HELP charging_revenue_total Total revenue charged to accounts
# TYPE charging_revenue_total counter
charging_revenue_total {c}
# HELP charging_balance_available Total available subscriber balance
# TYPE charging_balance_available gauge
charging_balance_available {a}
# HELP charging_balance_reserved Total reserved subscriber balance
# TYPE charging_balance_reserved gauge
charging_balance_reserved {r}
# HELP charging_transactions_total Total number of transactions
# TYPE charging_transactions_total counter
charging_transactions_total {tx_count}
"""
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(metrics.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(metrics.encode("utf-8"))


def run():
    server = ThreadedHTTPServer((HOST, PORT), ChargingApiHandler)
    print(f"[*] Telecom Charging REST API daemon running on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
