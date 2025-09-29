# CV-005: Auto-Save System

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** High
**Status:** TODO

## User Story
As a **content creator**, I want my work automatically saved at regular intervals, so that I never lose progress even if my browser crashes or internet connection drops.

## Background
Content creators often spend hours working on articles, only to lose everything due to browser crashes, network issues, or accidental navigation. An auto-save system will periodically save their work in the background, providing peace of mind and preventing data loss.

## Requirements

### Functional Requirements
- Automatically save content every 30 seconds (configurable)
- Save only when content has changed
- Show visual indicator when saving
- Allow manual trigger of auto-save
- Recover unsaved work on page reload
- Clean up old auto-saves automatically
- Handle concurrent editing gracefully

### Technical Requirements
- Minimal performance impact
- Debouncing to prevent excessive saves
- Conflict detection for multi-user editing
- WebSocket support for real-time sync
- Local storage fallback
- Efficient diff detection

## Acceptance Criteria
- [ ] Content auto-saves every 30 seconds when changed
- [ ] Save indicator shows current save status
- [ ] No saves triggered if content unchanged
- [ ] Manual save button works instantly
- [ ] Unsaved changes recovered after browser crash
- [ ] Only last 5 auto-saves kept per content
- [ ] Concurrent edit warning displayed
- [ ] Performance impact < 50ms per save
- [ ] Works offline with sync on reconnect

## Technical Architecture

### Backend Implementation

#### Service Layer Extensions
Extend the existing `VersionService` class with auto-save specific methods:

```typescript
// backend/src/services/AutoSaveService.ts
export class AutoSaveService extends VersionService {
  // Auto-save specific methods
  async createAutoSave(input: AutoSaveInput, userId: number): Promise<ServiceResponse<ContentVersion>>
  async getLatestAutoSave(contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<ContentVersion | null>>
  async hasUnsavedChanges(contentType: ContentType, contentId: number, siteId: number, lastSavedHash: string): Promise<ServiceResponse<boolean>>
  async cleanupAutoSaves(contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<number>>
  async detectConflicts(versionId: number, lastKnownVersion: number): Promise<ServiceResponse<VersionConflict | null>>
  async generateContentHash(content: any): Promise<string>
  async batchCleanupAutoSaves(): Promise<ServiceResponse<CleanupResult>>
}
```

#### API Endpoints
New endpoints in `backend/src/routes/autosave.ts`:

```typescript
// POST /api/content/:contentType/:contentId/autosave
// - Creates auto-save version with content hash validation
// - Rate limited: max 1 request per 10 seconds per user/content
// - Automatic cleanup of old auto-saves (keep last 5)

// GET /api/content/:contentType/:contentId/autosave/latest
// - Retrieves latest auto-save version
// - Returns null if no auto-save exists or older than 7 days

// GET /api/content/:contentType/:contentId/autosave/status
// - Check if unsaved changes exist based on content hash
// - Returns conflict info if concurrent edits detected

// DELETE /api/content/:contentType/:contentId/autosave
// - Cleans up auto-save versions for content
// - Called after successful manual save/publish

// WebSocket: /ws/autosave/:contentType/:contentId
// - Real-time notifications for concurrent editing
// - Broadcasts save events to connected clients
```

### Frontend Implementation

#### Core Auto-Save Hook
```typescript
// frontend/src/hooks/useAutoSave.ts
interface UseAutoSaveOptions {
  contentType: 'post' | 'page';
  contentId: number;
  content: any;
  interval?: number; // Default: 30000ms
  enabled?: boolean;
  onSaveStart?: () => void;
  onSaveSuccess?: (version: ContentVersion) => void;
  onSaveError?: (error: Error) => void;
  onConflictDetected?: (conflict: VersionConflict) => void;
}

export function useAutoSave(options: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedHash, setLastSavedHash] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Implementation details...
}
```

#### Content Change Detection
```typescript
// frontend/src/utils/contentHashing.ts
export class ContentHasher {
  static async generateHash(content: any): Promise<string> {
    // Use crypto.subtle.digest for consistent hashing
    // Normalize content structure before hashing
  }

  static async hasChanged(current: any, previous: string): Promise<boolean> {
    const currentHash = await this.generateHash(current);
    return currentHash !== previous;
  }
}
```

#### Save Status Component
```typescript
// frontend/src/components/ui/SaveStatusIndicator.tsx
interface SaveStatusIndicatorProps {
  status: AutoSaveStatus;
  lastSaved?: Date;
  hasUnsavedChanges: boolean;
  onManualSave?: () => void;
}

export function SaveStatusIndicator(props: SaveStatusIndicatorProps) {
  // Visual status indicator with accessibility support
}
```

### Database Schema Updates

#### Additional Indexes for Auto-Save Performance
```sql
-- Index for auto-save cleanup queries
CREATE INDEX idx_content_versions_autosave_cleanup
  ON content_versions(site_id, content_type, content_id, created_at DESC)
  WHERE version_type = 'auto_save';

-- Index for latest auto-save retrieval
CREATE INDEX idx_content_versions_latest_autosave
  ON content_versions(site_id, content_type, content_id, version_number DESC)
  WHERE version_type = 'auto_save' AND created_at > NOW() - INTERVAL '7 days';

-- Add content_hash column to content_versions table
ALTER TABLE content_versions
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

CREATE INDEX idx_content_versions_hash
  ON content_versions(content_hash)
  WHERE content_hash IS NOT NULL;
```

#### Auto-Save Metadata Table
```sql
-- Track auto-save sessions and conflict detection
CREATE TABLE IF NOT EXISTS autosave_sessions (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL,
  content_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_saved_version INTEGER REFERENCES content_versions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  CONSTRAINT unique_user_content_session
    UNIQUE (site_id, content_type, content_id, user_id)
);

CREATE INDEX idx_autosave_sessions_activity
  ON autosave_sessions(last_activity DESC);

CREATE INDEX idx_autosave_sessions_cleanup
  ON autosave_sessions(expires_at)
  WHERE expires_at < CURRENT_TIMESTAMP;
```

### WebSocket Integration

#### Real-Time Collaboration Service
```typescript
// backend/src/services/CollaborationService.ts
export class CollaborationService {
  private io: SocketIOServer;

  setupAutoSaveNamespace() {
    const autoSaveNs = this.io.of('/autosave');

    autoSaveNs.on('connection', (socket) => {
      socket.on('join-content', async (data: JoinContentData) => {
        // Join room for specific content item
        // Track active editing sessions
        // Send current editor list to new joiner
      });

      socket.on('save-notification', (data: SaveNotificationData) => {
        // Broadcast save event to other editors
        // Update last activity timestamp
      });
    });
  }
}
```

#### Frontend WebSocket Integration
```typescript
// frontend/src/hooks/useCollaboration.ts
export function useCollaboration(contentType: string, contentId: number) {
  const [activeEditors, setActiveEditors] = useState<Editor[]>([]);
  const [conflictAlert, setConflictAlert] = useState<VersionConflict | null>(null);

  useEffect(() => {
    const socket = io('/autosave');

    socket.emit('join-content', { contentType, contentId });

    socket.on('editor-joined', handleEditorJoined);
    socket.on('editor-left', handleEditorLeft);
    socket.on('save-conflict', handleSaveConflict);

    return () => socket.disconnect();
  }, [contentType, contentId]);
}
```

### Offline Support with IndexedDB

#### Local Storage Service
```typescript
// frontend/src/services/OfflineStorageService.ts
export class OfflineStorageService {
  private db: IDBDatabase;

  async storeAutoSave(contentKey: string, content: any, timestamp: Date): Promise<void> {
    // Store in IndexedDB with versioning
  }

  async getLatestOfflineAutoSave(contentKey: string): Promise<OfflineAutoSave | null> {
    // Retrieve latest offline auto-save
  }

  async syncPendingAutoSaves(): Promise<SyncResult[]> {
    // Sync queued auto-saves when connection restored
  }

  async clearSyncedAutoSaves(contentKey: string): Promise<void> {
    // Clean up after successful sync
  }
}
```

### Performance Optimizations

#### Content Diffing Strategy
```typescript
// frontend/src/utils/contentDiffing.ts
export class ContentDiffer {
  static async generateDiff(oldContent: any, newContent: any): Promise<ContentDiff> {
    // Use Web Worker for heavy diff calculations
    // Return minimal diff object for efficient transmission
  }

  static async applyDiff(baseContent: any, diff: ContentDiff): Promise<any> {
    // Apply diff to reconstruct content
  }
}
```

#### Caching Strategy
```typescript
// backend/src/middleware/autoSaveCache.ts
export class AutoSaveCacheMiddleware {
  private cache: Map<string, CachedAutoSave> = new Map();

  async getCachedAutoSave(key: string): Promise<ContentVersion | null> {
    // Check Redis cache first, then in-memory cache
  }

  async setCachedAutoSave(key: string, version: ContentVersion): Promise<void> {
    // Store in both Redis and in-memory with TTL
  }
}
```

### Error Handling & Recovery

#### Network Failure Handling
```typescript
// frontend/src/hooks/useAutoSaveWithRetry.ts
export function useAutoSaveWithRetry(options: UseAutoSaveOptions) {
  const [retryQueue, setRetryQueue] = useState<QueuedSave[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const saveWithRetry = useCallback(async (content: any) => {
    if (!isOnline) {
      // Queue for later sync
      await offlineStorage.storeAutoSave(contentKey, content, new Date());
      return;
    }

    try {
      await autoSaveApi.save(content);
    } catch (error) {
      if (isNetworkError(error)) {
        // Add to retry queue with exponential backoff
        addToRetryQueue(content, error);
      } else {
        throw error; // Re-throw non-network errors
      }
    }
  }, [isOnline, contentKey]);
}
```

### Conflict Detection & Resolution

#### Conflict Detection Algorithm
```typescript
// backend/src/services/ConflictDetectionService.ts
export class ConflictDetectionService {
  async detectConflict(
    contentType: ContentType,
    contentId: number,
    siteId: number,
    clientLastKnownVersion: number,
    clientSessionToken: string
  ): Promise<VersionConflict | null> {
    // 1. Get latest version from database
    // 2. Check if other users have active sessions
    // 3. Compare version numbers and timestamps
    // 4. Generate conflict resolution options
  }

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution
  ): Promise<ServiceResponse<ContentVersion>> {
    // Apply conflict resolution strategy
    // Create merged version if needed
    // Notify all active editors
  }
}
```

## Testing Strategy

### Unit Tests
- `AutoSaveService` methods with mocked database
- Content hashing and diffing utilities
- React hooks behavior with different scenarios
- WebSocket event handling
- Offline storage operations

### Integration Tests
- Auto-save API endpoints with authentication
- Database operations and cleanup jobs
- WebSocket real-time notifications
- Conflict detection and resolution flows
- Cache invalidation strategies

### End-to-End Tests
```typescript
// e2e/autosave.spec.ts
describe('Auto-Save System', () => {
  test('should auto-save content every 30 seconds', async ({ page }) => {
    // Type content and verify auto-save triggers
  });

  test('should recover content after browser crash', async ({ page }) => {
    // Simulate crash and verify recovery
  });

  test('should handle concurrent editing gracefully', async ({ page, context }) => {
    // Open multiple tabs and test conflict resolution
  });

  test('should work offline and sync when reconnected', async ({ page }) => {
    // Test offline functionality with network simulation
  });
});
```

### Performance Tests
- Auto-save latency under different content sizes
- Memory usage with large documents
- WebSocket connection limits
- Database query performance with many versions
- IndexedDB storage limits and performance

### Load Tests
- Concurrent auto-saves from multiple users
- WebSocket connection scaling
- Database performance under auto-save load
- Cache hit rates and memory consumption

## Product Experience Specification

### User Mental Model
Users expect auto-save to work like cloud document editors (Google Docs, Notion):
- **Invisible by default**: Auto-save happens silently in the background
- **Status clarity**: Always know current save state without guessing
- **Confidence**: Trust that work is protected from unexpected loss
- **Manual control**: Can trigger saves immediately when needed
- **Conflict awareness**: Clear notification when multiple people edit simultaneously

### User Interaction Patterns

#### Primary Editing Flow
1. **Content creation/editing**: User types naturally without save concerns
2. **Automatic saving**: System saves every 30 seconds after changes stop
3. **Status feedback**: Subtle indicator shows "Saved", "Saving...", or "Unsaved changes"
4. **Manual save**: CMD/Ctrl+S or save button for immediate control
5. **Recovery on return**: Auto-restore unsaved work when reopening content

#### Status Indicator Behavior
**Location**: Top-right of content editor area, non-intrusive
**States**:
- **Saved** (default): Green checkmark + "Saved" text, fades after 2 seconds
- **Saving**: Blue spinner + "Saving..." text, remains visible during save
- **Unsaved changes**: Yellow dot + "Unsaved changes" text, persistent until saved
- **Offline**: Orange cloud-off icon + "Offline - will sync" text
- **Error**: Red warning icon + "Save failed - retry" button

#### Keyboard Shortcuts
- **CMD/Ctrl+S**: Force immediate save (overrides auto-save timer)
- **Shows feedback**: Brief "Saving..." then "Saved" confirmation

### Visual Feedback Design

#### Save Status Component
```
[Icon] [Status Text] [Timestamp]
✓ Saved • 2 minutes ago
```

**Design tokens**:
- Typography: Text-sm, medium weight
- Colors: Success green (#10B981), Warning yellow (#F59E0B), Error red (#EF4444)
- Icons: 16px, from existing icon system
- Spacing: 8px gap between elements
- Background: Subtle pill shape with transparency

#### Integration with Existing UI
- **Position**: Below page title, aligned with action buttons
- **Responsive**: Collapses to icon-only on mobile
- **Theme compatibility**: Respects light/dark mode settings
- **Animation**: Smooth 200ms transitions between states

### Error States and Recovery Flows

#### Network Failures
**Trigger**: API request timeout or connection loss
**UX Flow**:
1. Status changes to "Offline - will sync"
2. Content remains editable (stored locally)
3. Automatic retry every 30 seconds
4. Success notification when connection restored
5. Background sync of queued changes

#### Concurrent Edit Conflicts
**Trigger**: Another user modified same content
**UX Flow**:
1. Modal dialog: "Someone else edited this content"
2. Options: "Keep my version", "Use their version", "Review changes"
3. Preview diff if "Review changes" selected
4. Clear conflict resolution tracking
5. Resume normal auto-save after resolution

#### Save Failures
**Trigger**: Server error, validation failure, or permission issue
**UX Flow**:
1. Status shows "Save failed - retry" with red warning
2. Click retry attempts immediate save
3. Persistent error shows detailed message
4. Option to download content as backup
5. Escalation to manual save with full form validation

### Performance Expectations

#### User-Perceived Performance
- **Save initiation**: < 100ms response to show "Saving..." status
- **Network save**: < 2 seconds for typical content size
- **Status update**: Immediate feedback on save completion
- **Background operation**: No UI blocking or typing interruption
- **Recovery time**: < 1 second to restore unsaved work

#### Progressive Enhancement
- **Fast connection**: Real-time sync every 30 seconds
- **Slow connection**: Adaptive intervals (up to 2 minutes)
- **Offline mode**: Local storage with background queue
- **Low power**: Reduced frequency on battery/mobile

### Integration with Manual Save/Publish

#### Coexistence Pattern
- **Auto-save creates drafts**: Never auto-publishes content
- **Manual save precedence**: User save action cancels auto-save timer
- **Status coordination**: Manual save updates auto-save timestamp
- **Publish workflow**: Auto-save works with draft → review → publish flow

#### Save Button Evolution
**Current behavior**: "Save Changes" button with loading state
**Enhanced behavior**:
- **Primary action**: "Publish" or "Save Draft" (context-dependent)
- **Secondary indicator**: Auto-save status nearby
- **Loading state**: Harmonized with auto-save feedback
- **Keyboard shortcut**: CMD/Ctrl+S triggers manual save

#### Draft Management
- **Auto-saves as versions**: Integrated with CV-003 version service
- **Manual saves**: Create named draft versions
- **Recovery options**: "Restore from auto-save" in version history
- **Cleanup policy**: Auto-saves expire after 7 days or 10 versions

### Accessibility Requirements

#### WCAG 2.2 AA Compliance
- **Focus management**: Status changes don't steal focus from editor
- **Screen reader announcements**: Live region for status updates
- **Keyboard navigation**: All save actions accessible via keyboard
- **Color contrast**: 4.5:1 ratio for all status indicators
- **Reduced motion**: Respect prefers-reduced-motion for animations

#### Assistive Technology Support
- **ARIA labels**: "Auto-save status: Saved 2 minutes ago"
- **Live region**: aria-live="polite" for non-urgent status updates
- **High contrast**: Alternative visual indicators for color-blind users
- **Voice control**: "Save now" voice command triggers manual save

### Offline/Online Transitions

#### Offline Detection
- **Browser API**: navigator.onLine + network request validation
- **Graceful degradation**: Continue editing with local storage
- **Visual feedback**: Clear offline status with sync queue count
- **User control**: "Retry sync" button for manual reconnection

#### Sync Strategy
- **Queue management**: FIFO order for pending saves
- **Conflict detection**: Compare timestamps before applying queued saves
- **Progress indication**: "Syncing 3 of 5 changes..." for batch operations
- **Failure recovery**: Retry failed syncs with exponential backoff

### Scope Definition

#### In Scope (MVP)
- Auto-save every 30 seconds for content changes
- Save status indicator with 4 core states
- Manual save override (CMD/Ctrl+S)
- Basic offline storage and sync
- Recovery on page reload
- Integration with existing save button

#### Out of Scope (Future)
- Real-time collaborative editing indicators
- Advanced conflict resolution UI
- Auto-save configuration in settings
- Cross-device sync
- Granular edit history scrubbing
- Auto-save for non-content fields (metadata, settings)

### Success Metrics
- **Data loss incidents**: < 0.1% of editing sessions
- **User confidence**: 90%+ report trusting auto-save (post-launch survey)
- **Save frequency**: 95%+ of saves happen automatically vs manually
- **Error recovery**: 90%+ of conflicts resolved without data loss
- **Performance impact**: < 50ms added latency to typing experience

## API Contract Definitions

### Auto-Save API Endpoints

#### POST /api/content/:contentType/:contentId/autosave
```typescript
interface AutoSaveRequest {
  content: any;
  content_hash: string;
  last_known_version?: number;
  session_token: string;
}

interface AutoSaveResponse {
  success: boolean;
  data?: {
    version: ContentVersion;
    content_hash: string;
    conflicts?: VersionConflict[];
  };
  error?: string;
}
```

#### GET /api/content/:contentType/:contentId/autosave/latest
```typescript
interface LatestAutoSaveResponse {
  success: boolean;
  data?: {
    version: ContentVersion | null;
    has_newer_manual_save: boolean;
  };
}
```

#### GET /api/content/:contentType/:contentId/autosave/status
```typescript
interface AutoSaveStatusRequest {
  content_hash: string;
  last_known_version: number;
}

interface AutoSaveStatusResponse {
  success: boolean;
  data: {
    has_unsaved_changes: boolean;
    conflicts: VersionConflict[];
    active_editors: ActiveEditor[];
    latest_version_number: number;
  };
}
```

### WebSocket Events

#### Client to Server
```typescript
interface JoinContentEvent {
  content_type: 'post' | 'page';
  content_id: number;
  user_info: {
    id: number;
    name: string;
    avatar?: string;
  };
}

interface SaveNotificationEvent {
  version_number: number;
  content_hash: string;
  change_summary?: string;
}
```

#### Server to Client
```typescript
interface EditorJoinedEvent {
  editor: ActiveEditor;
  total_editors: number;
}

interface SaveConflictEvent {
  conflict: VersionConflict;
  conflicting_editor: ActiveEditor;
}

interface EditorActivityEvent {
  editor_id: number;
  last_activity: Date;
  cursor_position?: number;
}
```

## Type Definitions

```typescript
// Shared types for auto-save system
interface AutoSaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';
  lastSaved?: Date;
  error?: string;
  conflictId?: string;
}

interface ContentDiff {
  added: Record<string, any>;
  removed: string[];
  modified: Record<string, { old: any; new: any }>;
  size_bytes: number;
}

interface VersionConflict {
  id: string;
  content_type: string;
  content_id: number;
  conflicting_version: number;
  current_version: number;
  conflicting_user: {
    id: number;
    name: string;
  };
  created_at: Date;
  resolution_options: ConflictResolutionOption[];
}

interface ActiveEditor {
  user_id: number;
  user_name: string;
  user_avatar?: string;
  joined_at: Date;
  last_activity: Date;
  cursor_position?: number;
  is_saving?: boolean;
}

interface OfflineAutoSave {
  content_key: string;
  content: any;
  content_hash: string;
  created_at: Date;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  retry_count: number;
}
```

## Performance Benchmarks

### Target Metrics
- **Auto-save latency**: < 500ms for typical content (< 100KB)
- **Content hashing**: < 50ms for documents up to 1MB
- **Diff generation**: < 200ms for typical changes
- **WebSocket notification**: < 100ms to all connected clients
- **Offline storage**: < 100ms to IndexedDB
- **Memory usage**: < 50MB additional for auto-save features

### Database Performance
- **Auto-save creation**: < 100ms with proper indexing
- **Latest auto-save retrieval**: < 50ms with index
- **Cleanup operations**: < 5 seconds for 1000+ versions
- **Conflict detection**: < 100ms with session tracking

## Monitoring & Observability

### Metrics to Track
- Auto-save success/failure rates
- Average save latency by content size
- Conflict detection and resolution rates
- WebSocket connection counts and stability
- Cache hit rates for auto-save data
- Offline queue sizes and sync success rates

### Alerts
- Auto-save failure rate > 5%
- Average save latency > 1 second
- WebSocket disconnection rate > 10%
- Offline sync failure rate > 15%
- Database auto-save cleanup failures

## Security Considerations

### CRITICAL SECURITY REQUIREMENTS

#### 1. Rate Limiting & DDoS Prevention (BLOCKER)
- **Per-user rate limiting**: Max 1 auto-save per 10 seconds per user/content combination
- **Global rate limiting**: Max 100 auto-saves per minute per IP address
- **WebSocket connection limits**: Max 5 connections per user, 1000 total connections
- **Implement circuit breaker**: Temporary block after 10 consecutive failures
- **Request size validation**: Reject auto-save payloads > 1MB to prevent memory exhaustion

#### 2. Authentication & Session Security (BLOCKER)
- **WebSocket authentication**: Validate JWT token on connection AND periodically (every 5 minutes)
- **Session token rotation**: New session token every 4 hours with grace period for transition
- **Prevent session hijacking**: Bind session tokens to IP + User-Agent fingerprint
- **Implement CSRF protection**: Use double-submit cookie pattern for auto-save endpoints
- **Validate content ownership**: Verify user has write permissions before every auto-save

#### 3. Data Encryption & Storage Security (HIGH)
- **Encryption at rest**: AES-256-GCM for all auto-save content in database
- **Encryption key management**: Separate encryption keys per site, rotated monthly
- **IndexedDB encryption**: Use Web Crypto API to encrypt offline content with user-derived key
- **Memory protection**: Clear sensitive data from memory after processing
- **Secure deletion**: Overwrite auto-save data before deletion

#### 4. Input Validation & Sanitization (HIGH)
- **Content validation**: Sanitize all HTML content with DOMPurify before storage
- **Hash validation**: Verify content_hash matches actual content to prevent tampering
- **Version number validation**: Ensure version numbers are sequential, reject out-of-order saves
- **Session token format**: Validate token structure and signature before processing
- **SQL injection prevention**: Use parameterized queries exclusively, no string concatenation

#### 5. Multi-Site Data Isolation (BLOCKER)
- **Strict site boundary enforcement**: Include site_id in ALL queries and validations
- **Cross-site request validation**: Verify user has access to the specific site
- **Prevent data leakage**: Use row-level security in PostgreSQL for site isolation
- **WebSocket room isolation**: Separate WebSocket namespaces per site
- **Cache key namespacing**: Include site_id in all cache keys

#### 6. Privacy & Compliance (HIGH)
- **GDPR compliance**:
  - Right to erasure: Provide API to delete all auto-saves for a user
  - Data portability: Include auto-saves in user data export
  - Consent tracking: Store user consent for auto-save feature
  - Data minimization: Only store essential content, no metadata tracking
- **Retention policies**:
  - Auto-delete auto-saves older than 7 days
  - Implement hard delete (not soft delete) for privacy
  - Audit log retention separate from content (30 days)
- **PII handling**:
  - Flag content containing PII (emails, phone numbers)
  - Extra encryption for PII-flagged content
  - Separate storage for sensitive content

#### 7. Audit Logging & Monitoring (MEDIUM)
- **Comprehensive logging**:
  ```typescript
  interface AutoSaveAuditLog {
    user_id: number;
    site_id: number;
    content_type: string;
    content_id: number;
    action: 'create' | 'retrieve' | 'delete' | 'conflict';
    ip_address: string; // Hashed for privacy
    user_agent_hash: string;
    timestamp: Date;
    success: boolean;
    error_code?: string;
  }
  ```
- **Security events to monitor**:
  - Repeated failed auto-save attempts (potential attack)
  - Unusual auto-save patterns (bot detection)
  - Cross-site access attempts
  - Session token reuse after expiration
- **Alert thresholds**:
  - > 5% auto-save failure rate
  - > 100 auto-saves from single IP in 1 minute
  - Any cross-site data access attempt

#### 8. WebSocket Security (HIGH)
- **Origin validation**: Strict origin checking for WebSocket connections
- **Message size limits**: Max 100KB per WebSocket message
- **Heartbeat mechanism**: Disconnect idle connections after 10 minutes
- **Prevent amplification attacks**: Rate limit broadcast messages
- **TLS enforcement**: WebSocket connections must use WSS protocol

#### 9. Conflict Resolution Security (MEDIUM)
- **Version integrity**: Cryptographically sign version numbers to prevent tampering
- **Merge validation**: Validate merged content doesn't exceed size limits
- **Permission re-verification**: Check permissions before applying conflict resolution
- **Audit conflict resolutions**: Log all merge decisions for accountability

#### 10. Error Handling & Information Disclosure (MEDIUM)
- **Generic error messages**: Never expose internal details in API responses
- **Stack trace sanitization**: Remove sensitive paths from error logs
- **Timing attack prevention**: Constant-time operations for auth checks
- **Debug mode protection**: Disable verbose logging in production

### Implementation Security Checklist
- [ ] Implement rate limiting middleware with Redis backing
- [ ] Add WebSocket authentication with periodic revalidation
- [ ] Configure database encryption with key rotation
- [ ] Implement DOMPurify for content sanitization
- [ ] Add site_id validation to all database queries
- [ ] Create GDPR compliance endpoints
- [ ] Set up security monitoring and alerting
- [ ] Implement WebSocket origin validation
- [ ] Add cryptographic signing for versions
- [ ] Configure production error handling

### Security Testing Requirements
- **Penetration testing**: Test auto-save endpoints for injection attacks
- **Load testing**: Verify rate limiting under stress
- **Session security**: Test token rotation and hijacking prevention
- **Data isolation**: Verify no cross-site data leakage
- **Encryption validation**: Confirm data encrypted at rest and in transit

## Implementation Dependencies

### Backend Dependencies
- **CV-003 VersionService**: Extend existing service for auto-save functionality
- **WebSocket Infrastructure**: socket.io for real-time collaboration
- **Redis Cache**: For auto-save caching and session management
- **Database Indexes**: New indexes for auto-save query optimization

### Frontend Dependencies
- **React Query**: For API state management and caching
- **IndexedDB API**: For offline storage (via Dexie.js)
- **Web Workers**: For content diffing and hashing
- **WebSocket Client**: For real-time updates
- **Crypto API**: For content hashing

### Infrastructure Dependencies
- **Database Migration**: Schema updates for auto-save tables
- **Memory Configuration**: Increased for auto-save caching
- **WebSocket Scaling**: Load balancer configuration
- **Monitoring**: Auto-save specific metrics and alerts

## Implementation Phases

### Phase 1: Core Auto-Save (Week 1-2)
- Extend VersionService with auto-save methods
- Implement auto-save API endpoints
- Create React auto-save hook
- Basic save status indicator
- Database schema updates

### Phase 2: Conflict Detection (Week 3)
- WebSocket integration for real-time updates
- Conflict detection service
- Basic conflict resolution UI
- Active editor tracking

### Phase 3: Offline Support (Week 4)
- IndexedDB integration
- Offline queue management
- Network state detection
- Sync on reconnection

### Phase 4: Performance & Polish (Week 5)
- Content diffing optimization
- Advanced caching strategies
- Performance monitoring
- Error handling improvements

## File Structure

### Backend Files
```
backend/src/
├── services/
│   ├── AutoSaveService.ts          # Main auto-save service
│   ├── CollaborationService.ts     # WebSocket collaboration
│   └── ConflictDetectionService.ts # Conflict handling
├── routes/
│   └── autosave.ts                 # Auto-save API endpoints
├── middleware/
│   ├── autoSaveCache.ts           # Caching middleware
│   └── autoSaveRateLimit.ts       # Rate limiting
├── types/
│   └── autosave.ts                # Auto-save type definitions
└── utils/
    ├── contentHashing.ts          # Server-side hashing
    └── contentDiffing.ts          # Diff utilities
```

### Frontend Files
```
frontend/src/
├── hooks/
│   ├── useAutoSave.ts             # Main auto-save hook
│   ├── useCollaboration.ts        # WebSocket collaboration
│   └── useAutoSaveWithRetry.ts    # Retry logic
├── components/ui/
│   ├── SaveStatusIndicator.tsx    # Status component
│   └── ConflictResolutionDialog.tsx # Conflict UI
├── services/
│   ├── autoSaveApi.ts             # API client
│   ├── OfflineStorageService.ts   # IndexedDB wrapper
│   └── WebSocketService.ts        # WebSocket client
├── utils/
│   ├── contentHashing.ts          # Client-side hashing
│   ├── contentDiffing.ts          # Diff utilities
│   └── networkDetection.ts        # Online/offline detection
└── workers/
    └── contentDiffer.worker.ts    # Web Worker for diffing
```

## MVP Implementation Plan

### Orchestrator's Analysis & Scope Refinement

After reviewing all agent contributions and existing codebase patterns, this plan focuses on delivering a **pragmatic MVP** that provides core auto-save functionality while leveraging existing infrastructure. Many complex features have been deferred to future iterations.

### MVP Core Principles
1. **Leverage existing VersionService**: Extend CV-003 infrastructure rather than creating parallel systems
2. **No WebSocket for MVP**: Use polling-based approach to avoid complex real-time infrastructure
3. **Simple conflict detection**: Basic version-number checking without complex merge UI
4. **Local storage only**: IndexedDB for offline support, no server-side caching complexity
5. **Essential UX**: Focus on save status indicator and basic recovery

### Phase 1: Essential Auto-Save (Week 1-2) - MVP ONLY

#### Backend Implementation (Simple & Focused)
**Extend VersionService.ts** - Add minimal auto-save methods:
```typescript
// Add to existing VersionService class
async createAutoSave(input: CreateVersionInput, userId: number): Promise<ServiceResponse<ContentVersion>> {
  // Reuse existing createVersion with version_type = 'auto_save'
  // Add content_hash for change detection
  // Basic cleanup (keep last 5 auto-saves)
}

async getLatestAutoSave(contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<ContentVersion | null>> {
  // Simple query for latest auto_save version
}

async hasUnsavedChanges(contentHash: string, contentType: ContentType, contentId: number, siteId: number): Promise<ServiceResponse<boolean>> {
  // Compare hash with latest version
}
```

**Simple API Routes** - Add to existing routes:
```typescript
// Add to existing backend/src/routes/versions_simple.ts
POST /api/content/:contentType/:contentId/autosave
GET /api/content/:contentType/:contentId/autosave/latest
DELETE /api/content/:contentType/:contentId/autosave/cleanup
```

**Database Updates** - Minimal schema changes:
```sql
-- Add content_hash column to existing content_versions table
ALTER TABLE content_versions ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Single index for auto-save queries
CREATE INDEX IF NOT EXISTS idx_content_versions_autosave
  ON content_versions(site_id, content_type, content_id, created_at DESC)
  WHERE version_type = 'auto_save';
```

#### Frontend Implementation (Pragmatic)
**Core Auto-Save Hook** - `frontend/src/hooks/useAutoSave.ts`:
```typescript
interface UseAutoSaveOptions {
  contentType: 'post' | 'page';
  contentId: number;
  content: any;
  interval?: number; // Default: 30000ms
  enabled?: boolean;
}

export function useAutoSave(options: UseAutoSaveOptions) {
  // 30-second interval timer
  // Content hash comparison for change detection
  // Simple retry logic (3 attempts)
  // Local storage fallback when offline
}
```

**Save Status Component** - `frontend/src/components/ui/SaveStatusIndicator.tsx`:
```typescript
interface SaveStatusIndicatorProps {
  status: 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';
  lastSaved?: Date;
  onManualSave?: () => void;
}

// Simple pill component with 4 states only:
// ✓ Saved, ⟳ Saving..., ● Unsaved changes, ⚠ Save failed
```

**Integration Points**:
- Add to existing post/page edit forms
- Use existing React Query patterns for API calls
- Integrate with existing save buttons (manual override)

### What's EXCLUDED from MVP (Future Phases)

#### Deferred: Real-Time Collaboration (Future: Phase 3)
- WebSocket infrastructure and socket.io dependency
- Live cursors and active editor indicators
- Real-time conflict notifications
- Multi-user editing sessions

#### Deferred: Advanced Conflict Resolution (Future: Phase 4)
- Visual diff interface and merge tools
- Conflict resolution dialogs
- Advanced version comparison UI
- Branching and merging workflows

#### Deferred: Performance Optimizations (Future: Phase 5)
- Content diffing and delta storage
- Redis caching layer
- Web Workers for heavy operations
- Advanced compression and batching

#### Deferred: Enterprise Features (Future: Phase 6)
- Audit logging and compliance
- Advanced GDPR controls
- Encryption at rest
- Rate limiting beyond basic protection

### MVP Success Criteria (Focused)
- [ ] Content auto-saves every 30 seconds when changed
- [ ] Save status indicator shows current state
- [ ] Manual save (Ctrl+S) works and cancels auto-save timer
- [ ] Basic recovery after page reload from localStorage
- [ ] No performance impact > 100ms per keystroke
- [ ] Basic error handling with retry
- [ ] Works with existing post/page editing workflows

### Implementation Priority
1. **Week 1**: Backend auto-save methods + API endpoints
2. **Week 1**: Database schema update + basic testing
3. **Week 2**: Frontend hook + save status component
4. **Week 2**: Integration with existing edit forms
5. **Week 2**: Basic e2e testing + polish

### Technical Debt Acknowledged
- Polling-based approach will be replaced with WebSocket in Phase 3
- Simple localStorage will be enhanced with IndexedDB in future
- Basic conflict detection will be enhanced with proper merge UI
- Performance optimizations deferred until usage patterns understood

This MVP provides **essential auto-save functionality** with **minimal complexity** and **maximum compatibility** with existing systems. Future phases will add sophistication as usage patterns emerge and infrastructure needs become clear.

## Related Tickets
- **CV-006**: Save indicator UI component (included in Phase 1)
- **CV-007**: Conflict resolution UI (deferred to Phase 4)
- **CV-008**: WebSocket implementation (deferred to Phase 3)
- **CV-009**: Performance monitoring and metrics (deferred to Phase 5)
- **CV-010**: Auto-save configuration and settings (deferred to Phase 6)