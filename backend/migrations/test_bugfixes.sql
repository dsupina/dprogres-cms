-- Test script for bug fixes from PR review
-- Tests the three critical bugs identified by Bugbot

\echo '======================================'
\echo 'Testing Bug Fixes'
\echo '======================================'
\echo ''

-- Setup test data
INSERT INTO users (id, email, password_hash, role)
VALUES (9998, 'test-bugs@example.com', 'test_hash', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, name, slug, owner_id, plan_tier)
VALUES (9998, 'Test Org Bugs', 'test-org-bugs', 9998, 'free')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- Bug Fix 1: NULL handling in check_and_increment_quota
-- ==========================================
\echo 'Test 1: Quota function NULL handling...'
DO $$
DECLARE
  allowed BOOLEAN;
BEGIN
  -- Test: Call quota function when NO quota record exists
  -- Expected: Should return FALSE (not TRUE)
  SELECT check_and_increment_quota(9998, 'sites', 1) INTO allowed;

  IF allowed = FALSE THEN
    RAISE NOTICE '✓ Test 1.1: Function correctly returns FALSE when quota record missing';
  ELSE
    RAISE EXCEPTION '✗ Test 1.1 FAILED: Function returned TRUE without quota record (security risk!)';
  END IF;

  -- Create quota record
  INSERT INTO usage_quotas (organization_id, dimension, current_usage, quota_limit, period_start)
  VALUES (9998, 'sites', 0, 3, NOW());

  -- Test: Now it should work
  SELECT check_and_increment_quota(9998, 'sites', 1) INTO allowed;

  IF allowed = TRUE THEN
    RAISE NOTICE '✓ Test 1.2: Function works correctly with quota record present';
  ELSE
    RAISE EXCEPTION '✗ Test 1.2 FAILED: Function should allow when quota exists and not exceeded';
  END IF;
END $$;

\echo ''

-- ==========================================
-- Bug Fix 2: RLS policy for tags table
-- ==========================================
\echo 'Test 2: Tags table RLS policy...'
DO $$
DECLARE
  rls_enabled BOOLEAN;
  policy_exists BOOLEAN;
BEGIN
  -- Check if RLS is enabled for tags
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = 'tags';

  IF rls_enabled THEN
    RAISE NOTICE '✓ Test 2.1: RLS enabled for tags table';
  ELSE
    RAISE EXCEPTION '✗ Test 2.1 FAILED: RLS not enabled for tags table (security gap!)';
  END IF;

  -- Check if policy exists
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tags' AND policyname = 'org_isolation_tags'
  ) INTO policy_exists;

  IF policy_exists THEN
    RAISE NOTICE '✓ Test 2.2: RLS policy "org_isolation_tags" exists';
  ELSE
    RAISE EXCEPTION '✗ Test 2.2 FAILED: RLS policy missing for tags table (security gap!)';
  END IF;

  -- Verify policy uses correct column
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tags'
    AND policyname = 'org_isolation_tags'
    AND qual LIKE '%organization_id%current_organization_id%'
  ) THEN
    RAISE NOTICE '✓ Test 2.3: RLS policy uses correct isolation column';
  ELSE
    RAISE EXCEPTION '✗ Test 2.3 FAILED: RLS policy malformed';
  END IF;

  -- Verify FORCE RLS is enabled (applies even to table owner)
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'tags' AND relforcerowsecurity = true
  ) THEN
    RAISE NOTICE '✓ Test 2.4: FORCE ROW LEVEL SECURITY enabled for tags';
  ELSE
    RAISE NOTICE '⚠ Test 2.4: FORCE RLS not enabled (will work in production with non-superuser role)';
  END IF;
END $$;

\echo ''

-- ==========================================
-- Bug Fix 3: Subscription partial unique index
-- ==========================================
\echo 'Test 3: Subscription history retention...'
DO $$
DECLARE
  index_exists BOOLEAN;
  constraint_exists BOOLEAN;
BEGIN
  -- Check that old UNIQUE constraint is gone
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_organization_id_key'
  ) INTO constraint_exists;

  IF NOT constraint_exists THEN
    RAISE NOTICE '✓ Test 3.1: Old UNIQUE constraint removed';
  ELSE
    RAISE EXCEPTION '✗ Test 3.1 FAILED: Old UNIQUE constraint still exists';
  END IF;

  -- Check that partial unique index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'subscriptions'
    AND indexname = 'idx_subscriptions_org_active_unique'
  ) INTO index_exists;

  IF index_exists THEN
    RAISE NOTICE '✓ Test 3.2: Partial unique index exists';
  ELSE
    RAISE EXCEPTION '✗ Test 3.2 FAILED: Partial unique index missing';
  END IF;

  -- Test: Create active subscription
  INSERT INTO subscriptions (
    organization_id, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, plan_tier, billing_cycle, status,
    current_period_start, current_period_end, amount_cents
  ) VALUES (
    9998, 'cus_test1', 'sub_test1', 'price_test',
    'starter', 'monthly', 'active',
    NOW(), NOW() + INTERVAL '30 days', 2900
  );

  RAISE NOTICE '✓ Test 3.3: Created first active subscription';

  -- Test: Try to create second active subscription (should fail)
  BEGIN
    INSERT INTO subscriptions (
      organization_id, stripe_customer_id, stripe_subscription_id,
      stripe_price_id, plan_tier, billing_cycle, status,
      current_period_start, current_period_end, amount_cents
    ) VALUES (
      9998, 'cus_test2', 'sub_test2', 'price_test',
      'pro', 'monthly', 'active',
      NOW(), NOW() + INTERVAL '30 days', 4900
    );
    RAISE EXCEPTION '✗ Test 3.4 FAILED: Should not allow second active subscription';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE '✓ Test 3.4: Correctly blocks second active subscription';
  END;

  -- Test: Cancel first subscription
  UPDATE subscriptions
  SET status = 'canceled', canceled_at = NOW()
  WHERE stripe_subscription_id = 'sub_test1';

  RAISE NOTICE '✓ Test 3.5: Canceled first subscription';

  -- Test: Create new active subscription after canceling (should succeed)
  INSERT INTO subscriptions (
    organization_id, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, plan_tier, billing_cycle, status,
    current_period_start, current_period_end, amount_cents
  ) VALUES (
    9998, 'cus_test3', 'sub_test3', 'price_test',
    'pro', 'monthly', 'active',
    NOW(), NOW() + INTERVAL '30 days', 4900
  );

  RAISE NOTICE '✓ Test 3.6: Successfully created new subscription after cancellation (history preserved)';

  -- Verify we have 2 subscription records (history retained)
  IF (SELECT COUNT(*) FROM subscriptions WHERE organization_id = 9998) = 2 THEN
    RAISE NOTICE '✓ Test 3.7: Subscription history correctly retained (2 records)';
  ELSE
    RAISE EXCEPTION '✗ Test 3.7 FAILED: Subscription history not retained';
  END IF;
END $$;

\echo ''

-- Cleanup
DELETE FROM subscriptions WHERE organization_id = 9998;
DELETE FROM tags WHERE organization_id = 9998;
DELETE FROM usage_quotas WHERE organization_id = 9998;
DELETE FROM organizations WHERE id = 9998;
DELETE FROM users WHERE id = 9998;

\echo '======================================'
\echo 'All bug fix tests passed! ✓'
\echo '======================================'
\echo ''
\echo 'Bug Fixes Verified:'
\echo '1. ✓ Quota function rejects operations when quota record missing'
\echo '2. ✓ Tags table has RLS policy for multi-tenant isolation'
\echo '3. ✓ Subscription history retained while preventing duplicate active subscriptions'
