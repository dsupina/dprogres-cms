# Troubleshooting Guide

## Common Issues & Solutions

### Development Environment

#### Issue: Docker containers won't start
**Symptoms**: `docker-compose up` fails with errors

**Solutions**:
1. Check if ports are already in use:
   ```bash
   # Check for processes using ports
   netstat -an | findstr :5000  # Backend port
   netstat -an | findstr :5173  # Frontend port
   netstat -an | findstr :5432  # PostgreSQL port
   ```

2. Clean Docker environment:
   ```bash
   docker-compose down -v        # Remove volumes
   docker system prune -a        # Clean everything
   docker-compose up --build     # Rebuild from scratch
   ```

3. Check Docker daemon is running:
   ```bash
   docker version
   # If error, restart Docker Desktop
   ```

---

#### Issue: npm install fails
**Symptoms**: Dependencies won't install, lock file conflicts

**Solutions**:
1. Clear npm cache and reinstall:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   rm -rf frontend/node_modules frontend/package-lock.json
   rm -rf backend/node_modules backend/package-lock.json
   npm run install:all
   ```

2. Check Node version:
   ```bash
   node --version  # Should be 18.x or higher
   npm --version   # Should be 8.x or higher
   ```

---

#### Issue: Database connection errors
**Symptoms**: "ECONNREFUSED" or "connection refused" errors

**Solutions**:
1. Check PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   ```

2. Verify DATABASE_URL:
   ```bash
   # Should match docker-compose.yml
   echo $DATABASE_URL
   # Expected: postgresql://postgres:password@localhost:5432/cms_db
   ```

3. Reset database:
   ```bash
   docker-compose down
   docker volume rm dprogres_site_postgres_data
   docker-compose up -d postgres
   ```

---

### Authentication Issues

#### Issue: JWT token expired immediately
**Symptoms**: Logged out right after login

**Solutions**:
1. Check system time synchronization
2. Verify JWT_SECRET is set:
   ```bash
   # In backend/.env
   JWT_SECRET=your-secret-key
   JWT_REFRESH_SECRET=your-refresh-secret
   ```

3. Check token expiry settings:
   ```typescript
   // backend/src/utils/jwt.ts
   expiresIn: '15m'  // Should be 15 minutes
   ```

---

#### Issue: 401 Unauthorized on all API calls
**Symptoms**: All authenticated requests fail

**Solutions**:
1. Check token is being sent:
   ```javascript
   // Browser DevTools Console
   localStorage.getItem('token')
   ```

2. Verify Authorization header:
   ```javascript
   // Network tab in DevTools
   // Should see: Authorization: Bearer <token>
   ```

3. Test token manually:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/posts
   ```

---

### Frontend Issues

#### Issue: Blank white page
**Symptoms**: React app shows nothing

**Solutions**:
1. Check browser console for errors
2. Verify API URL:
   ```javascript
   // frontend/.env
   VITE_API_URL=http://localhost:5000
   ```

3. Check build errors:
   ```bash
   cd frontend
   npm run build
   # Look for TypeScript or build errors
   ```

---

#### Issue: React Query infinite loops
**Symptoms**: API calls repeating endlessly

**Solutions**:
1. Check query key stability:
   ```typescript
   // Bad - creates new array each render
   useQuery(['posts', []], fetchPosts)

   // Good - stable reference
   useQuery(['posts'], fetchPosts)
   ```

2. Verify staleTime settings:
   ```typescript
   useQuery({
     queryKey: ['posts'],
     queryFn: fetchPosts,
     staleTime: 5 * 60 * 1000, // 5 minutes
   })
   ```

---

### Backend Issues

#### Issue: File upload fails
**Symptoms**: "File too large" or upload errors

**Solutions**:
1. Check file size limits:
   ```typescript
   // backend/src/routes/media.ts
   limits: { fileSize: 50 * 1024 * 1024 } // 50MB
   ```

2. Verify Nginx configuration:
   ```nginx
   # nginx.conf
   client_max_body_size 50M;
   ```

3. Check upload directory permissions:
   ```bash
   ls -la uploads/
   # Should be writable by Node process
   ```

---

#### Issue: CORS errors
**Symptoms**: "Access blocked by CORS policy"

**Solutions**:
1. Check CORS middleware:
   ```typescript
   // backend/src/index.ts
   app.use(cors({
     origin: 'http://localhost:5173',
     credentials: true
   }));
   ```

2. Verify request includes credentials:
   ```javascript
   // frontend service
   axios.defaults.withCredentials = true;
   ```

---

### Database Issues

#### Issue: Migration failures
**Symptoms**: Database schema out of sync

**Solutions**:
1. Check current schema:
   ```sql
   -- Connect to database
   docker exec -it dprogres_postgres psql -U postgres cms_db

   -- List tables
   \dt

   -- Check specific table
   \d posts
   ```

2. Manually run migrations:
   ```bash
   docker exec -it dprogres_postgres psql -U postgres cms_db < init-db.sql
   ```

---

#### Issue: Duplicate key violations
**Symptoms**: "duplicate key value violates unique constraint"

**Solutions**:
1. Check for existing data:
   ```sql
   SELECT * FROM posts WHERE slug = 'your-slug';
   ```

2. Generate unique slugs:
   ```typescript
   // backend/src/utils/slug.ts
   const uniqueSlug = `${baseSlug}-${Date.now()}`;
   ```

---

### Performance Issues

#### Issue: Slow Version and Preview Operations
**Symptoms**:
- Version creation taking >100ms
- Token validation taking >50ms
- Repeated cache misses

**Solutions for Version Management**:
1. Review database indexes for version tables:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM content_versions WHERE site_id = 1 AND content_type = 'post';
   EXPLAIN ANALYZE SELECT * FROM version_audit_log WHERE site_id = 1;
   ```

2. Add performance indexes:
   ```sql
   CREATE INDEX idx_versions_site_content ON content_versions(site_id, content_type, content_id);
   CREATE INDEX idx_versions_audit_site ON version_audit_log(site_id, created_at);
   ```

**Solutions for Preview Token System**:
1. Configure caching for token validation:
   ```typescript
   // Default: 5-minute in-memory cache
   const TOKEN_CACHE_TTL = 5 * 60 * 1000; // milliseconds
   ```

2. Enable detailed query logging for troubleshooting:
   ```typescript
   // backend/src/services/PreviewService.ts
   logger.setLevel('debug');
   queryMonitor.trackTokenQueries();
   ```

**General Performance Optimization**:
1. Check for missing indexes:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM posts WHERE status = 'published';
   ```

2. Add appropriate indexes:
   ```sql
   CREATE INDEX idx_posts_status ON posts(status);
   CREATE INDEX idx_posts_domain_status ON posts(domain_id, status);
   ```

3. Enable query logging:
   ```typescript
   // backend/src/utils/database.ts
   pool.on('query', (query) => {
     console.log('SQL:', query);
   });
   ```

---

#### Issue: High memory usage
**Symptoms**: Node process using >500MB RAM

**Solutions**:
1. Check for memory leaks:
   ```bash
   node --inspect backend/dist/index.js
   # Use Chrome DevTools Memory Profiler
   ```

2. Limit connection pool:
   ```typescript
   // backend/src/utils/database.ts
   const pool = new Pool({
     max: 10, // Reduce from default 20
   });
   ```

---

### Testing Issues

#### Issue: Tests failing randomly
**Symptoms**: Tests pass individually but fail together

**Solutions**:
1. Ensure test isolation:
   ```typescript
   beforeEach(async () => {
     await pool.query('BEGIN');
   });

   afterEach(async () => {
     await pool.query('ROLLBACK');
   });
   ```

2. Use separate test database:
   ```bash
   # .env.test
   DATABASE_URL=postgresql://postgres:password@localhost:5432/cms_test
   ```

---

#### Issue: Coverage reports incorrect
**Symptoms**: Coverage showing 0% or wrong files

**Solutions**:
1. Clear coverage cache:
   ```bash
   rm -rf coverage/
   rm -rf .nyc_output/
   npm run test:coverage
   ```

2. Check coverage configuration:
   ```json
   // package.json
   "jest": {
     "collectCoverageFrom": [
       "src/**/*.{ts,tsx}",
       "!src/**/*.d.ts",
       "!src/**/*.test.{ts,tsx}"
     ]
   }
   ```

---

## Error Messages Reference

### Backend Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Database not running | Start PostgreSQL container |
| `EADDRINUSE` | Port already in use | Kill process or change port |
| `TOKEN_EXPIRED` | JWT token expired | Refresh token or re-login |
| `VALIDATION_ERROR` | Invalid request data | Check Joi schema requirements |
| `UNIQUE_VIOLATION` | Duplicate database entry | Use different value or update existing |
| `VERSION_LIMIT_EXCEEDED` | Too many versions for content | Archive old versions or increase `VERSION_MAX_LIMIT` |
| `PREVIEW_TOKEN_INVALID` | Invalid or expired preview token | Generate new preview token or check access restrictions |
| `SITE_ISOLATION_VIOLATION` | Cross-site content access | Verify site permissions and token context |

### Frontend Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Network Error` | API not reachable | Check backend is running |
| `401 Unauthorized` | Not authenticated | Login or check token |
| `403 Forbidden` | Insufficient permissions | Check user role |
| `404 Not Found` | Route doesn't exist | Verify API endpoint |
| `500 Server Error` | Backend error | Check backend logs |

---

## Debug Commands

### Useful Docker Commands
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f postgres

# Execute commands in container
docker exec -it dprogres_backend sh
docker exec -it dprogres_postgres psql -U postgres cms_db

# Restart specific service
docker-compose restart backend

# Clean everything
docker-compose down -v --remove-orphans
```

### Database Queries for Debugging
```sql
-- Check user permissions
SELECT * FROM users WHERE email = 'admin@example.com';

-- View recent posts
SELECT id, title, status, created_at
FROM posts
ORDER BY created_at DESC
LIMIT 10;

-- Check domain configuration
SELECT * FROM domains WHERE is_active = true;

-- View active sessions (if implemented)
SELECT * FROM sessions WHERE expires_at > NOW();
```

### Node.js Debugging
```bash
# Run with debug output
DEBUG=* npm run dev:backend

# Run with inspector
node --inspect backend/dist/index.js

# Memory usage
node --trace-gc backend/dist/index.js
```

---

## Getting Help

1. **Check logs first**:
   - Browser console (F12)
   - Docker logs
   - Network tab in DevTools

2. **Search error message**:
   - Include exact error text
   - Check closed GitHub issues
   - Search Stack Overflow

3. **Create minimal reproduction**:
   - Isolate the problem
   - Create simple test case
   - Document steps to reproduce

4. **When asking for help provide**:
   - Error messages
   - Relevant code
   - Environment details
   - What you've already tried