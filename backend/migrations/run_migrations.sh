#!/bin/bash
# Script to run all SaaS Foundation migrations (SF-001)
# Usage: ./run_migrations.sh [database_url]

set -e  # Exit on error

# Database URL from environment or argument
DATABASE_URL=${1:-${DATABASE_URL:-"postgresql://postgres:password@localhost:5432/cms_db"}}

echo "======================================"
echo "Running EPIC-003 SF-001 Migrations"
echo "Database: $DATABASE_URL"
echo "======================================"
echo ""

# Extract connection parameters
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\).*/\1/p')

# Migration files in order
migrations=(
  "001_create_organizations.sql"
  "002_create_subscriptions.sql"
  "003_create_usage_quotas.sql"
  "004_create_organization_members.sql"
  "005_add_organization_id_to_content.sql"
  "006_add_soft_delete_to_organizations.sql"
  "007_add_soft_delete_to_organization_members.sql"
  "008_fix_organization_members_unique_constraint.sql"
  "009_fix_organization_invites_unique_constraint.sql"
  "010_add_timezone_to_organizations.sql"
  "011_create_system_settings.sql"
  "012_enhance_reset_monthly_quotas_with_timezone.sql"
)

# Run each migration
for migration in "${migrations[@]}"; do
  echo "Running migration: $migration"

  PGPASSWORD="${PGPASSWORD:-password}" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$migration" \
    -v ON_ERROR_STOP=1

  if [ $? -eq 0 ]; then
    echo "✓ $migration completed successfully"
  else
    echo "✗ $migration failed"
    exit 1
  fi
  echo ""
done

echo "======================================"
echo "All migrations completed successfully!"
echo "======================================"
echo ""

# Verify tables created
echo "Verifying tables..."
PGPASSWORD="${PGPASSWORD:-password}" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" \
  -t

echo ""
echo "Migration summary:"
echo "- organizations: Multi-tenant workspaces (with timezone support for SF-011)"
echo "- subscriptions: Stripe subscription tracking"
echo "- invoices: Billing history"
echo "- payment_methods: Customer payment cards"
echo "- subscription_events: Webhook audit log"
echo "- usage_quotas: Quota tracking per dimension"
echo "- organization_members: Team members with roles (with soft delete)"
echo "- organization_invites: Pending invitations"
echo "- system_settings: Global configuration key-value store (SF-011)"
echo ""
echo "Functions created:"
echo "- check_and_increment_quota(): Atomic quota checking"
echo "- reset_monthly_quotas(): Reset API call quotas (backward-compatible wrapper)"
echo "- reset_monthly_quotas_with_timezone(): Per-org timezone quota reset (SF-011)"
echo "- user_has_permission(): RBAC permission checking"
echo "- get_system_setting(): Get system setting value by key (SF-011)"
echo "- set_system_setting(): Set system setting value by key (SF-011)"
