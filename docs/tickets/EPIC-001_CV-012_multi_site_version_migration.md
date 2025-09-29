# CV-012: Multi-Site Version Migration

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** High
**Status:** TODO

## User Story
As a **system administrator**, I need to migrate existing content versions to the new site-scoped structure, so that all historical versions are properly associated with their respective sites and the system can support multi-site operations.

## Background
With the introduction of multi-site support, all content versions need to be associated with a specific site. Existing versions created before this change lack site_id and locale information. We need a migration strategy that preserves version history while adding the necessary site context.

## Requirements

### Functional Requirements
- Migrate all existing versions to include site_id
- Determine appropriate site assignment for legacy content
- Preserve all version history and relationships
- Handle orphaned versions gracefully
- Support rollback if migration fails
- Provide migration progress tracking
- Generate migration report

### Technical Requirements
- Batch processing for large datasets
- Zero downtime migration
- Data integrity validation
- Backup before migration
- Idempotent migration scripts
- Performance optimization for large version tables

## Acceptance Criteria
- [ ] All existing versions have valid site_id assigned
- [ ] Version history remains intact after migration
- [ ] No data loss during migration process
- [ ] Migration can be rolled back if needed
- [ ] Migration completes within maintenance window
- [ ] Report shows successful migration of all records
- [ ] Performance metrics remain acceptable during migration
- [ ] Site-scoped queries return correct results

## Implementation Details

### Migration Strategy

**Phase 1: Analysis**
- Identify content without site associations
- Map domains to sites
- Identify default site for unmapped content

**Phase 2: Preparation**
- Create backup of version tables
- Add site_id columns (nullable initially)
- Create temporary mapping tables

**Phase 3: Data Migration**
```sql
-- Example migration logic
UPDATE content_versions cv
SET site_id = COALESCE(
    -- Try to get site_id from content table
    (SELECT site_id FROM posts WHERE id = cv.content_id
     AND cv.content_type = 'post'),
    (SELECT site_id FROM pages WHERE id = cv.content_id
     AND cv.content_type = 'page'),
    -- Fall back to default site
    (SELECT id FROM sites WHERE is_default = TRUE LIMIT 1)
);
```

**Phase 4: Validation**
- Verify all records have site_id
- Check referential integrity
- Validate version sequences per site

**Phase 5: Finalization**
- Make site_id NOT NULL
- Drop temporary tables
- Update indexes

### Rollback Plan
1. Restore from backup
2. Remove site_id columns
3. Revert index changes
4. Clear migration logs

### Performance Considerations
- Process in batches of 10,000 records
- Run during low-traffic period
- Monitor database load
- Use parallel processing where possible

## Testing Considerations
- Test with production-size dataset
- Verify site assignment logic
- Test rollback procedure
- Performance testing with concurrent users
- Edge cases (orphaned versions, null references)

## Documentation Requirements
- Migration runbook
- Site assignment rules
- Troubleshooting guide
- Performance benchmarks

## Dependencies
- CV-001: Updated database schema
- Completed multi-site implementation
- Database backup system
- Maintenance window scheduled

## Success Metrics
- 100% of versions migrated successfully
- Zero data loss
- Migration completed within 2-hour window
- No production incidents during migration

## Related Tickets
- CV-001: Version Storage Database Schema
- CV-013: Locale-Aware Versioning