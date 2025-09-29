# Component Catalog

This document catalogs all reusable components in the codebase with usage examples and implementation patterns.

## Frontend Components

### UI Components (`frontend/src/components/ui/`)

#### RichTextEditor
**Purpose**: WYSIWYG editor for content creation with image upload support
**Location**: `frontend/src/components/ui/RichTextEditor.tsx`
**Dependencies**: react-quill, mediaService

```tsx
// Usage Example
<RichTextEditor
  value={content}
  onChange={setContent}
  placeholder="Start writing..."
  className="min-h-[300px]"
/>
```

**Key Features**:
- Image upload with validation
- Toolbar customization
- Error handling for failed uploads
- File size validation (50MB max)

---

#### DataTable
**Purpose**: Reusable data grid with sorting, filtering, and actions
**Location**: `frontend/src/components/ui/DataTable.tsx`
**Status**: Recently added, needs integration

```tsx
// Usage Example
<DataTable
  data={items}
  columns={columns}
  onSort={handleSort}
  onFilter={handleFilter}
/>
```

---

#### Modal
**Purpose**: Generic modal dialog component
**Location**: `frontend/src/components/ui/Modal.tsx`
**Status**: Recently added, needs integration

```tsx
// Usage Example
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Confirm Action"
>
  <p>Are you sure?</p>
</Modal>
```

---

### Admin Components (`frontend/src/components/admin/`)

#### MenuBuilder
**Purpose**: Drag-and-drop hierarchical menu builder
**Location**: `frontend/src/components/admin/MenuBuilder.tsx`
**Dependencies**: @dnd-kit/sortable

```tsx
// Usage Example
<MenuBuilder
  items={menuItems}
  onChange={handleMenuChange}
  onSave={saveMenu}
/>
```

**Key Features**:
- Nested menu support (up to 3 levels)
- Drag-and-drop reordering
- Real-time preview
- Link type validation

---

#### DomainSelector
**Purpose**: Domain selection dropdown for multi-site management
**Location**: `frontend/src/components/admin/DomainSelector.tsx`

```tsx
// Usage Example
<DomainSelector
  value={selectedDomain}
  onChange={setSelectedDomain}
  domains={availableDomains}
/>
```

---

### Diff Components (`frontend/src/components/admin/diff/`)

#### VersionComparison
**Purpose**: Main component for comparing two content versions
**Location**: `frontend/src/components/admin/diff/VersionComparison.tsx`

```tsx
// Usage Example
<VersionComparison
  leftVersionId={1}
  rightVersionId={2}
  onClose={handleClose}
/>
```

**Key Features**:
- Three view modes (side-by-side, unified, inline)
- Keyboard navigation (n/p for changes)
- Export to PDF/HTML/JSON
- Change statistics display

---

#### DiffViewer
**Purpose**: Renders diffs with syntax highlighting
**Location**: `frontend/src/components/admin/diff/DiffViewer.tsx`

```tsx
// Usage Example
<DiffViewer
  diffResult={diffData}
  viewMode="side-by-side"
  highlightLevel="line"
  showMetadata={true}
  currentChangeIndex={0}
/>
```

---

#### ChangeNavigator
**Purpose**: Navigate between changes with keyboard shortcuts
**Location**: `frontend/src/components/admin/diff/ChangeNavigator.tsx`

```tsx
// Usage Example
<ChangeNavigator
  currentIndex={0}
  totalChanges={15}
  onNavigate={handleNavigate}
/>
```

---

#### ChangeStatistics
**Purpose**: Display change metrics and statistics
**Location**: `frontend/src/components/admin/diff/ChangeStatistics.tsx`

```tsx
// Usage Example
<ChangeStatistics
  statistics={diffStatistics}
  onClose={handleClose}
/>
```

---

## Backend Components

### Middleware

#### Auth Middleware
**Purpose**: JWT token validation and user authentication
**Location**: `backend/src/middleware/auth.ts`

```typescript
// Usage
router.get('/protected', auth, (req, res) => {
  // req.user is available here
});
```

---

#### Site Resolver Middleware
**Purpose**: Multi-domain/site resolution based on hostname
**Location**: `backend/src/middleware/siteResolver.ts`

```typescript
// Applied globally in index.ts
app.use(siteResolver);
// req.site and req.domain available in all routes
```

---

#### Validation Middleware
**Purpose**: Request body validation using Joi schemas
**Location**: `backend/src/middleware/validation.ts`

```typescript
// Usage
router.post('/api/posts',
  auth,
  validation(postSchema),
  createPost
);
```

---

### Services

#### Version Service (CV-003)
**Purpose**: Comprehensive content versioning and management
**Location**: `backend/src/services/VersionService.ts`

```typescript
// Key Methods
versionService.createVersion(input, userId, context)
versionService.autoSave(input, userId)
versionService.publishVersion(versionId, userId)
versionService.revertToVersion(versionNumber, context)
```

**Key Features**:
- 30+ specialized version management methods
- Event-driven architecture
- Security and performance optimizations
- Multi-site support

---

#### Preview Service (CV-006)
**Purpose**: Secure content preview token generation and management
**Location**: `backend/src/services/PreviewService.ts`

```typescript
// Key Methods
previewService.generatePreviewToken(config, userId)
previewService.validatePreviewToken(token, context)
previewService.revokePreviewToken(tokenId, userId)
```

**Key Features**:
- JWT+AES hybrid encryption
- Fine-grained token controls
- Site-specific preview access
- Comprehensive audit logging

---

#### Diff Service (CV-007)
**Purpose**: Version comparison and diff computation with multiple algorithms
**Location**: `backend/src/services/DiffService.ts`

```typescript
// Key Methods
diffService.compareVersions(versionId1, versionId2, userId, options)
diffService.generateTextDiff(text1, text2, granularity)
diffService.generateStructuralDiff(html1, html2)
diffService.generateMetadataDiff(version1, version2)
diffService.exportDiff(diff, format, options)
```

**Key Features**:
- Multiple diff algorithms (Myers, Patience, Histogram, Semantic)
- Text, structural, and metadata comparison
- LRU caching with 100-item limit
- Export to PDF/HTML/JSON formats
- Site isolation and security validation

---

#### Site Service
**Purpose**: Multi-site management and domain operations
**Location**: `backend/src/services/siteService.ts`

```typescript
// Key Methods
siteService.getSiteByDomain(hostname)
siteService.createSite(data)
siteService.updateSiteSettings(siteId, settings)
```

---

#### Domain Service
**Purpose**: Domain verification and management
**Location**: `backend/src/services/domainService.ts`

```typescript
// Key Methods
domainService.verifyDomain(domain, token)
domainService.setDefaultDomain(domainId)
domainService.getDomainsBysite(siteId)
```

---

## Database Components

### Core Tables
- `users` - Authentication and user management
- `posts` - Blog posts with SEO fields
- `pages` - Static pages with template support
- `categories` - Content categorization
- `media_files` - Uploaded file metadata
- `domains` - Multi-domain support
- `sites` - Multi-site configuration
- `menu_items` - Navigation menus

### Versioning Tables (CV-003)
- `content_versions`
  - Tracks all content version states
  - Supports multi-site, multi-content type versioning
  - Includes metadata for audit and tracking
- `version_audit_log`
  - Comprehensive operation logging
  - Tracks all version-related actions

### Preview Token Tables (CV-006)
- `preview_tokens`
  - Secure token storage
  - Supports granular access controls
  - Site and version specific tokens
- `preview_analytics`
  - Partitioned tracking table
  - Captures token usage and preview interactions
- `preview_feedback`
  - Optional user feedback collection
  - Enables qualitative preview tracking

### Utility Functions

#### Password Utils
**Location**: `backend/src/utils/password.ts`
```typescript
hashPassword(plaintext: string): Promise<string>
comparePassword(plaintext: string, hash: string): Promise<boolean>
```

#### JWT Utils
**Location**: `backend/src/utils/jwt.ts`
```typescript
generateToken(payload: object): string
verifyToken(token: string): object
generateRefreshToken(payload: object): string
```

#### Slug Utils
**Location**: `backend/src/utils/slug.ts`
```typescript
generateSlug(text: string): string
ensureUniqueSlug(slug: string, table: string): Promise<string>
```

---

## Form Components & Patterns

### Post Form Pattern
**Location**: `frontend/src/pages/admin/PostNewPage.tsx`
- React Hook Form integration
- Validation with error display
- Auto-save draft functionality
- SEO fields management

### Settings Form Pattern
**Location**: `frontend/src/pages/admin/SettingsPage.tsx`
- Key-value pair management
- Optimistic updates
- Toast notifications

---

## Testing Components

### Test Utilities
**Location**: `frontend/src/__tests__/test-utils.tsx`
- Custom render with providers
- Mock service factories
- Common test fixtures

---

## Component Development Guidelines

1. **Component Structure**:
   - Props interface defined
   - Default props where applicable
   - Error boundaries for complex components
   - Loading states handled

2. **Styling Approach**:
   - Tailwind CSS classes
   - Avoid inline styles
   - Use clsx for conditional classes
   - Responsive by default

3. **State Management**:
   - React Query for server state
   - Zustand for auth state
   - Local state for UI-only concerns
   - Form state with react-hook-form

4. **Testing Requirements**:
   - Unit tests for logic
   - Integration tests for API calls
   - Accessibility testing
   - Error case coverage

5. **Documentation**:
   - JSDoc comments for complex functions
   - Usage examples in this file
   - Props documentation
   - Known limitations noted