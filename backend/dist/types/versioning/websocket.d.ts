import { ContentVersion, VersionComment, PreviewToken, UserReference, JsonValue } from './core';
import type { RateLimitState } from './security';
export interface WebSocketEvents {
    'version:created': VersionCreatedEvent;
    'version:updated': VersionUpdatedEvent;
    'version:published': VersionPublishedEvent;
    'version:deleted': VersionDeletedEvent;
    'version:auto_saved': VersionAutoSavedEvent;
    'comment:added': CommentAddedEvent;
    'comment:updated': CommentUpdatedEvent;
    'comment:resolved': CommentResolvedEvent;
    'comment:deleted': CommentDeletedEvent;
    'preview:created': PreviewCreatedEvent;
    'preview:accessed': PreviewAccessedEvent;
    'preview:expired': PreviewExpiredEvent;
    'user:joined': UserJoinedEvent;
    'user:left': UserLeftEvent;
    'user:typing': UserTypingEvent;
    'user:cursor': UserCursorEvent;
    'system:notification': SystemNotificationEvent;
    'system:maintenance': SystemMaintenanceEvent;
}
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
    accessed_by: string;
    site_id: number;
    timestamp: Date;
}
export interface PreviewExpiredEvent {
    token_id: number;
    version_id: number;
    site_id: number;
    timestamp: Date;
}
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
export interface WebSocketMessage<T extends keyof WebSocketEvents> {
    event: T;
    data: WebSocketEvents[T];
    timestamp: Date;
    room: string;
    message_id: string;
}
export interface SecureWebSocketMessage<T extends keyof WebSocketEvents> extends WebSocketMessage<T> {
    site_id: number;
    user_id: number;
    signature: string;
    sequence_number: number;
}
export interface WebSocketConnection {
    connection_id: string;
    user_id: number;
    site_id: number;
    connected_at: Date;
    last_heartbeat: Date;
    subscribed_rooms: string[];
    ip_address: string;
    user_agent: string;
    protocol_version: string;
}
export interface SecureWebSocketConnection extends WebSocketConnection {
    auth_token_hash: string;
    rate_limit_state: RateLimitState;
    max_connections_per_user: number;
    max_message_size: number;
    message_queue_limit: number;
    backpressure_threshold: number;
}
export interface BinaryWebSocketMessage {
    message_type: number;
    site_id: number;
    user_id: number;
    payload_length: number;
    payload: Uint8Array;
    checksum: number;
}
export interface BatchedWebSocketEvents {
    batch_id: string;
    events: WebSocketMessage<keyof WebSocketEvents>[];
    compression: 'gzip' | 'brotli' | 'none';
    total_size_bytes: number;
    batch_time_ms: number;
}
export interface WebSocketRoom {
    room_id: string;
    room_type: 'version' | 'site' | 'project' | 'user';
    site_id: number;
    resource_id?: number;
    participants: UserReference[];
    created_at: Date;
    last_activity: Date;
    max_participants?: number;
    message_retention_minutes?: number;
    recording_enabled?: boolean;
}
export interface RoomSubscription {
    room_id: string;
    user_id: number;
    event_filters?: (keyof WebSocketEvents)[];
    receive_own_events?: boolean;
    batch_events?: boolean;
    compression?: boolean;
}
export interface WebSocketRPCRequest {
    id: string;
    method: string;
    params: JsonValue;
    timeout_ms?: number;
}
export interface WebSocketRPCResponse {
    id: string;
    result?: JsonValue;
    error?: {
        code: number;
        message: string;
        data?: JsonValue;
    };
}
export declare enum WebSocketState {
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    DISCONNECTED = "disconnected",
    ERROR = "error"
}
export interface WebSocketOptions {
    url: string;
    auth_token: string;
    site_id: number;
    auto_reconnect: boolean;
    reconnect_interval_ms: number;
    max_reconnect_attempts: number;
    heartbeat_interval_ms: number;
    enable_compression?: boolean;
    batch_events?: boolean;
    binary_mode?: boolean;
}
export interface WebSocketEventHandlers {
    onOpen?: (event: any) => void;
    onClose?: (event: any) => void;
    onError?: (event: any) => void;
    onMessage?: <T extends keyof WebSocketEvents>(message: WebSocketMessage<T>) => void;
    onReconnect?: () => void;
    onHeartbeat?: () => void;
}
export interface WebSocketMetrics {
    connection_id: string;
    messages_sent: number;
    messages_received: number;
    bytes_sent: number;
    bytes_received: number;
    average_latency_ms: number;
    reconnection_count: number;
    error_count: number;
    message_rate_per_second: number;
    bandwidth_usage_kbps: number;
    queue_depth: number;
}
//# sourceMappingURL=websocket.d.ts.map