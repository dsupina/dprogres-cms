-- Migration: 010_add_stripe_cancel_pending
-- SF-016: Subscription Lifecycle Management - P1 Fix
--
-- Adds stripe_cancel_pending column to track subscriptions where
-- Stripe cancellation failed and needs to be retried

-- UP
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS stripe_cancel_pending BOOLEAN DEFAULT false;

-- Add index for efficient lookup of pending cancellations
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cancel_pending
ON subscriptions(stripe_cancel_pending)
WHERE stripe_cancel_pending = true;

-- DOWN (for rollback)
-- DROP INDEX IF EXISTS idx_subscriptions_stripe_cancel_pending;
-- ALTER TABLE subscriptions DROP COLUMN IF EXISTS stripe_cancel_pending;
