-- Migration: 012_enhance_reset_monthly_quotas_with_timezone.sql
-- Epic: EPIC-003 SaaS Foundation (SF-011)
-- Purpose: Enhance reset_monthly_quotas() function to support per-organization timezone
-- Created: 2025-01-25

-- Drop existing function
DROP FUNCTION IF EXISTS reset_monthly_quotas();

-- Enhanced function with per-organization timezone support
CREATE OR REPLACE FUNCTION reset_monthly_quotas_with_timezone() RETURNS TABLE(
  organization_id INTEGER,
  organization_name VARCHAR(255),
  timezone VARCHAR(100),
  rows_updated INTEGER
) AS $$
DECLARE
  total_rows_updated INTEGER := 0;
  org_record RECORD;
  org_rows_updated INTEGER;
BEGIN
  -- Iterate through each organization
  FOR org_record IN
    SELECT o.id, o.name, o.timezone
    FROM organizations o
    WHERE o.deleted_at IS NULL  -- Exclude soft-deleted organizations
  LOOP
    -- Reset quotas for organizations where period_end has passed in their timezone
    UPDATE usage_quotas uq
    SET current_usage = 0,
        last_reset_at = NOW(),
        period_start = NOW() AT TIME ZONE org_record.timezone,
        period_end = (NOW() AT TIME ZONE org_record.timezone) + INTERVAL '1 month',
        updated_at = NOW()
    WHERE uq.organization_id = org_record.id
      AND uq.dimension = 'api_calls'
      AND uq.period_end IS NOT NULL
      AND uq.period_end < (NOW() AT TIME ZONE org_record.timezone);

    GET DIAGNOSTICS org_rows_updated = ROW_COUNT;

    -- Only return organizations that had quotas reset
    IF org_rows_updated > 0 THEN
      total_rows_updated := total_rows_updated + org_rows_updated;
      organization_id := org_record.id;
      organization_name := org_record.name;
      timezone := org_record.timezone;
      rows_updated := org_rows_updated;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Keep backward-compatible function (returns total count)
CREATE OR REPLACE FUNCTION reset_monthly_quotas() RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER := 0;
  result_row RECORD;
BEGIN
  FOR result_row IN SELECT * FROM reset_monthly_quotas_with_timezone() LOOP
    total_count := total_count + result_row.rows_updated;
  END LOOP;

  RETURN total_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION reset_monthly_quotas_with_timezone IS 'Reset monthly API call quotas per organization using their configured timezone. Returns detailed results.';
COMMENT ON FUNCTION reset_monthly_quotas IS 'Reset monthly API call quotas (backward-compatible wrapper). Returns total count.';

-- Example usage:
-- SELECT * FROM reset_monthly_quotas_with_timezone();  -- Get detailed results per org
-- SELECT reset_monthly_quotas();                        -- Get total count only

-- DOWN Migration (if needed)
-- DROP FUNCTION IF EXISTS reset_monthly_quotas_with_timezone();
-- DROP FUNCTION IF EXISTS reset_monthly_quotas();
-- (Then restore original function from 003_create_usage_quotas.sql)
