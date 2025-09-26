#!/bin/bash

# Script to create GitHub issues for Content Versioning & Draft Preview System
# Prerequisites: Install GitHub CLI (gh) - https://cli.github.com/
# Usage: ./scripts/create-github-issues.sh

echo "Creating GitHub issues for Content Versioning & Draft Preview System..."
echo "Make sure you're authenticated with GitHub CLI (gh auth login)"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed. Please install it first:"
    echo "https://cli.github.com/"
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Not in a git repository. Please run this script from the project root."
    exit 1
fi

echo "Creating issues..."

# Issue 1
gh issue create \
  --title "TICKET-CV-001: Create database migration for versioning tables" \
  --label "enhancement,database,priority:high,phase-1" \
  --body "### Phase 1: Database Schema
#### Description
Create and execute database migration script for content versioning infrastructure.

#### Tasks
- [ ] Create migration file \`migrations/001_content_versioning.sql\`
- [ ] Define \`content_versions\` table with all required fields
- [ ] Define \`version_comments\` table for collaboration
- [ ] Define \`preview_tokens\` table for secure sharing
- [ ] Create necessary indexes for performance
- [ ] Add foreign key constraints
- [ ] Create triggers for updated_at timestamps
- [ ] Write rollback script

#### Acceptance Criteria
- [ ] Migration runs without errors
- [ ] All tables created with correct schema
- [ ] Indexes properly defined
- [ ] Constraints enforced correctly
- [ ] Rollback script successfully reverts changes

**Estimated Time:** 4 hours"

# Issue 2
gh issue create \
  --title "TICKET-CV-002: Update TypeScript types and models" \
  --label "enhancement,backend,priority:high,phase-1" \
  --body "### Phase 1: Database Schema
#### Description
Create TypeScript interfaces and types for versioning system.

#### Tasks
- [ ] Create \`ContentVersion\` interface
- [ ] Create \`PreviewToken\` interface
- [ ] Create \`VersionComment\` interface
- [ ] Define enums for version types and statuses
- [ ] Update existing content types to reference versions
- [ ] Create API request/response types

#### Acceptance Criteria
- [ ] All types properly exported
- [ ] Types match database schema exactly
- [ ] No TypeScript compilation errors
- [ ] Types documented with JSDoc

**Estimated Time:** 2 hours"

# Issue 3
gh issue create \
  --title "TICKET-CV-003: Implement VersionService" \
  --label "enhancement,backend,priority:high,phase-2" \
  --body "### Phase 2: Core Versioning API
#### Description
Create core service class for version management operations.

#### Tasks
- [ ] Create \`VersionService\` class
- [ ] Implement \`createVersion()\` method
- [ ] Implement \`getVersions()\` method
- [ ] Implement \`getVersion()\` method
- [ ] Implement \`updateVersion()\` method
- [ ] Implement \`publishVersion()\` method
- [ ] Implement \`revertToVersion()\` method
- [ ] Implement \`deleteVersion()\` method
- [ ] Add transaction support for critical operations

#### Acceptance Criteria
- [ ] All methods have proper error handling
- [ ] Database transactions used where appropriate
- [ ] Service methods return proper types
- [ ] Unit tests cover all methods
- [ ] Test coverage > 90%

**Estimated Time:** 8 hours"

# Issue 4
gh issue create \
  --title "TICKET-CV-004: Create versioning API endpoints" \
  --label "enhancement,backend,api,phase-2" \
  --body "### Phase 2: Core Versioning API
#### Description
Implement REST API endpoints for version management.

#### Tasks
- [ ] Create \`/api/versions\` route file
- [ ] Implement \`GET /api/versions/:contentType/:contentId\`
- [ ] Implement \`POST /api/versions/:contentType/:contentId\`
- [ ] Implement \`PUT /api/versions/:versionId\`
- [ ] Implement \`POST /api/versions/:versionId/publish\`
- [ ] Implement \`POST /api/versions/:versionId/revert\`
- [ ] Implement \`DELETE /api/versions/:versionId\`
- [ ] Add Joi validation schemas
- [ ] Add authentication middleware

#### Acceptance Criteria
- [ ] All endpoints return correct status codes
- [ ] Input validation working properly
- [ ] Authentication required for all endpoints
- [ ] API documentation updated
- [ ] Integration tests passing

**Estimated Time:** 6 hours"

# Issue 5
gh issue create \
  --title "TICKET-CV-005: Add version middleware and permissions" \
  --label "enhancement,security,backend,phase-2" \
  --body "### Phase 2: Core Versioning API
#### Description
Implement security middleware for version access control.

#### Tasks
- [ ] Create \`versionAuth\` middleware
- [ ] Implement ownership checks
- [ ] Add role-based permissions
- [ ] Create \`canPublish\` permission check
- [ ] Create \`canDelete\` permission check
- [ ] Add rate limiting for version operations

#### Acceptance Criteria
- [ ] Only version owners can edit drafts
- [ ] Only authorized users can publish
- [ ] Rate limiting prevents abuse
- [ ] Permission denied returns 403
- [ ] All security tests passing

**Estimated Time:** 4 hours"

# Issue 6
gh issue create \
  --title "TICKET-CV-006: Implement AutoSaveService" \
  --label "enhancement,backend,phase-3" \
  --body "### Phase 3: Auto-save Functionality
#### Description
Create service for automatic content saving.

#### Tasks
- [ ] Create \`AutoSaveService\` class
- [ ] Implement \`autoSave()\` method
- [ ] Implement \`getLatestAutoSave()\` method
- [ ] Implement \`cleanupOldAutoSaves()\` method
- [ ] Add conflict detection logic
- [ ] Create background job for cleanup

#### Acceptance Criteria
- [ ] Auto-saves create version with type 'auto_save'
- [ ] Only keeps last 5 auto-saves per content
- [ ] Cleanup job runs every hour
- [ ] No data loss during auto-save
- [ ] Performance impact < 100ms

**Estimated Time:** 6 hours"

# Issue 7
gh issue create \
  --title "TICKET-CV-007: Create auto-save API endpoints" \
  --label "enhancement,backend,api,phase-3" \
  --body "### Phase 3: Auto-save Functionality
#### Description
Implement REST endpoints for auto-save operations.

#### Tasks
- [ ] Create \`/api/autosave\` route file
- [ ] Implement \`POST /api/autosave/:contentType/:contentId\`
- [ ] Implement \`GET /api/autosave/:contentType/:contentId/latest\`
- [ ] Add debouncing logic
- [ ] Add WebSocket support for real-time sync

#### Acceptance Criteria
- [ ] Auto-save completes in < 500ms
- [ ] Debouncing prevents excessive saves
- [ ] WebSocket notifies other users
- [ ] Handles concurrent edits gracefully

**Estimated Time:** 4 hours"

# Issue 8
gh issue create \
  --title "TICKET-CV-008: Implement PreviewService" \
  --label "enhancement,backend,phase-4" \
  --body "### Phase 4: Preview Token System
#### Description
Create service for preview token generation and validation.

#### Tasks
- [ ] Create \`PreviewService\` class
- [ ] Implement \`generatePreviewToken()\` method
- [ ] Implement \`validateToken()\` method
- [ ] Implement \`getVersionByToken()\` method
- [ ] Implement \`revokeToken()\` method
- [ ] Add token expiration logic
- [ ] Create cleanup job for expired tokens

#### Acceptance Criteria
- [ ] Tokens are cryptographically secure
- [ ] Expired tokens are rejected
- [ ] Access count limits enforced
- [ ] Token cleanup runs daily
- [ ] Preview loads in < 1 second

**Estimated Time:** 5 hours"

# Issue 9
gh issue create \
  --title "TICKET-CV-009: Create preview API endpoints" \
  --label "enhancement,backend,api,phase-4" \
  --body "### Phase 4: Preview Token System
#### Description
Implement REST endpoints for preview functionality.

#### Tasks
- [ ] Create \`/api/preview\` route file
- [ ] Implement \`POST /api/preview/:versionId/token\`
- [ ] Implement \`GET /api/preview/:token\`
- [ ] Implement \`DELETE /api/preview/:tokenId\`
- [ ] Add preview rendering logic
- [ ] Add caching for preview content

#### Acceptance Criteria
- [ ] Preview URLs work without authentication
- [ ] Token validation is fast (< 50ms)
- [ ] Preview content is properly cached
- [ ] Revoked tokens immediately invalid

**Estimated Time:** 4 hours"

# Issue 10
gh issue create \
  --title "TICKET-CV-010: Create VersionManager component" \
  --label "enhancement,frontend,ui,phase-5" \
  --body "### Phase 5: Frontend UI Components
#### Description
Build main version management UI component.

#### Tasks
- [ ] Create \`VersionManager.tsx\` component
- [ ] Implement version list display
- [ ] Add version selection logic
- [ ] Add publish/revert buttons
- [ ] Implement status badges
- [ ] Add loading and error states
- [ ] Create responsive layout

#### Acceptance Criteria
- [ ] Component renders version list correctly
- [ ] Selection updates current version
- [ ] Actions trigger appropriate API calls
- [ ] Responsive on mobile devices
- [ ] Accessibility standards met

**Estimated Time:** 6 hours"

# Issue 11
gh issue create \
  --title "TICKET-CV-011: Create DraftEditor component" \
  --label "enhancement,frontend,ui,phase-5" \
  --body "### Phase 5: Frontend UI Components
#### Description
Build enhanced editor with versioning support.

#### Tasks
- [ ] Create \`DraftEditor.tsx\` component
- [ ] Integrate with existing editor
- [ ] Add auto-save functionality
- [ ] Show save status indicator
- [ ] Add version selector dropdown
- [ ] Implement unsaved changes warning

#### Acceptance Criteria
- [ ] Auto-saves every 30 seconds
- [ ] Save status visible to user
- [ ] Warns before leaving with unsaved changes
- [ ] Integrates with Quill editor
- [ ] No data loss on browser crash

**Estimated Time:** 8 hours"

# Issue 12
gh issue create \
  --title "TICKET-CV-012: Create PreviewFrame component" \
  --label "enhancement,frontend,ui,phase-5" \
  --body "### Phase 5: Frontend UI Components
#### Description
Build preview display component.

#### Tasks
- [ ] Create \`PreviewFrame.tsx\` component
- [ ] Implement iframe rendering
- [ ] Add responsive preview modes
- [ ] Add loading states
- [ ] Implement error handling
- [ ] Add device preview options

#### Acceptance Criteria
- [ ] Preview renders in isolated iframe
- [ ] Responsive preview modes work
- [ ] Loading state shown during fetch
- [ ] Errors handled gracefully
- [ ] Preview updates in real-time

**Estimated Time:** 4 hours"

# Issue 13
gh issue create \
  --title "TICKET-CV-013: Create version status components" \
  --label "enhancement,frontend,ui,phase-5" \
  --body "### Phase 5: Frontend UI Components
#### Description
Build status indicators and badges.

#### Tasks
- [ ] Create \`VersionStatusBadge.tsx\`
- [ ] Create \`AutoSaveIndicator.tsx\`
- [ ] Create \`VersionCounter.tsx\`
- [ ] Add animation for saving state
- [ ] Implement color coding for statuses

#### Acceptance Criteria
- [ ] Status badges show correct state
- [ ] Auto-save indicator animates during save
- [ ] Version counter shows accurate count
- [ ] Colors follow design system
- [ ] Components are reusable

**Estimated Time:** 3 hours"

# Issue 14
gh issue create \
  --title "TICKET-CV-014: Implement version comparison logic" \
  --label "enhancement,backend,phase-6" \
  --body "### Phase 6: Version Comparison
#### Description
Create diff generation and comparison functionality.

#### Tasks
- [ ] Create \`ContentDiffUtils\` utility
- [ ] Implement text diff algorithm
- [ ] Implement structured data diff
- [ ] Add diff formatting logic
- [ ] Calculate change scores
- [ ] Add performance optimizations

#### Acceptance Criteria
- [ ] Diffs generated in < 500ms
- [ ] Accurate change detection
- [ ] Human-readable diff output
- [ ] Handles large documents
- [ ] Memory efficient

**Estimated Time:** 6 hours"

# Issue 15
gh issue create \
  --title "TICKET-CV-015: Create VersionComparison component" \
  --label "enhancement,frontend,ui,phase-6" \
  --body "### Phase 6: Version Comparison
#### Description
Build UI for comparing versions side-by-side.

#### Tasks
- [ ] Create \`VersionComparison.tsx\` component
- [ ] Implement side-by-side view
- [ ] Implement unified diff view
- [ ] Add diff highlighting
- [ ] Add navigation between changes
- [ ] Create diff statistics display

#### Acceptance Criteria
- [ ] Both view modes functional
- [ ] Changes clearly highlighted
- [ ] Navigation jumps to changes
- [ ] Statistics accurate
- [ ] Performance with large diffs

**Estimated Time:** 8 hours"

# Issue 16
gh issue create \
  --title "TICKET-CV-016: Implement CommentService" \
  --label "enhancement,backend,phase-7" \
  --body "### Phase 7: Comment System
#### Description
Create service for version comments.

#### Tasks
- [ ] Create \`CommentService\` class
- [ ] Implement CRUD operations
- [ ] Add comment threading support
- [ ] Create notification system
- [ ] Add comment type categorization

#### Acceptance Criteria
- [ ] Comments linked to versions
- [ ] Threading works correctly
- [ ] Notifications sent on new comments
- [ ] Comment types enforced
- [ ] Proper authorization checks

**Estimated Time:** 5 hours"

# Issue 17
gh issue create \
  --title "TICKET-CV-017: Create comment UI components" \
  --label "enhancement,frontend,ui,phase-7" \
  --body "### Phase 7: Comment System
#### Description
Build comment display and input components.

#### Tasks
- [ ] Create \`VersionComments.tsx\` component
- [ ] Create \`CommentItem.tsx\` component
- [ ] Create \`CommentForm.tsx\` component
- [ ] Add comment threading UI
- [ ] Implement edit/delete functionality

#### Acceptance Criteria
- [ ] Comments display in threads
- [ ] Users can add/edit/delete own comments
- [ ] Comment types selectable
- [ ] Real-time updates via WebSocket
- [ ] Markdown support in comments

**Estimated Time:** 6 hours"

# Issue 18
gh issue create \
  --title "TICKET-CV-018: Implement Redis caching" \
  --label "enhancement,performance,backend,phase-8" \
  --body "### Phase 8: Performance & Caching
#### Description
Add Redis caching layer for versions.

#### Tasks
- [ ] Set up Redis connection
- [ ] Implement version caching
- [ ] Implement diff caching
- [ ] Implement preview caching
- [ ] Add cache invalidation logic
- [ ] Create cache warming strategy

#### Acceptance Criteria
- [ ] Cache hit rate > 80%
- [ ] Cache invalidation works correctly
- [ ] TTLs properly configured
- [ ] Memory usage within limits
- [ ] Fallback to database on cache miss

**Estimated Time:** 6 hours"

# Issue 19
gh issue create \
  --title "TICKET-CV-019: Add performance monitoring" \
  --label "enhancement,monitoring,phase-8" \
  --body "### Phase 8: Performance & Caching
#### Description
Implement performance tracking and monitoring.

#### Tasks
- [ ] Add API response time logging
- [ ] Track version operation metrics
- [ ] Monitor cache performance
- [ ] Add database query profiling
- [ ] Create performance dashboard

#### Acceptance Criteria
- [ ] All operations tracked
- [ ] Metrics exported to monitoring system
- [ ] Alerts configured for slowdowns
- [ ] Dashboard shows real-time metrics
- [ ] Historical data retained

**Estimated Time:** 4 hours"

# Issue 20
gh issue create \
  --title "TICKET-CV-020: End-to-end testing and documentation" \
  --label "testing,documentation,phase-8" \
  --body "### Phase 8: Performance & Caching
#### Description
Complete E2E testing and documentation.

#### Tasks
- [ ] Write E2E tests for version workflow
- [ ] Write E2E tests for auto-save
- [ ] Write E2E tests for preview
- [ ] Update API documentation
- [ ] Create user guide
- [ ] Record demo video

#### Acceptance Criteria
- [ ] E2E tests cover all workflows
- [ ] Tests run in CI pipeline
- [ ] Documentation complete and accurate
- [ ] User guide includes screenshots
- [ ] Demo video < 5 minutes

**Estimated Time:** 8 hours"

echo ""
echo "✅ All 20 issues created successfully!"
echo ""
echo "Next steps:"
echo "1. Go to your GitHub repository's Issues tab"
echo "2. Review and assign issues to team members"
echo "3. Add issues to project board"
echo "4. Create milestones for each phase"