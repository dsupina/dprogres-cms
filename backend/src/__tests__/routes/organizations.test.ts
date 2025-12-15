import request from 'supertest';
import express from 'express';
import organizationsRouter from '../../routes/organizations';
import { organizationService } from '../../services/OrganizationService';
import { memberService } from '../../services/MemberService';

// Mock dependencies
jest.mock('../../services/OrganizationService');
jest.mock('../../services/MemberService');

jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req, res, next) => {
    req.user = { userId: 1, email: 'admin@test.com', role: 'admin', organizationId: 1 };
    next();
  }),
}));

const mockOrganizationService = organizationService as jest.Mocked<typeof organizationService>;
const mockMemberService = memberService as jest.Mocked<typeof memberService>;

const app = express();
app.use(express.json());
app.use('/api/organizations', organizationsRouter);

describe('Organization Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/organizations/current', () => {
    it('should return the current user organization', async () => {
      const mockOrganization = {
        id: 1,
        name: 'Test Organization',
        slug: 'test-org-abc123',
        owner_id: 1,
        plan_tier: 'starter' as const,
        logo_url: '/uploads/logos/test.png',
        created_at: new Date(),
        updated_at: new Date(),
        member_count: 5,
      };

      mockOrganizationService.listUserOrganizations.mockResolvedValue({
        success: true,
        data: [mockOrganization],
      });

      mockOrganizationService.getMemberRole.mockResolvedValue({
        success: true,
        data: 'owner',
      });

      const response = await request(app)
        .get('/api/organizations/current')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Organization');
      expect(response.body.data.user_role).toBe('owner');
      expect(mockOrganizationService.listUserOrganizations).toHaveBeenCalledWith(1);
    });

    it('should return 404 when user has no organization', async () => {
      mockOrganizationService.listUserOrganizations.mockResolvedValue({
        success: true,
        data: [],
      });

      const response = await request(app)
        .get('/api/organizations/current')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No organization found');
    });
  });

  describe('GET /api/organizations/:id', () => {
    it('should return organization by ID', async () => {
      const mockOrganization = {
        id: 1,
        name: 'Test Organization',
        slug: 'test-org-abc123',
        owner_id: 1,
        plan_tier: 'pro' as const,
        created_at: new Date(),
        updated_at: new Date(),
        member_count: 3,
      };

      mockOrganizationService.getOrganization.mockResolvedValue({
        success: true,
        data: mockOrganization,
      });

      mockOrganizationService.getMemberRole.mockResolvedValue({
        success: true,
        data: 'admin',
      });

      const response = await request(app)
        .get('/api/organizations/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Organization');
      expect(response.body.data.user_role).toBe('admin');
    });

    it('should return 404 for non-existent organization', async () => {
      mockOrganizationService.getOrganization.mockResolvedValue({
        success: false,
        error: 'Organization not found',
      });

      const response = await request(app)
        .get('/api/organizations/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Organization not found');
    });

    it('should return 400 for invalid organization ID', async () => {
      const response = await request(app)
        .get('/api/organizations/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid organization ID');
    });
  });

  describe('PUT /api/organizations/:id', () => {
    it('should update organization name', async () => {
      const mockUpdated = {
        id: 1,
        name: 'Updated Organization',
        slug: 'test-org-abc123',
        owner_id: 1,
        plan_tier: 'starter' as const,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockOrganizationService.updateOrganization.mockResolvedValue({
        success: true,
        data: mockUpdated,
      });

      const response = await request(app)
        .put('/api/organizations/1')
        .send({ name: 'Updated Organization' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Organization');
      expect(mockOrganizationService.updateOrganization).toHaveBeenCalledWith(
        1,
        { name: 'Updated Organization' },
        1
      );
    });

    it('should return 403 when non-owner tries to update', async () => {
      mockOrganizationService.updateOrganization.mockResolvedValue({
        success: false,
        error: 'Only organization owner can update organization details',
      });

      const response = await request(app)
        .put('/api/organizations/1')
        .send({ name: 'New Name' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Only organization owner');
    });

    it('should validate input', async () => {
      const response = await request(app)
        .put('/api/organizations/1')
        .send({ name: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/organizations/:id/members', () => {
    it('should return list of members', async () => {
      const mockMembers = [
        {
          id: 1,
          organization_id: 1,
          user_id: 1,
          role: 'owner' as const,
          joined_at: new Date(),
          user_email: 'owner@test.com',
          user_name: 'Owner User',
        },
        {
          id: 2,
          organization_id: 1,
          user_id: 2,
          role: 'editor' as const,
          joined_at: new Date(),
          user_email: 'editor@test.com',
          user_name: 'Editor User',
        },
      ];

      mockMemberService.listMembers.mockResolvedValue({
        success: true,
        data: mockMembers,
      });

      const response = await request(app)
        .get('/api/organizations/1/members')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].role).toBe('owner');
    });

    it('should return 403 when user does not have access', async () => {
      mockMemberService.listMembers.mockResolvedValue({
        success: false,
        error: 'You do not have access to this organization',
      });

      const response = await request(app)
        .get('/api/organizations/1/members')
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/organizations/:id/invites', () => {
    it('should invite a new member', async () => {
      const mockInvite = {
        id: 1,
        organization_id: 1,
        email: 'newuser@test.com',
        role: 'editor' as const,
        invited_by: 1,
        invite_token: 'token123',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
      };

      mockMemberService.inviteMember.mockResolvedValue({
        success: true,
        data: mockInvite,
      });

      const response = await request(app)
        .post('/api/organizations/1/invites')
        .send({ email: 'newuser@test.com', role: 'editor' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('newuser@test.com');
      expect(mockMemberService.inviteMember).toHaveBeenCalledWith({
        organizationId: 1,
        email: 'newuser@test.com',
        role: 'editor',
        invitedBy: 1,
        customMessage: undefined,
      });
    });

    it('should return 409 for existing member', async () => {
      mockMemberService.inviteMember.mockResolvedValue({
        success: false,
        error: 'User is already a member of this organization',
      });

      const response = await request(app)
        .post('/api/organizations/1/invites')
        .send({ email: 'existing@test.com', role: 'editor' })
        .expect(409);

      expect(response.body.success).toBe(false);
    });

    it('should validate email and role', async () => {
      const response = await request(app)
        .post('/api/organizations/1/invites')
        .send({ email: 'invalid-email', role: 'invalid-role' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject owner role', async () => {
      const response = await request(app)
        .post('/api/organizations/1/invites')
        .send({ email: 'test@test.com', role: 'owner' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/organizations/:id/invites', () => {
    it('should return pending invites', async () => {
      const mockInvites = [
        {
          id: 1,
          organization_id: 1,
          email: 'pending@test.com',
          role: 'editor' as const,
          invited_by: 1,
          invite_token: 'token123',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
        },
      ];

      mockMemberService.listPendingInvites.mockResolvedValue({
        success: true,
        data: mockInvites,
      });

      const response = await request(app)
        .get('/api/organizations/1/invites')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('DELETE /api/organizations/:id/invites/:inviteId', () => {
    it('should revoke an invite', async () => {
      mockMemberService.revokeInvite.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .delete('/api/organizations/1/invites/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Invitation revoked');
    });

    it('should return 404 for non-existent invite', async () => {
      mockMemberService.revokeInvite.mockResolvedValue({
        success: false,
        error: 'Invitation not found',
      });

      const response = await request(app)
        .delete('/api/organizations/1/invites/999')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/organizations/:id/members/:memberId/role', () => {
    it('should update member role', async () => {
      const mockUpdated = {
        id: 2,
        organization_id: 1,
        user_id: 2,
        role: 'admin' as const,
        joined_at: new Date(),
      };

      mockMemberService.updateMemberRole.mockResolvedValue({
        success: true,
        data: mockUpdated,
      });

      const response = await request(app)
        .put('/api/organizations/1/members/2/role')
        .send({ role: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('admin');
    });

    it('should return 403 when trying to change owner role', async () => {
      mockMemberService.updateMemberRole.mockResolvedValue({
        success: false,
        error: 'Cannot change owner role. Use transfer ownership instead.',
      });

      const response = await request(app)
        .put('/api/organizations/1/members/1/role')
        .send({ role: 'admin' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate role', async () => {
      const response = await request(app)
        .put('/api/organizations/1/members/2/role')
        .send({ role: 'owner' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/organizations/:id/members/:memberId', () => {
    it('should remove a member', async () => {
      mockMemberService.removeMember.mockResolvedValue({
        success: true,
      });

      const response = await request(app)
        .delete('/api/organizations/1/members/2')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Member removed');
    });

    it('should return 403 when trying to remove owner', async () => {
      mockMemberService.removeMember.mockResolvedValue({
        success: false,
        error: 'Cannot remove organization owner. Transfer ownership first.',
      });

      const response = await request(app)
        .delete('/api/organizations/1/members/1')
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/organizations/:id/transfer-ownership', () => {
    it('should transfer ownership to another member', async () => {
      const mockUpdated = {
        id: 1,
        name: 'Test Organization',
        slug: 'test-org-abc123',
        owner_id: 2,
        plan_tier: 'starter' as const,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockOrganizationService.transferOwnership.mockResolvedValue({
        success: true,
        data: mockUpdated,
      });

      const response = await request(app)
        .post('/api/organizations/1/transfer-ownership')
        .send({ newOwnerId: 2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.owner_id).toBe(2);
    });

    it('should return 403 when non-owner tries to transfer', async () => {
      mockOrganizationService.transferOwnership.mockResolvedValue({
        success: false,
        error: 'Only current owner can transfer ownership',
      });

      const response = await request(app)
        .post('/api/organizations/1/transfer-ownership')
        .send({ newOwnerId: 2 })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 when new owner is not a member', async () => {
      mockOrganizationService.transferOwnership.mockResolvedValue({
        success: false,
        error: 'New owner must be an existing organization member',
      });

      const response = await request(app)
        .post('/api/organizations/1/transfer-ownership')
        .send({ newOwnerId: 999 })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate input', async () => {
      const response = await request(app)
        .post('/api/organizations/1/transfer-ownership')
        .send({ newOwnerId: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
