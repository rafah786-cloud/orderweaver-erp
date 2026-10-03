"""Reference checks for the Phase 3 stock rules.

These mirror 001_inventory_ledger.sql. This sandbox has no PostgreSQL, so the
SQL file is not executed here. Run that file on a disposable database before
any screen uses it.
"""

from decimal import Decimal, ROUND_HALF_UP


def money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rate(value):
    return Decimal(value).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


class Ledger:
    def __init__(self):
        self.docs = {}
        self.balances = {}
        self.reservations = {}
        self.items = {}

    def add_item(self, sku, allow_negative=False):
        self.items[sku] = {"allow_negative": allow_negative}
        return sku

    def _bal(self, key):
        return self.balances.setdefault(key, {"qty": Decimal("0"), "value": Decimal("0")})

    def available(self, key):
        reserved = sum(r["qty"] for r in self.reservations.values() if r["key"] == key and r["status"] == "open")
        return self._bal(key)["qty"] - reserved

    def receipt(self, key, qty, unit_rate, idem):
        if idem in self.docs:
            return self.docs[idem]
        qty, unit_rate = Decimal(qty), Decimal(unit_rate)
        amount = money(qty * unit_rate)
        if amount == 0:
            raise ValueError("zero-value receipt rejected")
        bal = self._bal(key)
        bal["qty"] += qty
        bal["value"] += amount
        self.docs[idem] = {"type": "receipt", "amount": amount, "key": key, "qty": qty}
        return self.docs[idem]

    def issue(self, key, qty, idem, sku):
        if idem in self.docs:
            return self.docs[idem]
        qty = Decimal(qty)
        bal = self._bal(key)
        if not self.items[sku]["allow_negative"] and self.available(key) < qty:
            raise ValueError("negative stock blocked")
        if bal["qty"] == 0:
            raise ValueError("cannot value an issue from a zero balance")
        avg = rate(bal["value"] / bal["qty"])
        amount = money(qty * avg)
        if amount == 0:
            raise ValueError("zero-value issue rejected")
        bal["qty"] -= qty
        bal["value"] -= amount
        self.docs[idem] = {"type": "issue", "amount": amount, "rate": avg, "key": key, "qty": qty}
        return self.docs[idem]

    def reserve(self, key, qty, idem):
        if idem in self.reservations:
            return self.reservations[idem]
        qty = Decimal(qty)
        if self.available(key) < qty:
            raise ValueError("insufficient available stock to reserve")
        self.reservations[idem] = {"key": key, "qty": qty, "status": "open"}
        return self.reservations[idem]

    def production(self, components, fg_key, fg_qty, idem):
        if idem in self.docs:
            return self.docs[idem]
        total = Decimal("0")
        for key, need in components:
            posted = self.issue(key, need, f"{idem}:{key}", key[0])
            total += posted["amount"]
        fg_qty = Decimal(fg_qty)
        bal = self._bal(fg_key)
        bal["qty"] += fg_qty
        bal["value"] += total
        self.docs[idem] = {"type": "production", "amount": total, "rate": rate(total / fg_qty)}
        return self.docs[idem]


def run():
    checks = []

    def check(name, condition):
        checks.append((name, "PASS" if condition else "FAIL"))

    books = Ledger()
    foam = books.add_item("FOAM")
    fabric = books.add_item("FABRIC")
    mattress = books.add_item("MATTRESS")
    store = "MAIN"
    books.receipt((foam, store), "100", "20", "rcpt-foam")
    books.receipt((foam, store), "50", "26", "rcpt-foam-2")
    check("weighted_average_rate", books._bal((foam, store))["value"] / books._bal((foam, store))["qty"] == Decimal("22"))
    books.reserve((foam, store), "40", "so-1")
    check("reservation_reduces_available_only", books.available((foam, store)) == Decimal("110") and books._bal((foam, store))["qty"] == Decimal("150"))
    blocked = False
    try:
        books.issue((foam, store), "120", "too-much", foam)
    except ValueError:
        blocked = True
    check("negative_stock_blocked", blocked)
    issued = books.issue((foam, store), "10", "dispatch-1", foam)
    check("issue_uses_average", issued["rate"] == Decimal("22.000000") and issued["amount"] == Decimal("220.00"))
    again = books.issue((foam, store), "10", "dispatch-1", foam)
    check("idempotent_issue", again is issued)
    books.receipt((fabric, store), "80", "15", "rcpt-fabric")
    made = books.production([((foam, store), "4"), ((fabric, store), "2")], (mattress, store), "2", "prd-1")
    check("production_fg_at_component_cost", made["amount"] == Decimal("118.00") and books._bal((mattress, store))["value"] == Decimal("118.00"))
    check("production_consumes_components", books._bal((foam, store))["qty"] == Decimal("136"))
    failed = [name for name, status in checks if status != "PASS"]
    for name, status in checks:
        print(f"{status} {name}")
    print(f"{len(checks) - len(failed)} PASS, {len(failed)} FAIL")
    return not failed


if __name__ == "__main__":
    raise SystemExit(0 if run() else 1)
