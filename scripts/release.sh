#!/usr/bin/env bash
# Release step — runs on every deploy BEFORE the new version serves traffic.
# Applies pending migrations and (re)installs RLS policies + grants as the OWNER role.
# Both steps are idempotent, so re-running on every deploy is safe.
#
# Requires MIGRATE_DATABASE_URL (the flowdesk_migrator / owner connection string).
# The app's own DATABASE_URL (flowdesk_app, RLS-enforced) is left untouched.
set -euo pipefail

: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL (owner-role connection) is required for the release step}"

echo "→ Applying database migrations (owner role)…"
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm exec prisma migrate deploy

echo "→ Installing RLS policies + grants (ADR-1, ADR-8)…"
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm exec tsx prisma/apply-rls.ts

echo "✓ Release complete: migrations applied, RLS enforced."
