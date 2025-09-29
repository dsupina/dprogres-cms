import request from 'supertest';
import express from 'express';
import sitesRouter from '../../routes/sites';
import { siteService } from '../../services/siteService';
import type { Site } from '../../services/siteService';

// Mock dependencies
jest.mock('../../services/siteService');
jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req, res, next) => {
    req.user = { userId: 1, email: 'admin@test.com', role: 'admin' };
    next();
  }),
  requireAdmin: jest.fn((req, res, next) => next())
}));
jest.mock('../../middleware/validation', () => ({
  validateRequest: jest.fn(() => (req: any, res: any, next: any) => next())
}));

const mockSiteService = siteService as jest.Mocked<typeof siteService>;

const app = express();
app.use(express.json());
app.use('/api/sites', sitesRouter);

describe('Sites Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sites', () => {
    it('should fetch all sites', async () => {
      const mockSites: any[] = [
        {
          id: 1,
          domain_id: 1,
          name: 'Main Site',
          base_path: '/',
          title: 'Main Site Title',
          description: 'Main site description',
          is_default: true,
          is_active: true,
          settings: {},
          domain_hostname: 'example.com',
          created_at: new Date('2024-01-01T00:00:00Z'),
          updated_at: new Date('2024-01-01T00:00:00Z')
        }
      ];

      mockSiteService.getAllSites.mockResolvedValue(mockSites);

      const response = await request(app)
        .get('/api/sites')
        .expect(200);

      expect(response.body).toEqual(
        mockSites.map(site => ({
          ...site,
          created_at: site.created_at.toISOString(),
          updated_at: site.updated_at.toISOString()
        }))
      );
      expect(mockSiteService.getAllSites).toHaveBeenCalledWith(undefined);
    });

    it('should fetch sites filtered by domain_id', async () => {
      const mockSites: any[] = [
        {
          id: 1,
          domain_id: 2,
          name: 'Blog Site',
          base_path: '/blog',
          title: 'Blog Site Title',
          description: 'Blog site description',
          is_default: false,
          is_active: true,
          settings: {},
          domain_hostname: 'blog.example.com',
          created_at: new Date('2024-01-01T00:00:00Z'),
          updated_at: new Date('2024-01-01T00:00:00Z')
        }
      ];

      mockSiteService.getAllSites.mockResolvedValue(mockSites);

      const response = await request(app)
        .get('/api/sites?domain_id=2')
        .expect(200);

      expect(response.body).toEqual(
        mockSites.map(site => ({
          ...site,
          created_at: site.created_at.toISOString(),
          updated_at: site.updated_at.toISOString()
        }))
      );
      expect(mockSiteService.getAllSites).toHaveBeenCalledWith(2);
    });

    it('should handle service errors', async () => {
      mockSiteService.getAllSites.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/sites')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to fetch sites' });
    });
  });

  describe('GET /api/sites/domain/:domainId', () => {
    it('should fetch sites for a specific domain', async () => {
      const mockSites: any[] = [
        {
          id: 1,
          domain_id: 1,
          name: 'Main Site',
          base_path: '/',
          is_default: true,
          is_active: true
        }
      ];

      mockSiteService.getSitesByDomain.mockResolvedValue(mockSites);

      const response = await request(app)
        .get('/api/sites/domain/1')
        .expect(200);

      expect(response.body).toEqual(mockSites);
      expect(mockSiteService.getSitesByDomain).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid domain ID', async () => {
      const response = await request(app)
        .get('/api/sites/domain/invalid')
        .expect(400);

      expect(response.body).toEqual({ error: 'Invalid domain ID' });
    });

    it('should handle service errors', async () => {
      mockSiteService.getSitesByDomain.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/sites/domain/1')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to fetch domain sites' });
    });
  });

  describe('GET /api/sites/:id', () => {
    it('should fetch a single site by ID', async () => {
      const mockSite: any = {
        id: 1,
        domain_id: 1,
        name: 'Main Site',
        base_path: '/',
        title: 'Main Site Title',
        description: 'Main site description',
        is_default: true,
        is_active: true,
        settings: {},
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z')
      };

      mockSiteService.getSiteById.mockResolvedValue(mockSite);

      const response = await request(app)
        .get('/api/sites/1')
        .expect(200);

      expect(response.body).toEqual({
        ...mockSite,
        created_at: mockSite.created_at.toISOString(),
        updated_at: mockSite.updated_at.toISOString()
      });
      expect(mockSiteService.getSiteById).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid site ID', async () => {
      const response = await request(app)
        .get('/api/sites/invalid')
        .expect(400);

      expect(response.body).toEqual({ error: 'Invalid site ID' });
    });

    it('should return 404 for non-existent site', async () => {
      mockSiteService.getSiteById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sites/999')
        .expect(404);

      expect(response.body).toEqual({ error: 'Site not found' });
    });

    it('should handle service errors', async () => {
      mockSiteService.getSiteById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/sites/1')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to fetch site' });
    });
  });

  describe('POST /api/sites', () => {
    const validSiteData = {
      domain_id: 1,
      name: 'Test Site',
      base_path: '/test',
      title: 'Test Site Title',
      description: 'Test site description',
      is_default: false,
      is_active: true,
      settings: {}
    };

    it('should create a new site', async () => {
      const mockCreatedSite: any = {
        id: 2,
        ...validSiteData,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z')
      };

      mockSiteService.createSite.mockResolvedValue(mockCreatedSite);

      const response = await request(app)
        .post('/api/sites')
        .send(validSiteData)
        .expect(201);

      expect(response.body).toEqual({
        ...mockCreatedSite,
        created_at: mockCreatedSite.created_at.toISOString(),
        updated_at: mockCreatedSite.updated_at.toISOString()
      });
      expect(mockSiteService.createSite).toHaveBeenCalledWith(validSiteData);
    });

    it('should return 404 when domain not found', async () => {
      mockSiteService.createSite.mockRejectedValue(new Error('Domain not found'));

      const response = await request(app)
        .post('/api/sites')
        .send(validSiteData)
        .expect(404);

      expect(response.body).toEqual({ error: 'Domain not found' });
    });

    it('should return 409 for duplicate base path', async () => {
      const error = new Error('Duplicate key') as any;
      error.constraint = 'unique_domain_base_path';
      mockSiteService.createSite.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/sites')
        .send(validSiteData)
        .expect(409);

      expect(response.body).toEqual({
        error: 'A site with this base path already exists for this domain'
      });
    });

    it('should handle generic service errors', async () => {
      mockSiteService.createSite.mockRejectedValue(new Error('Generic error'));

      const response = await request(app)
        .post('/api/sites')
        .send(validSiteData)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to create site' });
    });
  });

  describe('PUT /api/sites/:id', () => {
    const updateData = {
      name: 'Updated Site Name',
      title: 'Updated Title',
      is_active: false
    };

    it('should update a site', async () => {
      const mockUpdatedSite: any = {
        id: 1,
        domain_id: 1,
        name: 'Updated Site Name',
        base_path: '/',
        title: 'Updated Title',
        description: 'Site description',
        is_default: true,
        is_active: false,
        settings: {},
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T12:00:00Z')
      };

      mockSiteService.updateSite.mockResolvedValue(mockUpdatedSite);

      const response = await request(app)
        .put('/api/sites/1')
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        ...mockUpdatedSite,
        created_at: mockUpdatedSite.created_at.toISOString(),
        updated_at: mockUpdatedSite.updated_at.toISOString()
      });
      expect(mockSiteService.updateSite).toHaveBeenCalledWith(1, updateData);
    });

    it('should return 400 for invalid site ID', async () => {
      const response = await request(app)
        .put('/api/sites/invalid')
        .send(updateData)
        .expect(400);

      expect(response.body).toEqual({ error: 'Invalid site ID' });
    });

    it('should return 404 for non-existent site', async () => {
      mockSiteService.updateSite.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/sites/999')
        .send(updateData)
        .expect(404);

      expect(response.body).toEqual({ error: 'Site not found' });
    });

    it('should return 409 for duplicate base path', async () => {
      const error = new Error('Duplicate key') as any;
      error.constraint = 'unique_domain_base_path';
      mockSiteService.updateSite.mockRejectedValue(error);

      const response = await request(app)
        .put('/api/sites/1')
        .send({ base_path: '/existing' })
        .expect(409);

      expect(response.body).toEqual({
        error: 'A site with this base path already exists for this domain'
      });
    });

    it('should handle generic service errors', async () => {
      mockSiteService.updateSite.mockRejectedValue(new Error('Generic error'));

      const response = await request(app)
        .put('/api/sites/1')
        .send(updateData)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to update site' });
    });
  });

  describe('DELETE /api/sites/:id', () => {
    it('should delete a site', async () => {
      mockSiteService.deleteSite.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/sites/1')
        .expect(204);

      expect(response.body).toEqual({});
      expect(mockSiteService.deleteSite).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid site ID', async () => {
      const response = await request(app)
        .delete('/api/sites/invalid')
        .expect(400);

      expect(response.body).toEqual({ error: 'Invalid site ID' });
    });

    it('should return 404 for non-existent site', async () => {
      mockSiteService.deleteSite.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/sites/999')
        .expect(404);

      expect(response.body).toEqual({ error: 'Site not found' });
    });

    it('should return 400 when trying to delete last site', async () => {
      mockSiteService.deleteSite.mockRejectedValue(
        new Error('Cannot delete the last site for a domain')
      );

      const response = await request(app)
        .delete('/api/sites/1')
        .expect(400);

      expect(response.body).toEqual({
        error: 'Cannot delete the last site for a domain'
      });
    });

    it('should handle generic service errors', async () => {
      mockSiteService.deleteSite.mockRejectedValue(new Error('Generic error'));

      const response = await request(app)
        .delete('/api/sites/1')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to delete site' });
    });
  });

  describe('GET /api/sites/context/current', () => {
    it('should get site context for current request', async () => {
      const mockSite: any = {
        id: 1,
        name: 'Main Site',
        title: 'Main Site Title',
        base_path: '/',
        domain_id: 1,
        is_default: true,
        is_active: true,
        settings: {},
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z')
      };

      mockSiteService.resolveSiteByHostAndPath.mockResolvedValue(mockSite);

      const response = await request(app)
        .get('/api/sites/context/current')
        .set('Host', 'example.com:3000')
        .query({ path: '/' })
        .expect(200);

      expect(response.body).toEqual({
        siteId: 1,
        siteName: 'Main Site',
        siteTitle: 'Main Site Title',
        basePath: '/',
        domainId: 1
      });
      expect(mockSiteService.resolveSiteByHostAndPath).toHaveBeenCalledWith('example.com', '/');
    });

    it('should use default path when none provided', async () => {
      const mockSite: any = {
        id: 1,
        name: 'Main Site',
        title: 'Main Site Title',
        base_path: '/',
        domain_id: 1,
        is_default: true,
        is_active: true,
        settings: {},
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z')
      };

      mockSiteService.resolveSiteByHostAndPath.mockResolvedValue(mockSite);

      const response = await request(app)
        .get('/api/sites/context/current')
        .set('Host', 'example.com')
        .expect(200);

      expect(mockSiteService.resolveSiteByHostAndPath).toHaveBeenCalledWith('example.com', '/');
    });

    it('should return 404 when no site found for default host', async () => {
      mockSiteService.resolveSiteByHostAndPath.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sites/context/current')
        .expect(404);

      expect(response.body).toEqual({ error: 'No site found for this domain' });
    });

    it('should return 404 when no site found', async () => {
      mockSiteService.resolveSiteByHostAndPath.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sites/context/current')
        .set('Host', 'unknown.com')
        .expect(404);

      expect(response.body).toEqual({ error: 'No site found for this domain' });
    });

    it('should handle service errors', async () => {
      mockSiteService.resolveSiteByHostAndPath.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/sites/context/current')
        .set('Host', 'example.com')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to get site context' });
    });
  });
});