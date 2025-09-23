/**
 * Security tests for menu system - testing all BLOCKER issues
 */

import request from 'supertest';
import express, { Express } from 'express';
import { Pool } from 'pg';
import { createMenuRouter } from '../../routes/menus';
import { csrfGenerate, csrfProtect } from '../../middleware/csrf';
import { clearAllRateLimits } from '../../middleware/rateLimit';
import { sanitizeMenuLabel, containsXSS, sanitizeUrl } from '../../utils/sanitizer';
import { validateUrl, validateMenuItemUrl } from '../../utils/urlValidator';

// Mock dependencies
jest.mock('pg');

describe('Menu Security Tests', () => {
  let app: Express;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    // Clear rate limits between tests
    clearAllRateLimits();

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mock cookie parser
    app.use((req, res, next) => {
      req.cookies = {};
      next();
    });

    // Setup mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as any;

    // Setup CSRF for testing
    app.use(csrfGenerate);

    // Mount menu router
    const menuRouter = createMenuRouter(mockPool);
    app.use('/api', menuRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CSRF Protection', () => {
    it('should reject POST requests without CSRF token', async () => {
      // Mock auth middleware
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      const response = await request(app)
        .post('/api/menus')
        .send({
          domain_id: 1,
          label: 'Test Menu'
        })
        .expect(403);

      expect(response.body.error).toContain('CSRF');
    });

    it('should reject requests with invalid CSRF token', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'invalid-token')
        .send({
          domain_id: 1,
          label: 'Test Menu'
        })
        .expect(403);

      expect(response.body.error).toContain('CSRF');
    });

    it('should accept requests with valid CSRF token', async () => {
      // Get CSRF token
      const tokenResponse = await request(app)
        .get('/api/menus/1/tree')
        .expect(200);

      const csrfToken = tokenResponse.headers['x-csrf-token'];
      expect(csrfToken).toBeDefined();

      // Mock successful auth and query
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, label: 'Test Menu' }],
        rowCount: 1
      } as any);

      // Use token in POST request
      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `csrf-token=${csrfToken}`)
        .send({
          domain_id: 1,
          label: 'Test Menu'
        });

      // Should not be rejected for CSRF reasons
      expect(response.status).not.toBe(403);
    });
  });

  describe('XSS Protection', () => {
    describe('sanitizeMenuLabel', () => {
      it('should remove HTML tags from labels', () => {
        const malicious = '<script>alert("XSS")</script>Menu';
        const sanitized = sanitizeMenuLabel(malicious);
        expect(sanitized).toBe('Menu');
        expect(sanitized).not.toContain('<script>');
      });

      it('should remove event handlers', () => {
        const malicious = '<div onclick="alert(1)">Menu</div>';
        const sanitized = sanitizeMenuLabel(malicious);
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('<div>');
      });

      it('should handle encoded XSS attempts', () => {
        const malicious = '&lt;script&gt;alert(1)&lt;/script&gt;';
        const sanitized = sanitizeMenuLabel(malicious);
        expect(sanitized).not.toContain('script');
      });

      it('should preserve safe unicode characters', () => {
        const safe = 'Menu Item 测试 メニュー';
        const sanitized = sanitizeMenuLabel(safe);
        expect(sanitized).toBe(safe);
      });

      it('should limit label length', () => {
        const longLabel = 'a'.repeat(300);
        const sanitized = sanitizeMenuLabel(longLabel);
        expect(sanitized.length).toBeLessThanOrEqual(255);
      });
    });

    describe('containsXSS', () => {
      it('should detect script tags', () => {
        expect(containsXSS('<script>alert(1)</script>')).toBe(true);
        expect(containsXSS('Normal text')).toBe(false);
      });

      it('should detect javascript: protocol', () => {
        expect(containsXSS('javascript:alert(1)')).toBe(true);
        expect(containsXSS('http://example.com')).toBe(false);
      });

      it('should detect event handlers', () => {
        expect(containsXSS('onclick=alert(1)')).toBe(true);
        expect(containsXSS('onerror=alert(1)')).toBe(true);
        expect(containsXSS('Normal text')).toBe(false);
      });

      it('should detect data URIs with HTML', () => {
        expect(containsXSS('data:text/html,<script>alert(1)</script>')).toBe(true);
        expect(containsXSS('data:image/png;base64,iVBORw0KG')).toBe(false);
      });
    });

    describe('API XSS Prevention', () => {
      it('should reject menu labels with XSS attempts', async () => {
        // Mock auth
        jest.spyOn(require('../../middleware/auth'), 'authenticate')
          .mockImplementation((req, res, next) => {
            req.user = { id: 1, email: 'test@test.com', role: 'admin' };
            next();
          });

        const response = await request(app)
          .post('/api/menus')
          .set('X-CSRF-Token', 'test-token')
          .send({
            domain_id: 1,
            label: '<script>alert("XSS")</script>'
          })
          .expect(400);

        expect(response.body.error).toContain('Invalid characters');
      });
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should use parameterized queries for all inputs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
        rowCount: 1
      } as any);

      // Attempt SQL injection in domain ID
      await request(app)
        .get("/api/menus/1' OR '1'='1/tree")
        .expect(400);

      // Pool.query should not have been called with malicious input
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle malicious input in menu labels safely', async () => {
      const maliciousLabel = "'; DROP TABLE menu_items; --";

      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, label: maliciousLabel }],
        rowCount: 1
      } as any);

      await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          domain_id: 1,
          label: maliciousLabel
        });

      // Check that query was called with parameterized values
      if (mockPool.query.mock.calls.length > 0) {
        const [query, params] = mockPool.query.mock.calls[0];
        // SQL should be in query, not in params
        expect(query).toContain('INSERT INTO');
        expect(params).toBeInstanceOf(Array);
        // Malicious SQL should be in params, not query
        params.forEach(param => {
          if (typeof param === 'string') {
            expect(query).not.toContain(param);
          }
        });
      }
    });
  });

  describe('URL Validation', () => {
    describe('validateUrl', () => {
      it('should reject javascript: URLs', () => {
        const result = validateUrl('javascript:alert(1)');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('malicious');
      });

      it('should reject data: URLs with HTML', () => {
        const result = validateUrl('data:text/html,<script>alert(1)</script>');
        expect(result.valid).toBe(false);
      });

      it('should reject URLs with credentials', () => {
        const result = validateUrl('https://user:pass@example.com');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('credentials');
      });

      it('should reject localhost URLs', () => {
        const result = validateUrl('http://localhost:8080/admin');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('restricted');
      });

      it('should reject IP addresses', () => {
        const result = validateUrl('http://192.168.1.1/admin');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('IP addresses');
      });

      it('should reject cloud metadata endpoints', () => {
        expect(validateUrl('http://169.254.169.254/latest').valid).toBe(false);
        expect(validateUrl('http://metadata.google.internal').valid).toBe(false);
        expect(validateUrl('http://metadata.azure.com').valid).toBe(false);
      });

      it('should accept valid HTTPS URLs', () => {
        const result = validateUrl('https://example.com/page');
        expect(result.valid).toBe(true);
        expect(result.url).toBe('https://example.com/page');
      });

      it('should accept relative URLs when allowed', () => {
        const result = validateUrl('/admin/dashboard', { allowRelative: true });
        expect(result.valid).toBe(true);
        expect(result.url).toBe('/admin/dashboard');
      });

      it('should prevent directory traversal in relative URLs', () => {
        const result = validateUrl('/../../../etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('traversal');
      });

      it('should enforce domain whitelist when provided', () => {
        const options = { allowedDomains: ['example.com', 'trusted.org'] };

        expect(validateUrl('https://example.com/page', options).valid).toBe(true);
        expect(validateUrl('https://sub.example.com/page', options).valid).toBe(true);
        expect(validateUrl('https://evil.com/page', options).valid).toBe(false);
      });

      it('should enforce domain blacklist when provided', () => {
        const options = { blockedDomains: ['evil.com', 'blocked.org'] };

        expect(validateUrl('https://example.com/page', options).valid).toBe(true);
        expect(validateUrl('https://evil.com/page', options).valid).toBe(false);
        expect(validateUrl('https://sub.evil.com/page', options).valid).toBe(false);
      });
    });

    describe('validateMenuItemUrl', () => {
      it('should validate external URLs', () => {
        const result = validateMenuItemUrl('https://example.com', null);
        expect(result.valid).toBe(true);
        expect(result.type).toBe('external');
      });

      it('should validate internal page references', () => {
        const result = validateMenuItemUrl(null, 123);
        expect(result.valid).toBe(true);
        expect(result.type).toBe('internal');
      });

      it('should reject both URL and page ID', () => {
        const result = validateMenuItemUrl('https://example.com', 123);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('both');
      });

      it('should allow neither for parent items', () => {
        const result = validateMenuItemUrl(null, null);
        expect(result.valid).toBe(true);
        expect(result.type).toBe('none');
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should limit menu operations per minute', async () => {
      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1
      } as any);

      // Make requests up to the limit
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/menus')
          .set('X-CSRF-Token', 'test-token')
          .send({
            domain_id: 1,
            label: `Menu ${i}`
          });
      }

      // 11th request should be rate limited
      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          domain_id: 1,
          label: 'Menu 11'
        })
        .expect(429);

      expect(response.body.error).toContain('Too many');
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should set rate limit headers', async () => {
      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1
      } as any);

      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          domain_id: 1,
          label: 'Test Menu'
        });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should rate limit per user per domain', async () => {
      // Mock auth with different users
      const authMock1 = (req, res, next) => {
        req.user = { id: 1, email: 'user1@test.com', role: 'admin' };
        next();
      };
      const authMock2 = (req, res, next) => {
        req.user = { id: 2, email: 'user2@test.com', role: 'admin' };
        next();
      };

      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1
      } as any);

      // User 1 makes 5 requests to domain 1
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation(authMock1);

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/menus')
          .set('X-CSRF-Token', 'test-token')
          .send({
            domain_id: 1,
            label: `Menu ${i}`
          })
          .expect(response => {
            expect(response.status).not.toBe(429);
          });
      }

      // User 2 should not be rate limited
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation(authMock2);

      await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          domain_id: 1,
          label: 'User 2 Menu'
        })
        .expect(response => {
          expect(response.status).not.toBe(429);
        });
    });
  });

  describe('Authorization', () => {
    it('should require authentication for write operations', async () => {
      // No auth mock - request should fail
      const response = await request(app)
        .post('/api/menus')
        .send({
          domain_id: 1,
          label: 'Test Menu'
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should require admin or editor role for menu operations', async () => {
      // Mock auth with viewer role
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'viewer@test.com', role: 'viewer' };
          next();
        });

      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          domain_id: 1,
          label: 'Test Menu'
        })
        .expect(403);

      expect(response.body.error).toContain('permission');
    });

    it('should require admin role for delete operations', async () => {
      // Mock auth with editor role
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'editor@test.com', role: 'editor' };
          next();
        });

      const response = await request(app)
        .delete('/api/menus/1')
        .set('X-CSRF-Token', 'test-token')
        .expect(403);

      expect(response.body.error).toContain('permission');
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields', async () => {
      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      const response = await request(app)
        .post('/api/menus')
        .set('X-CSRF-Token', 'test-token')
        .send({
          // Missing required fields
          url: 'https://example.com'
        })
        .expect(400);

      expect(response.body.error).toContain('required');
    });

    it('should validate numeric IDs', async () => {
      const response = await request(app)
        .get('/api/menus/invalid-id/tree')
        .expect(400);

      expect(response.body.error).toContain('Invalid');
    });

    it('should validate array inputs for reordering', async () => {
      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      const response = await request(app)
        .post('/api/menus/1/reorder')
        .set('X-CSRF-Token', 'test-token')
        .send({
          item_ids: 'not-an-array'
        })
        .expect(400);

      expect(response.body.error).toContain('array');
    });

    it('should limit batch size', async () => {
      // Mock auth
      jest.spyOn(require('../../middleware/auth'), 'authenticate')
        .mockImplementation((req, res, next) => {
          req.user = { id: 1, email: 'test@test.com', role: 'admin' };
          next();
        });

      const items = Array(51).fill({ label: 'Item' });

      const response = await request(app)
        .post('/api/menus/1/batch')
        .set('X-CSRF-Token', 'test-token')
        .send({ items })
        .expect(400);

      expect(response.body.error).toContain('exceed 50');
    });
  });
});

describe('Sanitizer Edge Cases', () => {
  it('should handle null and undefined inputs', () => {
    expect(sanitizeMenuLabel(null as any)).toBe('');
    expect(sanitizeMenuLabel(undefined as any)).toBe('');
    expect(sanitizeUrl(null as any)).toBe('');
    expect(sanitizeUrl(undefined as any)).toBe('');
  });

  it('should handle empty strings', () => {
    expect(sanitizeMenuLabel('')).toBe('');
    expect(sanitizeUrl('')).toBe('');
  });

  it('should handle very long inputs without crashing', () => {
    const longString = 'a'.repeat(10000);
    expect(() => sanitizeMenuLabel(longString)).not.toThrow();
    expect(() => sanitizeUrl(longString)).not.toThrow();
  });

  it('should handle special unicode characters', () => {
    const unicode = '👍 Menu 🎉 测试 メニュー';
    const sanitized = sanitizeMenuLabel(unicode);
    expect(sanitized).toContain('👍');
    expect(sanitized).toContain('🎉');
  });
});

describe('URL Validator Edge Cases', () => {
  it('should handle malformed URLs gracefully', () => {
    const malformed = [
      'ht!tp://example.com',
      '///',
      'http://',
      'ftp://example.com',
      'not-a-url-at-all'
    ];

    malformed.forEach(url => {
      const result = validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it('should handle international domains', () => {
    const result = validateUrl('https://münchen.de');
    expect(result.valid).toBe(true);
  });

  it('should handle URLs with query parameters', () => {
    const result = validateUrl('https://example.com?param=value&other=123');
    expect(result.valid).toBe(true);
  });

  it('should handle URLs with fragments', () => {
    const result = validateUrl('https://example.com/page#section');
    expect(result.valid).toBe(true);
  });
});