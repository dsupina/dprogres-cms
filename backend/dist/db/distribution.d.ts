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
export declare function listPublishingTargets(): Promise<PublishingTarget[]>;
export declare function getPublishingTargetById(id: number): Promise<PublishingTarget | null>;
export interface CreatePublishingTargetInput {
    name: string;
    channel: string;
    credentials?: Record<string, any>;
    default_payload?: Record<string, any>;
    is_active?: boolean;
    rate_limit_per_hour?: number | null;
}
export declare function createPublishingTarget(input: CreatePublishingTargetInput): Promise<PublishingTarget>;
export interface UpdatePublishingTargetInput {
    name?: string;
    channel?: string;
    credentials?: Record<string, any>;
    default_payload?: Record<string, any>;
    is_active?: boolean;
    rate_limit_per_hour?: number | null;
}
export declare function updatePublishingTarget(id: number, input: UpdatePublishingTargetInput): Promise<PublishingTarget | null>;
export declare function deletePublishingTarget(id: number): Promise<boolean>;
export interface ListScheduleFilters {
    postId?: number;
    status?: ScheduleStatus;
    limit?: number;
}
export declare function listPublishingSchedules(filters?: ListScheduleFilters): Promise<PublishingSchedule[]>;
export declare function getPublishingScheduleById(id: number): Promise<PublishingSchedule | null>;
export interface CreatePublishingScheduleInput {
    post_id: number;
    target_id: number;
    scheduled_for: Date;
    status?: ScheduleStatus;
    options?: Record<string, any>;
    dispatch_payload?: Record<string, any> | null;
}
export declare function createPublishingSchedule(input: CreatePublishingScheduleInput): Promise<PublishingSchedule>;
export interface UpdateScheduleStatusInput {
    status?: ScheduleStatus;
    last_error?: string | null;
    dispatched_at?: Date | null;
    dispatch_payload?: Record<string, any> | null;
    scheduled_for?: Date;
    options?: Record<string, any>;
}
export declare function updatePublishingScheduleStatus(id: number, updates: UpdateScheduleStatusInput): Promise<PublishingSchedule | null>;
export declare function removePublishingSchedule(id: number): Promise<boolean>;
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
export declare function createDistributionLog(input: CreateDistributionLogInput): Promise<DistributionLog>;
export declare function getDistributionLogById(id: number): Promise<DistributionLog | null>;
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
export declare function updateDistributionLog(id: number, updates: UpdateDistributionLogInput): Promise<DistributionLog | null>;
export declare function listDistributionLogs(limit?: number): Promise<DistributionLog[]>;
export declare function getDistributionQueue(limit?: number): Promise<DistributionLog[]>;
export declare function recordDistributionFeedback(id: number, feedback: Record<string, any>): Promise<DistributionLog | null>;
export declare function markLogForRetry(id: number, nextRetryAt?: Date): Promise<DistributionLog | null>;
export declare function getDistributionMetrics(filters?: {
    postId?: number;
}): Promise<DistributionMetrics>;
//# sourceMappingURL=distribution.d.ts.map