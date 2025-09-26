/**
 * WebSocket Event Types for Real-time Versioning
 * Ticket: CV-002
 *
 * Real-time collaboration and event types for WebSocket communication
 */

import { ContentVersion, VersionComment, PreviewToken, UserReference, JsonValue } from './core';
import type { RateLimitState } from './security';

// ============================================
// WebSocket Events
// ============================================

/**
 * All WebSocket event types for real-time collaboration
 */
export interface WebSocketEvents {
  // Version events
  'version:created': VersionCreatedEvent;
  'version:updated': VersionUpdatedEvent;
  'version:published': VersionPublishedEvent;
  'version:deleted': VersionDeletedEvent;
  'version:auto_saved': VersionAutoSavedEvent;

  // Comment events
  'comment:added': CommentAddedEvent;
  'comment:updated': CommentUpdatedEvent;
  'comment:resolved': CommentResolvedEvent;
  'comment:deleted': CommentDeletedEvent;

  // Preview events
  'preview:created': PreviewCreatedEvent;
  'preview:accessed': PreviewAccessedEvent;
  'preview:expired': PreviewExpiredEvent;

  // Collaboration events
  'user:joined': UserJoinedEvent;
  'user:left': UserLeftEvent;
  'user:typing': UserTypingEvent;
  'user:cursor': UserCursorEvent;

  // System events
  'system:notification': SystemNotificationEvent;
  'system:maintenance': SystemMaintenanceEvent;
}

// ============================================
// Version Events
// ============================================

export interface VersionCreatedEvent {
  version: ContentVersion;
  creator: UserReference;
  site_id: number;
  timestamp: Date;
}

export interface VersionUpdatedEvent {
  version_id: number;
  changes: Partial<ContentVersion>;
  updated_by: UserReference;
  site_id: number;
  timestamp: Date;
}

export interface VersionPublishedEvent {
  version: ContentVersion;
  published_by: UserReference;
  affected_urls: string[];
  site_id: number;
  timestamp: Date;
}

export interface VersionDeletedEvent {
  version_id: number;
  deleted_by: UserReference;
  site_id: number;
  timestamp: Date;
}

export interface VersionAutoSavedEvent {
  version_id: number;
  auto_save_id: number;
  site_id: number;
  timestamp: Date;
}

// ============================================
// Comment Events
// ============================================

export interface CommentAddedEvent {
  comment: VersionComment;
  version_id: number;
  mention_users?: UserReference[];
  site_id: number;
  timestamp: Date;
}

export interface CommentUpdatedEvent {
  comment_id: number;
  changes: Partial<VersionComment>;
  updated_by: UserReference;
  version_id: number;
  site_id: number;
  timestamp: Date;
}

export interface CommentResolvedEvent {
  comment_id: number;
  resolved_by: UserReference;
  version_id: number;
  resolution_note?: string;
  site_id: number;
  timestamp: Date;
}

export interface CommentDeletedEvent {
  comment_id: number;
  deleted_by: UserReference;
  version_id: number;
  site_id: number;
  timestamp: Date;
}

// ============================================
// Preview Events
// ============================================

export interface PreviewCreatedEvent {
  preview_token: PreviewToken;
  version_id: number;
  created_by: UserReference;
  site_id: number;
  timestamp: Date;
}

export interface PreviewAccessedEvent {
  token: string;
  version_id: number;
  accessed_by: string; // IP or user
  site_id: number;
  timestamp: Date;
}

export interface PreviewExpiredEvent {
  token_id: number;
  version_id: number;
  site_id: number;
  timestamp: Date;
}

// ============================================
// Collaboration Events
// ============================================

export interface UserJoinedEvent {
  user: UserReference;
  room_id: string;
  site_id: number;
  timestamp: Date;
}

export interface UserLeftEvent {
  user: UserReference;
  room_id: string;
  site_id: number;
  timestamp: Date;
}

export interface UserTypingEvent {
  user: UserReference;
  version_id: number;
  field?: string;
  is_typing: boolean;
  site_id: number;
  timestamp: Date;
}

export interface UserCursorEvent {
  user: UserReference;
  version_id: number;
  cursor_position: CursorPosition;
  site_id: number;
  timestamp: Date;
}

export interface CursorPosition {
  line: number;
  column: number;
  selection?: {
    start_line: number;
    start_column: number;
    end_line: number;
    end_column: number;
  };
}

// ============================================
// System Events
// ============================================

export interface SystemNotificationEvent {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: JsonValue;
  affected_sites?: number[];
  timestamp: Date;
}

export interface SystemMaintenanceEvent {
  type: 'scheduled' | 'emergency';
  start_time: Date;
  end_time?: Date;
  affected_services: string[];
  message: string;
  affected_sites?: number[];
}

// ============================================
// WebSocket Message Format
// ============================================

/**
 * Generic WebSocket message wrapper
 */
export interface WebSocketMessage<T extends keyof WebSocketEvents> {
  event: T;
  data: WebSocketEvents[T];
  timestamp: Date;
  room: string; // Site-scoped room
  message_id: string;
}

/**
 * Secure WebSocket message with authentication
 */
export interface SecureWebSocketMessage<T extends keyof WebSocketEvents> extends WebSocketMessage<T> {
  site_id: number;
  user_id: number;
  signature: string; // HMAC signature for integrity
  sequence_number: number; // For ordering
}

// ============================================
// WebSocket Connection
// ============================================

/**
 * WebSocket connection configuration
 */
export interface WebSocketConnection {
  connection_id: string;
  user_id: number;
  site_id: number; // Locked to single site
  connected_at: Date;
  last_heartbeat: Date;
  subscribed_rooms: string[];

  // Connection metadata
  ip_address: string;
  user_agent: string;
  protocol_version: string;
}

/**
 * Secure WebSocket connection with rate limiting
 */
export interface SecureWebSocketConnection extends WebSocketConnection {
  auth_token_hash: string;
  rate_limit_state: RateLimitState;
  max_connections_per_user: number;
  max_message_size: number;
  message_queue_limit: number;
  backpressure_threshold: number;
}

// RateLimitState imported from security.ts

// ============================================
// Binary Message Format (Performance)
// ============================================

/**
 * Binary message format for high-frequency events
 */
export interface BinaryWebSocketMessage {
  message_type: number; // 1-byte enum
  site_id: number;
  user_id: number;
  payload_length: number;
  payload: Uint8Array;
  checksum: number;
}

/**
 * Event batching for performance
 */
export interface BatchedWebSocketEvents {
  batch_id: string;
  events: WebSocketMessage<keyof WebSocketEvents>[];
  compression: 'gzip' | 'brotli' | 'none';
  total_size_bytes: number;
  batch_time_ms: number;
}

// ============================================
// Room Management
// ============================================

/**
 * WebSocket room for collaboration
 */
export interface WebSocketRoom {
  room_id: string;
  room_type: 'version' | 'site' | 'project' | 'user';
  site_id: number;
  resource_id?: number;
  participants: UserReference[];
  created_at: Date;
  last_activity: Date;

  // Room settings
  max_participants?: number;
  message_retention_minutes?: number;
  recording_enabled?: boolean;
}

/**
 * Room subscription options
 */
export interface RoomSubscription {
  room_id: string;
  user_id: number;
  event_filters?: (keyof WebSocketEvents)[];
  receive_own_events?: boolean;
  batch_events?: boolean;
  compression?: boolean;
}

// ============================================
// WebSocket RPC
// ============================================

/**
 * WebSocket RPC request
 */
export interface WebSocketRPCRequest {
  id: string;
  method: string;
  params: JsonValue;
  timeout_ms?: number;
}

/**
 * WebSocket RPC response
 */
export interface WebSocketRPCResponse {
  id: string;
  result?: JsonValue;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
}

// ============================================
// Connection State
// ============================================

/**
 * WebSocket connection states
 */
export enum WebSocketState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

/**
 * Connection options
 */
export interface WebSocketOptions {
  url: string;
  auth_token: string;
  site_id: number;
  auto_reconnect: boolean;
  reconnect_interval_ms: number;
  max_reconnect_attempts: number;
  heartbeat_interval_ms: number;

  // Performance options
  enable_compression?: boolean;
  batch_events?: boolean;
  binary_mode?: boolean;
}

// ============================================
// Event Handlers
// ============================================

/**
 * WebSocket event handler types
 */
export interface WebSocketEventHandlers {
  onOpen?: (event: any) => void;
  onClose?: (event: any) => void;
  onError?: (event: any) => void;
  onMessage?: <T extends keyof WebSocketEvents>(message: WebSocketMessage<T>) => void;
  onReconnect?: () => void;
  onHeartbeat?: () => void;
}

// ============================================
// Performance Metrics
// ============================================

/**
 * WebSocket performance metrics
 */
export interface WebSocketMetrics {
  connection_id: string;
  messages_sent: number;
  messages_received: number;
  bytes_sent: number;
  bytes_received: number;
  average_latency_ms: number;
  reconnection_count: number;
  error_count: number;

  // Performance indicators
  message_rate_per_second: number;
  bandwidth_usage_kbps: number;
  queue_depth: number;
}

// Export types - no default export needed for interfaces