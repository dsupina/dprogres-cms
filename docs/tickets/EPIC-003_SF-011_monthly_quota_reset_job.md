# SF-011: Monthly Quota Reset Job

**Epic**: EPIC-003 SaaS Foundation
**Phase**: Phase 3 (Quota System & Enforcement)
**Priority**: P0
**Estimated Effort**: 2 days
**Status**: Not Started
**Dependencies**: SF-009
**Assigned To**: Backend Engineer

---

## Objective

Create cron job to reset monthly API call quotas

---

## Requirements

### Functional Requirements

- Run daily to check for expired periods
- Reset api_calls usage to 0
- Update period_start and period_end
- Log reset events
- Handle timezone considerations

---

## Technical Design

Cron Job: backend/src/jobs/resetQuotas.ts

import { CronJob } from 'cron';

// Run daily at 00:00 UTC
const job = new CronJob('0 0 * * *', async () => {
  const result = await pool.query(`
    UPDATE usage_quotas
    SET current_usage = 0,
        last_reset_at = NOW(),
        period_start = NOW(),
        period_end = NOW() + INTERVAL '1 month',
        updated_at = NOW()
    WHERE dimension = 'api_calls'
      AND period_end < NOW()
    RETURNING organization_id
  `);

  console.log(`Reset quotas for ${result.rowCount} organizations`);
});

job.start();

---

## Acceptance Criteria

- [ ] Cron job runs daily at 00:00 UTC
- [ ] Only api_calls dimension reset
- [ ] period_start and period_end updated
- [ ] Reset events logged
- [ ] Integration test simulates expired periods

---

## Testing

### Unit Tests

Write comprehensive unit tests covering all methods and edge cases.

Target coverage: >90%

### Integration Tests

Test end-to-end flows with real dependencies (Stripe test mode, database).

### Manual Testing

Verify functionality in development environment before marking as complete.

---

## Documentation

Update relevant documentation files:
- `docs/COMPONENTS.md` - Add service description
- `docs/API_BILLING.md` - Document new endpoints
- `docs/PATTERNS.md` - Document patterns used

---

## Deployment Notes

### Environment Variables

List required environment variables and their purposes.

### Database Changes

List any database migrations or schema changes.

### Testing Checklist

Provide checklist for validating deployment:
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Code review approved

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
