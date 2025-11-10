import { query } from '../utils/database';

export type DistributionStatus = 'queued' | 'sent' | 'failed' | 'retrying' | 'cancelled';
export type ScheduleStatus = 'pending' | 'queued' | 'sent' | 'failed' | 'cancelled' | 'retrying';

export interface PublishingTarget {
  id: number;
  name: string;
  channel: string;
  credentials: Record<string, any>;
  default_payload: Record<string, any>;
  is_active: boolean;
  rate_limit_per_hour: number | null;
  created_at: string;
  updated_at: string;
}

export interface PublishingSchedule {
  id: number;
  post_id: number;
  target_id: number;
  scheduled_for: string;
  status: ScheduleStatus;
  options: Record<string, any> | null;
  dispatch_payload: Record<string, any> | null;
  dispatched_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  post_title?: string;
  target_name?: string;
  target_channel?: string;
}

export interface DistributionLog {
  id: number;
  schedule_id: number | null;
  post_id: number;
  target_id: number;
  status: DistributionStatus;
  payload: Record<string, any> | null;
  response: Record<string, any> | null;
  error: string | null;
  feedback: Record<string, any> | null;
  retry_count: number;
  next_retry_at: string | null;
  alert_sent: boolean;
  created_at: string;
  updated_at: string;
  post_title?: string;
  target_name?: string;
  target_channel?: string;
}

export interface DistributionMetrics {
  channelPerformance: Array<{
    channel: string;
    sent: number;
    failed: number;
    queued: number;
    retrying: number;
  }>;
  upcomingSchedules: PublishingSchedule[];
  recentDeliveries: DistributionLog[];
  alerts: DistributionLog[];
}

const TARGET_FIELDS = [
  'id',
  'name',
  'channel',
  'credentials',
  'default_payload',
  'is_active',
  'rate_limit_per_hour',
  'created_at',
  'updated_at'
].join(', ');

const SCHEDULE_FIELDS = [
  's.id',
  's.post_id',
  's.target_id',
  "(s.scheduled_for AT TIME ZONE 'UTC') as scheduled_for_utc",
  's.status',
  's.options',
  's.dispatch_payload',
  "(s.dispatched_at AT TIME ZONE 'UTC') as dispatched_at_utc",
  's.last_error',
  's.created_at',
  's.updated_at',
  'p.title as post_title',
  't.name as target_name',
  't.channel as target_channel'
].join(', ');

const LOG_FIELDS = [
  'l.id',
  'l.schedule_id',
  'l.post_id',
  'l.target_id',
  'l.status',
  'l.payload',
  'l.response',
  'l.error',
  'l.feedback',
  'l.retry_count',
  'l.next_retry_at',
  'l.alert_sent',
  'l.created_at',
  'l.updated_at',
  'p.title as post_title',
  't.name as target_name',
  't.channel as target_channel'
].join(', ');

function mapTargetRow(row: any): PublishingTarget {
  return {
    id: Number(row.id),
    name: row.name,
    channel: row.channel,
    credentials: row.credentials || {},
    default_payload: row.default_payload || {},
    is_active: row.is_active,
    rate_limit_per_hour: row.rate_limit_per_hour !== null ? Number(row.rate_limit_per_hour) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapScheduleRow(row: any): PublishingSchedule {
  const scheduledForRaw = row.scheduled_for_utc ?? row.scheduled_for;
  const dispatchedAtRaw = row.dispatched_at_utc ?? row.dispatched_at;
  const scheduledForValue =
    scheduledForRaw instanceof Date
      ? scheduledForRaw.toISOString()
      : scheduledForRaw
      ? String(scheduledForRaw)
      : new Date().toISOString();
  const dispatchedAtValue =
    dispatchedAtRaw instanceof Date
      ? dispatchedAtRaw.toISOString()
      : dispatchedAtRaw
      ? String(dispatchedAtRaw)
      : null;

  return {
    id: Number(row.id),
    post_id: Number(row.post_id),
    target_id: Number(row.target_id),
    scheduled_for: scheduledForValue,
    status: row.status,
    options: row.options || null,
    dispatch_payload: row.dispatch_payload || null,
    dispatched_at: dispatchedAtValue,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_title: row.post_title,
    target_name: row.target_name,
    target_channel: row.target_channel,
  };
}

function mapLogRow(row: any): DistributionLog {
  return {
    id: Number(row.id),
    schedule_id: row.schedule_id !== null ? Number(row.schedule_id) : null,
    post_id: Number(row.post_id),
    target_id: Number(row.target_id),
    status: row.status,
    payload: row.payload || null,
    response: row.response || null,
    error: row.error || null,
    feedback: row.feedback || null,
    retry_count: Number(row.retry_count || 0),
    next_retry_at: row.next_retry_at,
    alert_sent: row.alert_sent,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_title: row.post_title,
    target_name: row.target_name,
    target_channel: row.target_channel,
  };
}

export async function listPublishingTargets(): Promise<PublishingTarget[]> {
  const result = await query(`SELECT ${TARGET_FIELDS} FROM publishing_targets ORDER BY name ASC`);
  return result.rows.map(mapTargetRow);
}

export async function getPublishingTargetById(id: number): Promise<PublishingTarget | null> {
  const result = await query(`SELECT ${TARGET_FIELDS} FROM publishing_targets WHERE id = $1`, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapTargetRow(result.rows[0]);
}

export interface CreatePublishingTargetInput {
  name: string;
  channel: string;
  credentials?: Record<string, any>;
  default_payload?: Record<string, any>;
  is_active?: boolean;
  rate_limit_per_hour?: number | null;
}

export async function createPublishingTarget(input: CreatePublishingTargetInput): Promise<PublishingTarget> {
  const result = await query(
    `INSERT INTO publishing_targets (name, channel, credentials, default_payload, is_active, rate_limit_per_hour)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
     RETURNING ${TARGET_FIELDS}`,
    [
      input.name,
      input.channel,
      JSON.stringify(input.credentials || {}),
      JSON.stringify(input.default_payload || {}),
      input.is_active !== false,
      input.rate_limit_per_hour ?? null,
    ]
  );

  return mapTargetRow(result.rows[0]);
}

export interface UpdatePublishingTargetInput {
  name?: string;
  channel?: string;
  credentials?: Record<string, any>;
  default_payload?: Record<string, any>;
  is_active?: boolean;
  rate_limit_per_hour?: number | null;
}

export async function updatePublishingTarget(id: number, input: UpdatePublishingTargetInput): Promise<PublishingTarget | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    fields.push(`name = $${fields.length + 1}`);
    values.push(input.name);
  }
  if (input.channel !== undefined) {
    fields.push(`channel = $${fields.length + 1}`);
    values.push(input.channel);
  }
  if (input.credentials !== undefined) {
    fields.push(`credentials = $${fields.length + 1}::jsonb`);
    values.push(JSON.stringify(input.credentials));
  }
  if (input.default_payload !== undefined) {
    fields.push(`default_payload = $${fields.length + 1}::jsonb`);
    values.push(JSON.stringify(input.default_payload));
  }
  if (input.is_active !== undefined) {
    fields.push(`is_active = $${fields.length + 1}`);
    values.push(input.is_active);
  }
  if (input.rate_limit_per_hour !== undefined) {
    fields.push(`rate_limit_per_hour = $${fields.length + 1}`);
    values.push(input.rate_limit_per_hour);
  }

  if (fields.length === 0) {
    const current = await getPublishingTargetById(id);
    return current;
  }

  fields.push(`updated_at = NOW()`);

  const result = await query(
    `UPDATE publishing_targets SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING ${TARGET_FIELDS}`,
    [...values, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapTargetRow(result.rows[0]);
}

export async function deletePublishingTarget(id: number): Promise<boolean> {
  const result = await query('DELETE FROM publishing_targets WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export interface ListScheduleFilters {
  postId?: number;
  status?: ScheduleStatus;
  limit?: number;
}

export async function listPublishingSchedules(filters: ListScheduleFilters = {}): Promise<PublishingSchedule[]> {
  const conditions: string[] = [];
  const values: any[] = [];

  if (filters.postId) {
    conditions.push(`s.post_id = $${values.length + 1}`);
    values.push(filters.postId);
  }

  if (filters.status) {
    conditions.push(`s.status = $${values.length + 1}`);
    values.push(filters.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = filters.limit ? `LIMIT ${filters.limit}` : '';

  const result = await query(
    `SELECT ${SCHEDULE_FIELDS}
     FROM publishing_schedules s
     JOIN posts p ON p.id = s.post_id
     JOIN publishing_targets t ON t.id = s.target_id
     ${where}
     ORDER BY s.scheduled_for ASC
     ${limitClause}`,
    values
  );

  return result.rows.map(mapScheduleRow);
}

export async function getPublishingScheduleById(id: number): Promise<PublishingSchedule | null> {
  const result = await query(
    `SELECT ${SCHEDULE_FIELDS}
     FROM publishing_schedules s
     JOIN posts p ON p.id = s.post_id
     JOIN publishing_targets t ON t.id = s.target_id
     WHERE s.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapScheduleRow(result.rows[0]);
}

export interface CreatePublishingScheduleInput {
  post_id: number;
  target_id: number;
  scheduled_for: Date;
  status?: ScheduleStatus;
  options?: Record<string, any>;
  dispatch_payload?: Record<string, any> | null;
}

export async function createPublishingSchedule(input: CreatePublishingScheduleInput): Promise<PublishingSchedule> {
  const result = await query(
    `INSERT INTO publishing_schedules (post_id, target_id, scheduled_for, status, options, dispatch_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id`,
    [
      input.post_id,
      input.target_id,
      input.scheduled_for,
      input.status || 'pending',
      JSON.stringify(input.options || {}),
      input.dispatch_payload ? JSON.stringify(input.dispatch_payload) : null,
    ]
  );

  const scheduleId = Number(result.rows[0].id);
  return (await getPublishingScheduleById(scheduleId))!;
}

export interface UpdateScheduleStatusInput {
  status?: ScheduleStatus;
  last_error?: string | null;
  dispatched_at?: Date | null;
  dispatch_payload?: Record<string, any> | null;
  scheduled_for?: Date;
  options?: Record<string, any>;
}

export async function updatePublishingScheduleStatus(id: number, updates: UpdateScheduleStatusInput): Promise<PublishingSchedule | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status) {
    fields.push(`status = $${fields.length + 1}`);
    values.push(updates.status);
  }
  if (updates.last_error !== undefined) {
    fields.push(`last_error = $${fields.length + 1}`);
    values.push(updates.last_error);
  }
  if (updates.dispatched_at !== undefined) {
    fields.push(`dispatched_at = $${fields.length + 1}`);
    values.push(updates.dispatched_at);
  }
  if (updates.dispatch_payload !== undefined) {
    fields.push(`dispatch_payload = $${fields.length + 1}::jsonb`);
    values.push(updates.dispatch_payload ? JSON.stringify(updates.dispatch_payload) : null);
  }
  if (updates.scheduled_for) {
    fields.push(`scheduled_for = $${fields.length + 1}`);
    values.push(updates.scheduled_for);
  }
  if (updates.options) {
    fields.push(`options = $${fields.length + 1}::jsonb`);
    values.push(JSON.stringify(updates.options));
  }

  if (fields.length === 0) {
    return getPublishingScheduleById(id);
  }

  fields.push('updated_at = NOW()');

  const result = await query(
    `UPDATE publishing_schedules SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id`,
    [...values, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return (await getPublishingScheduleById(Number(result.rows[0].id)))!;
}

export async function removePublishingSchedule(id: number): Promise<boolean> {
  const result = await query('DELETE FROM publishing_schedules WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export interface CreateDistributionLogInput {
  schedule_id?: number | null;
  post_id: number;
  target_id: number;
  status: DistributionStatus;
  payload?: Record<string, any> | null;
  response?: Record<string, any> | null;
  error?: string | null;
  feedback?: Record<string, any> | null;
}

export async function createDistributionLog(input: CreateDistributionLogInput): Promise<DistributionLog> {
  const result = await query(
    `INSERT INTO distribution_logs (schedule_id, post_id, target_id, status, payload, response, error, feedback)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb)
     RETURNING id`,
    [
      input.schedule_id ?? null,
      input.post_id,
      input.target_id,
      input.status,
      input.payload ? JSON.stringify(input.payload) : null,
      input.response ? JSON.stringify(input.response) : null,
      input.error ?? null,
      input.feedback ? JSON.stringify(input.feedback) : '{}',
    ]
  );

  return (await getDistributionLogById(Number(result.rows[0].id)))!;
}

export async function getDistributionLogById(id: number): Promise<DistributionLog | null> {
  const result = await query(
    `SELECT ${LOG_FIELDS}
     FROM distribution_logs l
     JOIN posts p ON p.id = l.post_id
     JOIN publishing_targets t ON t.id = l.target_id
     WHERE l.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapLogRow(result.rows[0]);
}

export interface UpdateDistributionLogInput {
  status?: DistributionStatus;
  payload?: Record<string, any> | null;
  response?: Record<string, any> | null;
  error?: string | null;
  feedback?: Record<string, any> | null;
  schedule_id?: number | null;
  retry_count?: number;
  next_retry_at?: Date | null;
  alert_sent?: boolean;
}

export async function updateDistributionLog(id: number, updates: UpdateDistributionLogInput): Promise<DistributionLog | null> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status) {
    fields.push(`status = $${fields.length + 1}`);
    values.push(updates.status);
  }
  if (updates.payload !== undefined) {
    fields.push(`payload = $${fields.length + 1}::jsonb`);
    values.push(updates.payload ? JSON.stringify(updates.payload) : null);
  }
  if (updates.response !== undefined) {
    fields.push(`response = $${fields.length + 1}::jsonb`);
    values.push(updates.response ? JSON.stringify(updates.response) : null);
  }
  if (updates.error !== undefined) {
    fields.push(`error = $${fields.length + 1}`);
    values.push(updates.error);
  }
  if (updates.feedback !== undefined) {
    fields.push(`feedback = $${fields.length + 1}::jsonb`);
    values.push(updates.feedback ? JSON.stringify(updates.feedback) : '{}');
  }
  if (updates.schedule_id !== undefined) {
    fields.push(`schedule_id = $${fields.length + 1}`);
    values.push(updates.schedule_id);
  }
  if (updates.retry_count !== undefined) {
    fields.push(`retry_count = $${fields.length + 1}`);
    values.push(updates.retry_count);
  }
  if (updates.next_retry_at !== undefined) {
    fields.push(`next_retry_at = $${fields.length + 1}`);
    values.push(updates.next_retry_at);
  }
  if (updates.alert_sent !== undefined) {
    fields.push(`alert_sent = $${fields.length + 1}`);
    values.push(updates.alert_sent);
  }

  if (fields.length === 0) {
    return getDistributionLogById(id);
  }

  fields.push('updated_at = NOW()');

  const result = await query(
    `UPDATE distribution_logs SET ${fields.join(', ')} WHERE id = $${fields.length + 1} RETURNING id`,
    [...values, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return (await getDistributionLogById(Number(result.rows[0].id)))!;
}

export async function listDistributionLogs(limit = 50): Promise<DistributionLog[]> {
  const result = await query(
    `SELECT ${LOG_FIELDS}
     FROM distribution_logs l
     JOIN posts p ON p.id = l.post_id
     JOIN publishing_targets t ON t.id = l.target_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapLogRow);
}

export async function getDistributionQueue(limit = 50): Promise<DistributionLog[]> {
  const result = await query(
    `SELECT ${LOG_FIELDS}
     FROM distribution_logs l
     JOIN posts p ON p.id = l.post_id
     JOIN publishing_targets t ON t.id = l.target_id
     WHERE l.status IN ('failed', 'retrying', 'queued')
        OR (l.next_retry_at IS NOT NULL AND l.next_retry_at <= NOW())
     ORDER BY l.updated_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapLogRow);
}

export async function recordDistributionFeedback(id: number, feedback: Record<string, any>): Promise<DistributionLog | null> {
  return updateDistributionLog(id, {
    feedback,
    alert_sent: true,
  });
}

export async function markLogForRetry(id: number, nextRetryAt?: Date): Promise<DistributionLog | null> {
  const existing = await getDistributionLogById(id);
  if (!existing) {
    return null;
  }

  const targetScheduleAt = nextRetryAt ?? new Date(Date.now() + 5 * 60 * 1000);

  let scheduleId = existing.schedule_id;

  if (!scheduleId) {
    const newSchedule = await createPublishingSchedule({
      post_id: existing.post_id,
      target_id: existing.target_id,
      scheduled_for: targetScheduleAt,
      status: 'retrying',
      options: existing.feedback || {},
    });
    scheduleId = newSchedule.id;
    await updateDistributionLog(id, { schedule_id: scheduleId });
  } else {
    await updatePublishingScheduleStatus(scheduleId, {
      status: 'retrying',
      scheduled_for: targetScheduleAt,
      last_error: null,
    });
  }

  await updateDistributionLog(id, {
    status: 'retrying',
    retry_count: existing.retry_count + 1,
    next_retry_at: targetScheduleAt,
    alert_sent: false,
  });

  return getDistributionLogById(id);
}

export async function getDistributionMetrics(filters: { postId?: number } = {}): Promise<DistributionMetrics> {
  const postParam = filters.postId ?? null;

  const [channelPerformanceResult, upcomingResult, recentResult, alertsResult] = await Promise.all([
    query(
      `SELECT t.channel,
              COUNT(l.*) FILTER (WHERE l.status = 'sent') AS sent_count,
              COUNT(l.*) FILTER (WHERE l.status = 'failed') AS failed_count,
              COUNT(l.*) FILTER (WHERE l.status = 'queued') AS queued_count,
              COUNT(l.*) FILTER (WHERE l.status = 'retrying') AS retrying_count
       FROM publishing_targets t
       LEFT JOIN distribution_logs l
         ON l.target_id = t.id
        AND ($1::int IS NULL OR l.post_id = $1)
       GROUP BY t.channel
       ORDER BY t.channel`,
      [postParam]
    ),
    query(
      `SELECT ${SCHEDULE_FIELDS}
       FROM publishing_schedules s
       JOIN posts p ON p.id = s.post_id
       JOIN publishing_targets t ON t.id = s.target_id
       WHERE s.status IN ('pending', 'queued', 'retrying')
         AND ($1::int IS NULL OR s.post_id = $1)
       ORDER BY s.scheduled_for ASC
       LIMIT 10`,
      [postParam]
    ),
    query(
      `SELECT ${LOG_FIELDS}
       FROM distribution_logs l
       JOIN posts p ON p.id = l.post_id
       JOIN publishing_targets t ON t.id = l.target_id
       WHERE ($1::int IS NULL OR l.post_id = $1)
       ORDER BY l.created_at DESC
       LIMIT 10`,
      [postParam]
    ),
    query(
      `SELECT ${LOG_FIELDS}
       FROM distribution_logs l
       JOIN posts p ON p.id = l.post_id
       JOIN publishing_targets t ON t.id = l.target_id
       WHERE ($1::int IS NULL OR l.post_id = $1)
         AND (l.status = 'failed' OR (l.retry_count > 0 AND l.status != 'sent'))
       ORDER BY l.updated_at DESC
       LIMIT 10`,
      [postParam]
    ),
  ]);

  const channelPerformance = channelPerformanceResult.rows.map((row: any) => ({
    channel: row.channel,
    sent: Number(row.sent_count || 0),
    failed: Number(row.failed_count || 0),
    queued: Number(row.queued_count || 0),
    retrying: Number(row.retrying_count || 0),
  }));

  const upcomingSchedules = upcomingResult.rows.map(mapScheduleRow);
  const recentDeliveries = recentResult.rows.map(mapLogRow);
  const alerts = alertsResult.rows.map(mapLogRow);

  return {
    channelPerformance,
    upcomingSchedules,
    recentDeliveries,
    alerts,
  };
}
