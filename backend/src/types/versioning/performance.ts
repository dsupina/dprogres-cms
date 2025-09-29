/**
 * Performance Optimization Types for Versioning System
 * Ticket: CV-002
 *
 * Performance-focused type definitions for caching, optimization, and monitoring
 */

import { ContentVersion, JsonValue } from './core';
import { ContentType, VersionType } from './enums';

// ============================================
// Caching Strategy Types
// ============================================

/**
 * Multi-layer cache configuration
 */
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

/**
 * Cache key builders with type safety
 */
export interface VersionCacheKeys {
  version_detail: (id: number, fields?: string[]) => string;
  version_list: (site_id: number, filters: VersionQueryFilters) => string;
  user_permissions: (user_id: number, site_id: number) => string;
  preview_token: (token_hash: string) => string;
  diff_comparison: (version_a: number, version_b: number) => string;
}

/**
 * Cache invalidation patterns
 */
export interface CacheInvalidationRules {
  on_version_create: string[];
  on_version_update: (version_id: number) => string[];
  on_version_publish: (version_id: number, site_id: number) => string[];
  on_user_permission_change: (user_id: number, site_ids: number[]) => string[];
}

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
  hit_rate: number;
  miss_rate: number;
  eviction_rate: number;
  memory_usage_mb: number;
  avg_lookup_time_ms: number;
  invalidation_frequency: number;

  // Cache effectiveness
  cost_savings_estimate?: number;
  bandwidth_saved_gb?: number;
  cpu_cycles_saved?: number;
}

// ============================================
// Query Optimization Types
// ============================================

/**
 * Performance-optimized query builder
 */
export interface OptimizedVersionQuery {
  // Required site context for index usage
  site_id: number;

  // Query conditions
  conditions: VersionQueryConditions;

  // Performance hints
  hints: QueryPerformanceHints;

  // Execution plan
  execution_plan?: QueryExecutionPlan;
}

export interface VersionQueryConditions {
  content_type?: ContentType;
  content_id?: number;
  version_type?: VersionType[];
  created_after?: Date;
  limit: number; // Always enforce reasonable limits
  offset?: number; // Warn if > 1000
}

export interface QueryPerformanceHints {
  preferred_indexes: string[];
  avoid_indexes: string[];
  force_index_scan?: boolean;
  estimated_rows?: number;
  query_complexity_score: number; // 1-10 scale
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

/**
 * Batch query optimization
 */
export interface BatchQueryPlan {
  queries: OptimizedVersionQuery[];
  execution_order: number[];
  parallel_groups: number[][];
  total_estimated_time_ms: number;
  memory_requirements_mb: number;

  // Optimization strategies
  strategies: QueryOptimizationStrategy[];
}

export interface QueryOptimizationStrategy {
  type: 'index_hint' | 'join_reorder' | 'subquery_materialize' | 'partition_prune';
  description: string;
  expected_improvement_percent: number;
  risk_level: 'low' | 'medium' | 'high';
}

// ============================================
// Pagination Optimization
// ============================================

/**
 * Cursor-based pagination for better performance
 */
export interface CursorPagination {
  cursor: string;
  limit: number;
  direction: 'forward' | 'backward';

  // Cursor metadata
  cursor_data?: {
    last_id: number;
    last_created_at: string;
    total_fetched: number;
  };
}

/**
 * Streaming response for large datasets
 */
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
  created_at: string; // ISO string for smaller payload
  is_current: boolean;
}

// ============================================
// Memory Optimization
// ============================================

/**
 * Memory-efficient data structures
 */
export interface VersionReference {
  id: number;
  title: string;
  version_type: VersionType;
  created_at: string;

  // Shared references to reduce memory
  author_ref: number; // Reference ID instead of full object
  site_ref: number;

  // Lazy-loaded data
  load_content?: () => Promise<string>;
  load_metadata?: () => Promise<JsonValue>;
}

/**
 * Flyweight pattern for common data
 */
export interface SharedVersionData {
  site_contexts: Map<number, SiteContext>;
  user_permissions: Map<string, PermissionSet>;
  theme_tokens: Map<number, ThemeTokens>;

  // Memory pool settings
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

// ============================================
// Performance Monitoring
// ============================================

/**
 * Performance metrics collection
 */
export interface VersioningMetrics {
  // API performance
  api_latency_p50_ms: number;
  api_latency_p95_ms: number;
  api_latency_p99_ms: number;
  api_error_rate: number;
  api_throughput_rps: number;

  // Database performance
  db_connection_pool_usage: number;
  db_query_time_avg_ms: number;
  db_slow_query_count: number;
  db_deadlock_count: number;

  // Cache performance
  cache_hit_rate: number;
  cache_eviction_rate: number;
  cache_memory_usage_mb: number;

  // Memory and CPU
  memory_usage_mb: number;
  cpu_usage_percent: number;
  gc_pause_time_ms: number;

  // Business metrics
  versions_created_per_minute: number;
  versions_published_per_minute: number;
  preview_tokens_generated_per_minute: number;
}

/**
 * Performance trace context
 */
export interface PerformanceTrace {
  trace_id: string;
  span_id: string;
  operation: string;
  start_time: number;
  end_time?: number;
  duration_ms?: number;

  // Performance checkpoints
  checkpoints: PerformanceCheckpoint[];

  // Resource usage
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

// ============================================
// Bundle Size Optimization
// ============================================

/**
 * Lazy type loading for bundle optimization
 */
export interface LazyTypeLoader {
  core: () => Promise<typeof import('./core')>;
  api: () => Promise<typeof import('./api')>;
  security: () => Promise<typeof import('./security')>;
  websocket: () => Promise<typeof import('./websocket')>;
}

/**
 * Selective type exports for tree-shaking
 */
export interface OptimizedExports {
  minimal: MinimalTypes;
  standard: StandardTypes;
  full: FullTypes;
}

export interface MinimalTypes {
  // Type references only
  [key: string]: any;
}

export interface StandardTypes extends MinimalTypes {
  // Extended type references
  [key: string]: any;
}

export interface FullTypes extends StandardTypes {
  // All types including rarely used ones
  [key: string]: any;
}

// ============================================
// Performance Validation
// ============================================

/**
 * Performance budget configuration
 */
export interface PerformanceBudget {
  max_api_latency_p95_ms: number; // 300ms per PRD
  max_bundle_size_kb: number;
  max_memory_usage_mb: number;
  max_cache_miss_rate: number;

  // Alerts
  alert_thresholds: {
    warning: number; // % of budget
    critical: number;
  };
}

/**
 * Performance test scenario
 */
export interface PerformanceTestScenario {
  name: string;
  operations: PerformanceTestOperation[];
  target_rps: number;
  duration_seconds: number;

  // Success criteria
  success_criteria: {
    max_p95_latency_ms: number;
    max_error_rate: number;
    min_throughput_rps: number;
  };
}

export interface PerformanceTestOperation {
  type: 'create_version' | 'publish_version' | 'list_versions' | 'compare_versions';
  weight: number; // Relative frequency
  payload_size: 'small' | 'medium' | 'large';
  expected_latency_ms: number;
}

// ============================================
// Query Filter Types
// ============================================

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

// ============================================
// Performance Helpers
// ============================================

/**
 * Memoization configuration for expensive operations
 */
export interface MemoizationConfig {
  cache_size: number;
  ttl_ms: number;
  key_generator: (...args: any[]) => string;
  serialize_args?: boolean;
}

/**
 * Debounce/throttle configuration
 */
export interface RateLimitedOperation {
  operation: string;
  throttle_ms?: number;
  debounce_ms?: number;
  max_queued?: number;
  drop_excess?: boolean;
}

// Export types - no default export needed for interfaces