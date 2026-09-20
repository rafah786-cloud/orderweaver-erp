#!/usr/bin/env bash
set -euo pipefail
rg -n "from\(['\"](vouchers|voucher_entries|voucher_number_series)['\"]\).*\.(insert|update|delete|upsert)|nextVoucherNumber" src --glob '!src/integrations/supabase/types.ts' || true
