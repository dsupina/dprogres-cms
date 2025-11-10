-- Migration: Distribution infrastructure for publishing targets and schedules
-- Description: Introduces publishing targets, scheduling, and distribution logs to support multi-channel delivery

CREATE TABLE IF NOT EXISTS publishing_targets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    credentials JSONB DEFAULT '{}'::jsonb,
    default_payload JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rate_limit_per_hour INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, channel)
);

CREATE INDEX IF NOT EXISTS idx_publishing_targets_channel
    ON publishing_targets(channel);

CREATE TABLE IF NOT EXISTS publishing_schedules (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES publishing_targets(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'cancelled', 'retrying')),
    options JSONB DEFAULT '{}'::jsonb,
    dispatch_payload JSONB,
    dispatched_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, target_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_publishing_schedules_status
    ON publishing_schedules(status);

CREATE INDEX IF NOT EXISTS idx_publishing_schedules_scheduled_for
    ON publishing_schedules(scheduled_for);

CREATE TABLE IF NOT EXISTS distribution_logs (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES publishing_schedules(id) ON DELETE SET NULL,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES publishing_targets(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'retrying', 'cancelled')),
    payload JSONB,
    response JSONB,
    error TEXT,
    feedback JSONB DEFAULT '{}'::jsonb,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    alert_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distribution_logs_status
    ON distribution_logs(status);

CREATE INDEX IF NOT EXISTS idx_distribution_logs_target
    ON distribution_logs(target_id);

CREATE INDEX IF NOT EXISTS idx_distribution_logs_created_at
    ON distribution_logs(created_at DESC);
