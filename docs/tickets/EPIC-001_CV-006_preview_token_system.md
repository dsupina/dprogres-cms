# CV-006: Preview Token System

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** High
**Status:** TODO

## User Story
As a **content creator**, I want to generate secure, shareable preview links for my draft content that work across multiple sites and domains, so that stakeholders can review my work on the correct domain without needing CMS access.

## Background
Currently, sharing drafts requires giving people CMS access or sending screenshots/PDFs. A preview token system allows creators to generate temporary, secure links that anyone can view without authentication, making the review process much smoother.

## Requirements

### Functional Requirements
- Generate unique, secure preview links per site/domain
- Support multi-domain preview rendering
- Include locale in preview context
- Set expiration time for links (1 hour to 30 days)
- Optional password protection
- Limit number of views (optional)
- Revoke links instantly
- Track who viewed and when with site context
- Generate QR codes for mobile preview
- Support different device preview modes
- Respect site-specific theme and settings

### Technical Requirements
- Cryptographically secure tokens
- Token validation without database lookup (JWT)
- Efficient token storage and cleanup
- Preview rendering isolation
- CDN-friendly preview URLs
- Rate limiting on generation

## Acceptance Criteria
- [ ] Preview links generated in < 2 seconds
- [ ] Tokens are unguessable (crypto secure)
- [ ] Expired tokens show friendly error page
- [ ] View count limits enforced
- [ ] Password protection works
- [ ] Analytics track all views
- [ ] Tokens can be revoked immediately
- [ ] QR code generation works
- [ ] Device preview modes accurate
- [ ] Cleanup job removes expired tokens

## Implementation Details

### Token Generation

**Token Structure**
```
https://[domain]/preview/[token]?locale=[locale]
Token: base64url(encrypt(siteId + versionId + expires + secret))

Examples:
https://dprogres.hr/preview/abc123?locale=hr-HR
https://dprogres.com/preview/xyz789?locale=en-US
```

**PreviewService Methods**
- `generateToken()` - Create preview token
- `validateToken()` - Check token validity
- `getVersionByToken()` - Retrieve content
- `revokeToken()` - Invalidate token
- `trackAccess()` - Log preview access
- `cleanupExpired()` - Remove old tokens

### Preview Options
```typescript
interface PreviewOptions {
  siteId: number;
  domainId?: number;
  locale?: string;
  expiresIn: '1h' | '24h' | '7d' | '30d';
  maxViews?: number;
  password?: string;
  allowedEmails?: string[];
  allowedDomains?: string[];
  devicePreview?: 'desktop' | 'tablet' | 'mobile';
  trackAnalytics: boolean;
}
```

### Security Features
- Token signing with secret
- IP-based rate limiting
- Referrer checking (optional)
- Password protection
- Email whitelist
- Access logging

### Preview UI Features

**Preview Share Dialog**
- Expiration selector
- Password protection toggle
- View limit setting
- QR code display
- Copy link button
- Email share button

**Preview Page**
- Device frame options
- Responsive preview
- "Exit preview" banner
- Version information
- Feedback collection

### Analytics Tracking
- View timestamp
- Viewer IP (hashed)
- Referrer URL
- Device/browser info
- Time on page
- Feedback submitted

## Testing Considerations
- Token uniqueness testing
- Expiration enforcement
- Password protection
- View limit enforcement
- Performance with many tokens
- Security penetration testing

## Documentation Requirements
- Preview link user guide
- Security best practices
- Analytics interpretation
- API documentation

## Dependencies
- CV-003: Version service
- Token generation library
- QR code library
- Analytics service

## Related Tickets
- CV-007: Preview UI components
- CV-008: Preview analytics dashboard
- CV-009: Device preview frames