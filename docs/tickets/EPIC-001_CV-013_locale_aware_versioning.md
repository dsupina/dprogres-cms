# CV-013: Locale-Aware Versioning

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** High
**Status:** TODO

## User Story
As a **content creator working across multiple locales**, I want the versioning system to track and manage localized content versions, so that I can maintain separate version histories for each locale and ensure proper fallback chains when content is not available in a specific language.

## Background
The multi-site architecture supports multiple locales per site, with content that can be localized for different languages and regions. The versioning system needs to be aware of these locales to properly track changes, manage translations, and handle locale fallbacks according to the site's configuration.

## Requirements

### Functional Requirements
- Track versions separately for each locale
- Support locale fallback chains for missing content
- Show translation status between locale versions
- Enable copying versions between locales
- Track which locales have pending changes
- Support locale-specific preview tokens
- Maintain locale consistency in version history
- Handle RTL languages appropriately

### Technical Requirements
- Locale field in all version tables
- Efficient locale-based queries
- Support for locale fallback logic
- Translation status tracking
- Locale-aware caching strategy
- Performance optimization for multi-locale queries

## Acceptance Criteria
- [ ] Versions are stored with locale information
- [ ] Locale fallback chain works correctly (e.g., hr-HR → hr → en-US)
- [ ] Translation status is visible in version list
- [ ] Content can be copied between locales
- [ ] Preview tokens respect locale settings
- [ ] Version comparison works across locales
- [ ] Locale-specific publish workflows function correctly
- [ ] Performance remains optimal with multiple locales

## Implementation Details

### Database Schema Updates
```sql
-- Already added in CV-001 migration:
-- locale VARCHAR(10) in content_versions
-- locale VARCHAR(10) in preview_tokens

-- Additional translation tracking
CREATE TABLE IF NOT EXISTS version_translations (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id),
    content_type VARCHAR(50) NOT NULL,
    content_id INTEGER NOT NULL,
    source_locale VARCHAR(10) NOT NULL,
    target_locale VARCHAR(10) NOT NULL,
    source_version_id INTEGER REFERENCES content_versions(id),
    target_version_id INTEGER REFERENCES content_versions(id),
    translation_status VARCHAR(20) DEFAULT 'pending',
    translated_at TIMESTAMP,
    translated_by INTEGER REFERENCES users(id),
    UNIQUE(site_id, content_type, content_id, source_locale, target_locale)
);
```

### Locale Fallback Logic
```typescript
interface LocaleFallbackChain {
  site_id: number;
  requested_locale: string;
  fallback_chain: string[];
}

// Example: Croatian site
// Request: hr-HR → [hr-HR, hr, en-US]
// Request: hr → [hr, en-US]

function getVersionWithFallback(
  site_id: number,
  content_type: string,
  content_id: number,
  locale: string
): ContentVersion | null {
  const fallbackChain = getLocaleFallbackChain(site_id, locale);

  for (const fallbackLocale of fallbackChain) {
    const version = getVersion(site_id, content_type, content_id, fallbackLocale);
    if (version) return version;
  }

  return null;
}
```

### Translation Management
```typescript
interface TranslationStatus {
  locale: string;
  has_draft: boolean;
  has_published: boolean;
  last_updated: Date;
  is_outdated: boolean;
  source_locale?: string;
}

interface ContentTranslationOverview {
  content_type: string;
  content_id: number;
  site_id: number;
  translations: TranslationStatus[];
  primary_locale: string;
}
```

### Preview Token Locale Support
- Include locale in preview URL structure
- Respect locale fallback in preview rendering
- Show locale selector in preview frame
- Support side-by-side locale comparison

### API Endpoints
```typescript
// Get version with locale fallback
GET /api/sites/{site_id}/versions/{content_type}/{content_id}?locale=hr-HR

// Get translation status
GET /api/sites/{site_id}/translations/{content_type}/{content_id}

// Copy version to another locale
POST /api/sites/{site_id}/versions/{version_id}/copy-to-locale
{
  "target_locale": "hr-HR",
  "mark_as_translation": true
}

// Get all locales with versions
GET /api/sites/{site_id}/versions/{content_type}/{content_id}/locales
```

## Testing Considerations
- Test fallback chain with missing locales
- Verify translation status tracking
- Test RTL language support
- Performance with 10+ locales
- Concurrent updates to different locales
- Preview token generation for each locale

## Documentation Requirements
- Locale fallback configuration guide
- Translation workflow documentation
- API examples for locale operations
- Performance best practices for multi-locale

## Dependencies
- CV-001: Database schema with locale support
- CV-012: Multi-site migration completed
- Site locale configuration system
- Translation service integration (future)

## Success Metrics
- 100% of versions have locale information
- Fallback chain resolution < 50ms
- Zero locale-related data inconsistencies
- Translation status accuracy > 99%

## Related Tickets
- CV-001: Version Storage Database Schema
- CV-012: Multi-Site Version Migration
- CV-006: Preview Token System (needs locale support)