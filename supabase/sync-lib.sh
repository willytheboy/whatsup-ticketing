#!/usr/bin/env sh
# Copies the shared helper modules into every function folder (Supabase deploys one folder per function).
cd "$(dirname "$0")/functions" || exit 1
for f in create-order scan wallet pay payment-webhook wa-inbound; do cp _shared_lib.ts "$f/lib.ts"; done
for f in pay payment-webhook; do cp _shared_providers.ts "$f/providers.ts"; done
echo "lib synced"
