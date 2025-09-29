import { ContentVersion, JsonValue } from './core';
import { ContentType, VersionType } from './enums';
export interface CacheLayerConfig {
    memory_cache: {
        max_size_mb: number;
        ttl_seconds: number;
        eviction_policy: 'lru' | 'lfu' | 'ttl' | 'arc';
        warm_up_on_start?: boolean;
    };
    redis_cache: {
        ttl_seconds: number;
        key_prefix: string;
        compression: boolean;
        cluster_mode?: boolean;
    };
    cdn_cache: {
        ttl_seconds: number;
        edge_locations: string[];
        purge_endpoints: string[];
        stale_while_revalidate?: number;
    };
}
export interface VersionCacheKeys {
    version_detail: (id: number, fields?: string[]) => string;
    version_list: (site_id: number, filters: VersionQueryFilters) => string;
    user_permissions: (user_id: number, site_id: number) => string;
    preview_token: (token_hash: string) => string;
    diff_comparison: (version_a: number, version_b: number) => string;
}
export interface CacheInvalidationRules {
    on_version_create: string[];
    on_version_update: (version_id: number) => string[];
    on_version_publish: (version_id: number, site_id: number) => string[];
    on_user_permission_change: (user_id: number, site_ids: number[]) => string[];
}
export interface CacheMetrics {
    hit_rate: number;
    miss_rate: number;
    eviction_rate: number;
    memory_usage_mb: number;
    avg_lookup_time_ms: number;
    invalidation_frequency: number;
    cost_savings_estimate?: number;
    bandwidth_saved_gb?: number;
    cpu_cycles_saved?: number;
}
export interface OptimizedVersionQuery {
    site_id: number;
    conditions: VersionQueryConditions;
    hints: QueryPerformanceHints;
    execution_plan?: QueryExecutionPlan;
}
export interface VersionQueryConditions {
    content_type?: ContentType;
    content_id?: number;
    version_type?: VersionType[];
    created_after?: Date;
    limit: number;
    offset?: number;
}
export interface QueryPerformanceHints {
    preferred_indexes: string[];
    avoid_indexes: string[];
    force_index_scan?: boolean;
    estimated_rows?: number;
    query_complexity_score: number;
    cache_eligible: boolean;
    parallel_execution?: boolean;
}
export interface QueryExecutionPlan {
    estimated_cost: number;
    estimated_rows: number;
    estimated_time_ms: number;
    index_usage: string[];
    join_order?: string[];
    warnings?: string[];
}
export interface BatchQueryPlan {
    queries: OptimizedVersionQuery[];
    execution_order: number[];
    parallel_groups: number[][];
    total_estimated_time_ms: number;
    memory_requirements_mb: number;
    strategies: QueryOptimizationStrategy[];
}
export interface QueryOptimizationStrategy {
    type: 'index_hint' | 'join_reorder' | 'subquery_materialize' | 'partition_prune';
    description: string;
    expected_improvement_percent: number;
    risk_level: 'low' | 'medium' | 'high';
}
export interface CursorPagination {
    cursor: string;
    limit: number;
    direction: 'forward' | 'backward';
    cursor_data?: {
        last_id: number;
        last_created_at: string;
        total_fetched: number;
    };
}
export interface VersionStream {
    version_id: number;
    basic_data: CompactVersion;
    load_full: () => Promise<ContentVersion>;
    preload_priority: 'high' | 'normal' | 'low';
    estimated_load_time_ms: number;
}
export interface CompactVersion {
    id: number;
    site_id: number;
    title: string;
    version_type: VersionType;
    version_number: number;
    created_at: string;
    is_current: boolean;
}
export interface VersionReference {
    id: number;
    title: string;
    version_type: VersionType;
    created_at: string;
    author_ref: number;
    site_ref: number;
    load_content?: () => Promise<string>;
    load_metadata?: () => Promise<JsonValue>;
}
export interface SharedVersionData {
    site_contexts: Map<number, SiteContext>;
    user_permissions: Map<string, PermissionSet>;
    theme_tokens: Map<number, ThemeTokens>;
    max_pool_size: number;
    eviction_strategy: 'lru' | 'lfu';
}
export interface SiteContext {
    site_id: number;
    domain: string;
    locale: string;
    settings: JsonValue;
}
export interface PermissionSet {
    permissions: Set<string>;
    cached_at: Date;
    ttl_seconds: number;
}
export interface ThemeTokens {
    colors: Record<string, string>;
    fonts: Record<string, string>;
    spacing: Record<string, string>;
}
export interface VersioningMetrics {
    api_latency_p50_ms: number;
    api_latency_p95_ms: number;
    api_latency_p99_ms: number;
    api_error_rate: number;
    api_throughput_rps: number;
    db_connection_pool_usage: number;
    db_query_time_avg_ms: number;
    db_slow_query_count: number;
    db_deadlock_count: number;
    cache_hit_rate: number;
    cache_eviction_rate: number;
    cache_memory_usage_mb: number;
    memory_usage_mb: number;
    cpu_usage_percent: number;
    gc_pause_time_ms: number;
    versions_created_per_minute: number;
    versions_published_per_minute: number;
    preview_tokens_generated_per_minute: number;
}
export interface PerformanceTrace {
    trace_id: string;
    span_id: string;
    operation: string;
    start_time: number;
    end_time?: number;
    duration_ms?: number;
    checkpoints: PerformanceCheckpoint[];
    memory_delta_mb?: number;
    cpu_time_ms?: number;
    io_operations?: number;
}
export interface PerformanceCheckpoint {
    name: string;
    timestamp: number;
    duration_from_start_ms: number;
    metadata?: Record<string, JsonValue>;
}
export interface LazyTypeLoader {
    core: () => Promise<typeof import('./core')>;
    api: () => Promise<typeof import('./api')>;
    security: () => Promise<typeof import('./security')>;
    websocket: () => Promise<typeof import('./websocket')>;
}
export interface OptimizedExports {
    minimal: MinimalTypes;
    standard: StandardTypes;
    full: FullTypes;
}
export interface MinimalTypes {
    [key: string]: any;
}
export interface StandardTypes extends MinimalTypes {
    [key: string]: any;
}
export interface FullTypes extends StandardTypes {
    [key: string]: any;
}
export interface PerformanceBudget {
    max_api_latency_p95_ms: number;
    max_bundle_size_kb: number;
    max_memory_usage_mb: number;
    max_cache_miss_rate: number;
    alert_thresholds: {
        warning: number;
        critical: number;
    };
}
export interface PerformanceTestScenario {
    name: string;
    operations: PerformanceTestOperation[];
    target_rps: number;
    duration_seconds: number;
    success_criteria: {
        max_p95_latency_ms: number;
        max_error_rate: number;
        min_throughput_rps: number;
    };
}
export interface PerformanceTestOperation {
    type: 'create_version' | 'publish_version' | 'list_versions' | 'compare_versions';
    weight: number;
    payload_size: 'small' | 'medium' | 'large';
    expected_latency_ms: number;
}
export interface VersionQueryFilters {
    content_type?: ContentType;
    version_type?: VersionType[];
    author_id?: number;
    date_range?: {
        start: Date;
        end: Date;
    };
    search_text?: string;
    metadata_filters?: Record<string, JsonValue>;
}
export interface MemoizationConfig {
    cache_size: number;
    ttl_ms: number;
    key_generator: (...args: any[]) => string;
    serialize_args?: boolean;
}
export interface RateLimitedOperation {
    operation: string;
    throttle_ms?: number;
    debounce_ms?: number;
    max_queued?: number;
    drop_excess?: boolean;
}
//# sourceMappingURL=performance.d.ts.map