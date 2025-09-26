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