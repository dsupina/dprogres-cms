# CV-003: Enhanced Version Management Service Implementation Guide

## Overview

This document provides a comprehensive guide to the CV-003 Enhanced Version Management Service implementation. The service builds upon the existing VersionService foundation to provide enterprise-grade security, performance, and multi-site support.

## Key Enhancements

### 1. Security Features
- **Site Isolation Enforcement**: All operations validate site ownership before execution
- **Input Sanitization**: Content is sanitized using DOMPurify to prevent XSS attacks
- **Audit Logging**: Comprehensive audit trail for compliance (GDPR, SOC2, CCPA)
- **PII Detection**: Automatic classification of content containing sensitive data
- **Access Control**: Role-based permission validation

### 2. Performance Optimizations
- **Caching Layer**: In-memory caching for frequently accessed versions
- **Batch Operations**: Bulk version operations to reduce database round-trips
- **Query Optimization**: Efficient database queries with proper indexing
- **Memory Management**: Streaming support for large content versions
- **Auto-pruning**: Automatic cleanup of old auto-save versions

### 3. Enhanced Functionality
- **Event System**: Lifecycle event hooks for version operations
- **Metrics & Observability**: Performance tracking and health indicators
- **Advanced Diffing**: Line-by-line content comparison
- **Conflict Detection**: Optimistic locking and concurrent edit detection
- **Multi-site Support**: Proper data isolation across multiple sites

## Architecture Components

### Core Service Class: VersionService

The enhanced VersionService extends EventEmitter to provide:

```typescript
export class VersionService extends EventEmitter {
  // Security validation
  async validateSiteAccess(siteId: number, userId: number)
  async sanitizeVersionInput(input: CreateVersionInput)

  // Enhanced operations
  async createVersion(input, userId, options?)
  async createDraft(input, userId, options?)
  async autoSave(input, userId, options?)

  // Metrics and monitoring
  async getVersionMetrics(siteId, contentType?, contentId?)
  async pruneOldAutoSaves(siteId, contentType, contentId)

  // Event system
  onVersionCreated(handler)
  onVersionPublished(handler)
  onVersionArchived(handler)
}
```

### Database Schema Additions

#### Audit Log Table (`version_audit_log`)
```sql
CREATE TABLE version_audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    version_id INTEGER NOT NULL REFERENCES content_versions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    site_id INTEGER NOT NULL REFERENCES sites(id),
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    data_classification VARCHAR(20) DEFAULT 'internal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Security Classifications

The service automatically classifies content based on detected patterns:

- **PUBLIC**: General content safe for public viewing
- **INTERNAL**: Standard internal content
- **CONFIDENTIAL**: Sensitive business information
- **RESTRICTED**: Contains PII, financial, or health data
- **SECRET**: Passwords, tokens, encryption keys

### Performance Metrics

The service tracks key performance indicators:

- Version creation latency (target: <100ms p95)
- Version publishing latency (target: <500ms p95)
- Database connection pool utilization
- Cache hit/miss ratios
- Storage usage by site and content type

## Implementation Details

### 1. Site Isolation

Every operation validates site access:

```typescript
// Validate user has access to the site
const siteValidation = await this.validateSiteAccess(input.site_id, userId);
if (!siteValidation.success) {
  return siteValidation as ServiceResponse<ContentVersion>;
}
```

### 2. Input Sanitization

All user input is sanitized:

```typescript
const sanitized: CreateVersionInput = {
  ...input,
  title: DOMPurify.sanitize(input.title),
  content: input.content ? DOMPurify.sanitize(input.content) : null,
  excerpt: input.excerpt ? DOMPurify.sanitize(input.excerpt) : null
};
```

### 3. Audit Logging

Every operation is logged for compliance:

```typescript
await this.auditVersionOperation({
  action: VersionAction.CREATED,
  version_id: version.id,
  user_id: userId,
  site_id: input.site_id,
  ip_address: options.ip_address,
  user_agent: options.user_agent,
  details: { /* operation details */ },
  data_classification: this.classifyVersionData(input)
}, client);
```

### 4. Event System

Services can listen to version lifecycle events:

```typescript
versionService.onVersionCreated((payload) => {
  console.log(`Version ${payload.version.id} created by user ${payload.userId}`);
});

versionService.onVersionPublished((payload) => {
  // Trigger cache invalidation, notifications, etc.
});
```

## Testing Strategy

### Unit Tests (>90% coverage)

The implementation includes comprehensive unit tests covering:

- Security validation scenarios
- Input sanitization edge cases
- Audit logging verification
- Event emission testing
- Cache behavior validation
- Error handling paths

### Integration Tests

- Database transaction integrity
- Multi-site isolation verification
- Performance under load
- Concurrent operation handling

### Security Tests

- Cross-site access prevention
- Input validation effectiveness
- PII detection accuracy
- Audit trail completeness

## Usage Examples

### Creating a Version with Enhanced Security

```typescript
const result = await versionService.createVersion({
  site_id: 1,
  content_type: ContentType.POST,
  content_id: 123,
  title: 'My Blog Post',
  content: '<p>Content with <script>potential XSS</script></p>'
}, userId, {
  ip_address: '192.168.1.100',
  user_agent: 'Mozilla/5.0...'
});

if (result.success) {
  console.log('Version created:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Auto-save with Pruning

```typescript
const autoSaveResult = await versionService.autoSave({
  site_id: 1,
  content_type: ContentType.POST,
  content_id: 123,
  title: 'Draft Title',
  content: 'Work in progress...'
}, userId);

// Old auto-saves are automatically pruned
```

### Version Metrics

```typescript
const metrics = await versionService.getVersionMetrics(1, ContentType.POST, 123);
if (metrics.success) {
  console.log('Total versions:', metrics.data.total_versions);
  console.log('Storage used:', metrics.data.storage_size_bytes);
  console.log('Last activity:', metrics.data.last_activity);
}
```

## Migration Guide

### From Basic VersionService

1. **Install Dependencies**: Add `isomorphic-dompurify` for content sanitization
2. **Run Migration**: Execute `004_version_audit_log.sql` to add audit table
3. **Update Imports**: Import enhanced types from versioning system
4. **Add Event Handlers**: Register listeners for version lifecycle events
5. **Configure Metrics**: Set up monitoring for performance indicators

### Breaking Changes

- Additional optional parameters added to core methods
- New required site validation for all operations
- Audit logging table must be created
- Enhanced error responses with security context

## Monitoring & Observability

### Key Metrics to Track

1. **Performance Metrics**
   - Version operation latency percentiles
   - Database query execution times
   - Cache hit/miss ratios
   - Memory usage trends

2. **Security Metrics**
   - Failed site access attempts
   - PII detection frequency
   - Input sanitization triggers
   - Audit log volume

3. **Business Metrics**
   - Version creation rates by site
   - Auto-save frequency patterns
   - Publishing workflow times
   - Storage growth trends

### Alerting Thresholds

- Version creation latency >500ms (p95)
- Failed site access attempts >10/hour
- Database connection pool >80% utilization
- Cache miss ratio >30%
- Storage growth >10GB/day

## Best Practices

### Development

1. Always validate site access before version operations
2. Use sanitized input for all user-provided content
3. Handle errors gracefully with proper error codes
4. Implement caching for frequently accessed data
5. Use event system for decoupled architecture

### Production

1. Monitor audit logs for security incidents
2. Set up automated pruning schedules
3. Configure cache warming for performance
4. Implement rate limiting on API endpoints
5. Regular backup of audit trail data

### Security

1. Rotate audit log encryption keys quarterly
2. Review PII detection patterns monthly
3. Monitor cross-site access attempts
4. Validate input sanitization effectiveness
5. Test disaster recovery procedures

## Future Enhancements

### Phase 2 Features

- Machine learning-based PII detection
- Advanced conflict resolution algorithms
- Real-time collaboration features
- Cross-site content migration tools
- Advanced analytics and reporting

### Performance Optimizations

- Redis-based distributed caching
- Database sharding for large sites
- Asynchronous background processing
- CDN integration for asset delivery
- GraphQL API for efficient queries

## Support & Troubleshooting

### Common Issues

1. **Site Access Denied**: Verify user has proper site permissions
2. **Version Limit Reached**: Implement automated archival process
3. **Slow Performance**: Check cache configuration and database indexes
4. **Audit Log Growth**: Configure log rotation and archival
5. **PII Detection False Positives**: Tune detection patterns

### Debug Information

Enable debug logging:
```typescript
versionService.on('version:any', (payload) => {
  console.debug('Version event:', payload);
});
```

Check service health:
```typescript
const metrics = await versionService.getVersionMetrics(siteId);
console.log('Service health:', metrics);
```

---

For additional support, see the related tickets:
- CV-001: Database schema foundation
- CV-002: TypeScript types and interfaces
- CV-004: REST API endpoints
- CV-005: Auto-save service
- CV-006: Preview service