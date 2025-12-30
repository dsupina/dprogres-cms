import request from 'supertest';
import express from 'express';
import superAdminRouter from '../../routes/super-admin';
import { superAdminService } from '../../services/SuperAdminService';

// Mock dependencies
jest.mock('../../services/SuperAdminService');

jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req, res, next) => {
    req.user = { userId: 1, email: 'admin@test.com', role: 'admin', isSuperAdmin: true };
    next();
  }),
}));

jest.mock('../../middleware/superAdmin', () => ({
  requireSuperAdmin: jest.fn((req, res, next) => {
    if (req.user?.isSuperAdmin) {
      next();
    } else {
      res.status(403).json({ error: 'Super admin access required' });
    }
  }),
}));

const mockSuperAdminService = superAdminService as jest.Mocked<typeof superAdminService>;

const app = express();
app.use(express.json());
app.use('/api/super-admin', superAdminRouter);

describe('Super Admin Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/super-admin/dashboard', () => {
    it('should return platform metrics', async () => {
      const mockMetrics = {
        organizations: { total: 10, byPlanTier: { free: 5, pro: 3 }, newLast30Days: 2 },
        users: { total: 50, superAdmins: 2, newLast30Days: 10 },
        content: { totalPosts: 100, totalPages: 50, totalMedia: 200 },
        revenue: { activeSubscriptions: 5, mrr: 500 },
      };

      mockSuperAdminService.getDashboardMetrics.mockResolvedValue({
        success: true,
        data: mockMetrics,
      });

      const response = await request(app)
        .get('/api/super-admin/dashboard')
        .expect(200);

      expect(response.body.organizations.total).toBe(10);
      expect(response.body.users.total).toBe(50);
      expect(response.body.revenue.mrr).toBe(500);
    });

    it('should return 500 on service error', async () => {
      mockSuperAdminService.getDashboardMetrics.mockResolvedValue({
        success: false,
        error: 'Failed to get metrics',
      });

      const response = await request(app)
        .get('/api/super-admin/dashboard')
        .expect(500);

      expect(response.body.error).toBe('Failed to get metrics');
    });
  });

  describe('GET /api/super-admin/organizations', () => {
    it('should return all organizations', async () => {
      const mockOrgs = [
        { id: 1, name: 'Org 1', status: 'active', member_count: 3 },
        { id: 2, name: 'Org 2', status: 'suspended', member_count: 5 },
      ];

      mockSuperAdminService.listAllOrganizations.mockResolvedValue({
        success: true,
        data: mockOrgs as any,
      });

      const response = await request(app)
        .get('/api/super-admin/organizations')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Org 1');
    });
  });

  describe('GET /api/super-admin/organizations/:id', () => {
    it('should return organization details', async () => {
      const mockDetails = {
        id: 1,
        name: 'Test Org',
        members: [{ id: 1, email: 'owner@example.com', role: 'owner' }],
        stats: { posts: 10, pages: 5, sites: 2 },
      };

      mockSuperAdminService.getOrganizationDetails.mockResolvedValue({
        success: true,
        data: mockDetails as any,
      });

      const response = await request(app)
        .get('/api/super-admin/organizations/1')
        .expect(200);

      expect(response.body.name).toBe('Test Org');
      expect(response.body.members).toHaveLength(1);
    });

    it('should return 404 for non-existent organization', async () => {
      mockSuperAdminService.getOrganizationDetails.mockResolvedValue({
        success: false,
        error: 'Organization not found',
      });

      const response = await request(app)
        .get('/api/super-admin/organizations/999')
        .expect(404);

      expect(response.body.error).toBe('Organization not found');
    });

    it('should return 400 for invalid organization ID', async () => {
      const response = await request(app)
        .get('/api/super-admin/organizations/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid organization ID');
    });
  });

  describe('POST /api/super-admin/organizations/:id/admins', () => {
    it('should create a new admin for organization', async () => {
      mockSuperAdminService.createOrgAdmin.mockResolvedValue({
        success: true,
        data: { userId: 5, temporaryPassword: 'abc123def456' },
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/admins')
        .send({
          email: 'newadmin@example.com',
          firstName: 'New',
          lastName: 'Admin',
        })
        .expect(201);

      expect(response.body.message).toBe('Organization admin created successfully');
      expect(response.body.userId).toBe(5);
      expect(response.body.temporaryPassword).toBe('abc123def456');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/super-admin/organizations/1/admins')
        .send({
          email: 'invalid-email',
          firstName: 'New',
          lastName: 'Admin',
        })
        .expect(400);

      expect(response.body.error).toContain('email');
    });

    it('should return 400 if user already member', async () => {
      mockSuperAdminService.createOrgAdmin.mockResolvedValue({
        success: false,
        error: 'User is already a member of this organization',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/admins')
        .send({
          email: 'existing@example.com',
          firstName: 'Existing',
          lastName: 'User',
        })
        .expect(400);

      expect(response.body.error).toBe('User is already a member of this organization');
    });
  });

  describe('GET /api/super-admin/users', () => {
    it('should return all users', async () => {
      const mockUsers = [
        { id: 1, email: 'user1@example.com', is_super_admin: true, organizations: [] },
        { id: 2, email: 'user2@example.com', is_super_admin: false, organizations: [] },
      ];

      mockSuperAdminService.listAllUsers.mockResolvedValue({
        success: true,
        data: mockUsers as any,
      });

      const response = await request(app)
        .get('/api/super-admin/users')
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('PUT /api/super-admin/users/:id/super-admin', () => {
    it('should promote user to super admin', async () => {
      mockSuperAdminService.promoteToSuperAdmin.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .put('/api/super-admin/users/5/super-admin')
        .send({ isSuperAdmin: true })
        .expect(200);

      expect(response.body.message).toBe('User promoted to super admin');
    });

    it('should demote user from super admin', async () => {
      mockSuperAdminService.demoteSuperAdmin.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .put('/api/super-admin/users/5/super-admin')
        .send({ isSuperAdmin: false })
        .expect(200);

      expect(response.body.message).toBe('User demoted from super admin');
    });

    it('should return 400 if missing isSuperAdmin field', async () => {
      const response = await request(app)
        .put('/api/super-admin/users/5/super-admin')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('isSuperAdmin');
    });
  });

  describe('POST /api/super-admin/organizations/:id/suspend', () => {
    it('should suspend organization', async () => {
      mockSuperAdminService.suspendOrganization.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/suspend')
        .send({ reason: 'Violation of terms' })
        .expect(200);

      expect(response.body.message).toBe('Organization suspended successfully');
      expect(mockSuperAdminService.suspendOrganization).toHaveBeenCalledWith(
        1,
        'Violation of terms',
        1
      );
    });

    it('should return 400 if reason is missing', async () => {
      const response = await request(app)
        .post('/api/super-admin/organizations/1/suspend')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('reason');
    });

    it('should return 400 if organization already suspended', async () => {
      mockSuperAdminService.suspendOrganization.mockResolvedValue({
        success: false,
        error: 'Organization is already suspended',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/suspend')
        .send({ reason: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('Organization is already suspended');
    });
  });

  describe('POST /api/super-admin/organizations/:id/unsuspend', () => {
    it('should unsuspend organization', async () => {
      mockSuperAdminService.unsuspendOrganization.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/unsuspend')
        .expect(200);

      expect(response.body.message).toBe('Organization reactivated successfully');
    });

    it('should return 400 if organization already active', async () => {
      mockSuperAdminService.unsuspendOrganization.mockResolvedValue({
        success: false,
        error: 'Organization is already active',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/unsuspend')
        .expect(400);

      expect(response.body.error).toBe('Organization is already active');
    });
  });

  describe('POST /api/super-admin/organizations/:id/initiate-deletion', () => {
    it('should initiate organization deletion', async () => {
      const gracePeriodEnds = new Date();
      gracePeriodEnds.setDate(gracePeriodEnds.getDate() + 7);

      mockSuperAdminService.initiateOrganizationDeletion.mockResolvedValue({
        success: true,
        data: {
          confirmationWord: 'DELETE-123',
          gracePeriodEnds,
        },
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/initiate-deletion')
        .expect(200);

      expect(response.body.message).toBe('Deletion initiated. Enter the confirmation word to proceed.');
      expect(response.body.confirmationWord).toBe('DELETE-123');
      expect(response.body.gracePeriodEnds).toBeDefined();
    });

    it('should return 400 if organization not found', async () => {
      mockSuperAdminService.initiateOrganizationDeletion.mockResolvedValue({
        success: false,
        error: 'Organization not found',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/999/initiate-deletion')
        .expect(400);

      expect(response.body.error).toBe('Organization not found');
    });
  });

  describe('POST /api/super-admin/organizations/:id/confirm-deletion', () => {
    it('should confirm organization deletion with correct word', async () => {
      mockSuperAdminService.confirmOrganizationDeletion.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/confirm-deletion')
        .send({ confirmationWord: 'DELETE-123' })
        .expect(200);

      expect(response.body.message).toBe('Organization permanently deleted');
    });

    it('should return 400 with invalid confirmation word format', async () => {
      const response = await request(app)
        .post('/api/super-admin/organizations/1/confirm-deletion')
        .send({ confirmationWord: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('confirmationWord');
    });

    it('should return 400 with incorrect confirmation word', async () => {
      mockSuperAdminService.confirmOrganizationDeletion.mockResolvedValue({
        success: false,
        error: 'Invalid confirmation word',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/confirm-deletion')
        .send({ confirmationWord: 'WRONG-999' })
        .expect(400);

      expect(response.body.error).toBe('Invalid confirmation word');
    });
  });

  describe('POST /api/super-admin/organizations/:id/cancel-deletion', () => {
    it('should cancel pending deletion', async () => {
      mockSuperAdminService.cancelOrganizationDeletion.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/cancel-deletion')
        .expect(200);

      expect(response.body.message).toBe('Deletion cancelled, organization reactivated');
    });

    it('should return 400 if organization not pending deletion', async () => {
      mockSuperAdminService.cancelOrganizationDeletion.mockResolvedValue({
        success: false,
        error: 'Organization is not pending deletion',
      });

      const response = await request(app)
        .post('/api/super-admin/organizations/1/cancel-deletion')
        .expect(400);

      expect(response.body.error).toBe('Organization is not pending deletion');
    });
  });

  describe('GET /api/super-admin/organizations/:id/status', () => {
    it('should return organization status', async () => {
      mockSuperAdminService.getOrganizationStatus.mockResolvedValue({
        success: true,
        data: {
          status: 'active',
          suspended_at: undefined,
          suspended_reason: undefined,
          grace_period_ends_at: undefined,
          days_until_suspension: 5,
          has_overdue_invoices: true,
        },
      });

      const response = await request(app)
        .get('/api/super-admin/organizations/1/status')
        .expect(200);

      expect(response.body.status).toBe('active');
      expect(response.body.has_overdue_invoices).toBe(true);
      expect(response.body.days_until_suspension).toBe(5);
    });

    it('should return 404 if organization not found', async () => {
      mockSuperAdminService.getOrganizationStatus.mockResolvedValue({
        success: false,
        error: 'Organization not found',
      });

      const response = await request(app)
        .get('/api/super-admin/organizations/999/status')
        .expect(404);

      expect(response.body.error).toBe('Organization not found');
    });
  });
});
