import { MemberService } from '../../services/MemberService';
import jwt from 'jsonwebtoken';
import * as emailUtils from '../../utils/email';

// Mock database - must be defined before jest.mock() due to hoisting
const mockPoolQuery: any = jest.fn();
const mockClientQuery: any = jest.fn();
const mockRelease: any = jest.fn();
const mockClient: any = {
  query: mockClientQuery,
  release: mockRelease,
};
const mockConnect: any = jest.fn(() => Promise.resolve(mockClient));

jest.mock('../../utils/database', () => {
  return {
    pool: {
      query: (...args: any[]) => mockPoolQuery(...args),
      connect: (...args: any[]) => mockConnect(...args),
    },
  };
});

// Mock email utils
jest.mock('../../utils/email', () => ({
  sendEmail: jest.fn(() => Promise.resolve({ success: true, messageId: 'test-message-id' })),
  generateInviteEmailHTML: jest.fn(() => '<html>Test Email</html>'),
  generateInviteEmailText: jest.fn(() => 'Test Email'),
}));

// Mock JWT
jest.mock('jsonwebtoken');

describe('MemberService', () => {
  let memberService: MemberService;

  beforeEach(() => {
    memberService = new MemberService();
    jest.clearAllMocks();
  });

  describe('inviteMember', () => {
    const validInput = {
      organizationId: 1,
      email: 'newuser@example.com',
      role: 'editor' as const,
      invitedBy: 2,
      customMessage: 'Welcome to our team!',
      inviteUrl: 'https://app.example.com',
    };

    it('should successfully invite a new member', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // inviter role check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // existing member check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // pending invite check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // DELETE old invites (expired/accepted)
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, organization_id: 1, email: 'newuser@example.com', role: 'editor' }],
      }); // INSERT invite
      (jwt.sign as jest.Mock).mockReturnValue('test-token-123');
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            email: 'newuser@example.com',
            role: 'editor',
            invite_token: 'test-token-123',
          },
        ],
      }); // UPDATE invite with token
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'admin@example.com', name: 'Admin User' }],
      }); // inviter details
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.email).toBe('newuser@example.com');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(jwt.sign).toHaveBeenCalled();
    });

    it('should return error if email is invalid', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember({
        ...validInput,
        email: 'invalid-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valid email address is required');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if role is invalid', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember({
        ...validInput,
        role: 'owner' as any, // Invalid role for invites
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid role');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if organization not found', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // organization check (not found)
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Organization not found');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if inviter is not a member', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // inviter not found
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not a member of this organization');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if inviter is not owner/admin', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'editor' }],
      }); // inviter is editor (insufficient permission)
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only organization owners and admins can invite');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if user is already a member', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // inviter role check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 3 }],
      }); // user already member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User is already a member of this organization');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if pending invite already exists', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // inviter role check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // existing member check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 5 }],
      }); // pending invite exists
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('An active invitation for this email already exists');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should allow re-inviting a user whose previous invite was accepted', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Test Org' }],
      }); // organization check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // inviter role check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // existing member check (user left org)
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // no active pending invite
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 }); // DELETE old accepted invite
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 2, organization_id: 1, email: 'newuser@example.com', role: 'editor' }],
      }); // INSERT new invite
      (jwt.sign as jest.Mock).mockReturnValue('test-token-456');
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            organization_id: 1,
            email: 'newuser@example.com',
            role: 'editor',
            invite_token: 'test-token-456',
          },
        ],
      }); // UPDATE invite with token
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'admin@example.com', name: 'Admin User' }],
      }); // inviter details
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.inviteMember(validInput);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(2); // New invite ID
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('acceptInvite', () => {
    const validToken = 'valid-jwt-token';
    const userId = 5;

    const mockPayload = {
      type: 'invite',
      inviteId: 1,
      organizationId: 1,
      email: 'newuser@example.com',
      role: 'editor',
      invitedBy: 2,
    };

    it('should successfully accept an invitation', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            email: 'newuser@example.com',
            role: 'editor',
            invite_token: validToken,
            accepted_at: null,
            expires_at: new Date(Date.now() + 86400000), // 1 day future
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'newuser@example.com' }],
      }); // user check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // active member check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // soft-deleted member check
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            organization_id: 1,
            user_id: userId,
            role: 'editor',
          },
        ],
      }); // INSERT member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE invite accepted_at
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.user_id).toBe(userId);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error if token is invalid', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite('bad-token', userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid invitation token');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if token is expired', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error: any = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation has expired');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if token type is invalid', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ type: 'auth' });
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token type');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if invitation not found', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // invite not found
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation not found');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if invitation already accepted', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            accepted_at: new Date(), // Already accepted
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation has already been accepted');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if invitation is expired', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            accepted_at: null,
            expires_at: new Date(Date.now() - 86400000), // 1 day past
          },
        ],
      }); // invite check (expired)
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation has expired');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if user email does not match invite', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: 'newuser@example.com',
            accepted_at: null,
            expires_at: new Date(Date.now() + 86400000),
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'different@example.com' }],
      }); // user email mismatch
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('This invitation was sent to a different email address');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if user is already a member', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            email: 'newuser@example.com',
            accepted_at: null,
            expires_at: new Date(Date.now() + 86400000),
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'newuser@example.com' }],
      }); // user check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }],
      }); // already member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are already a member of this organization');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should re-activate soft-deleted membership when accepting invite', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            email: 'newuser@example.com',
            accepted_at: null,
            expires_at: new Date(Date.now() + 86400000),
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ email: 'newuser@example.com' }],
      }); // user check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // no active members
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10 }],
      }); // soft-deleted member found
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            organization_id: 1,
            user_id: userId,
            role: 'editor',
            deleted_at: null, // Re-activated
          },
        ],
      }); // UPDATE soft-deleted member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE invite accepted_at
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.acceptInvite(validToken, userId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(10); // Same ID as soft-deleted member
      expect(result.data?.deleted_at).toBeNull();
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('listMembers', () => {
    const organizationId = 1;
    const userId = 2;

    it('should successfully list all members', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      }); // access check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            role: 'owner',
            user_email: 'owner@example.com',
            user_name: 'Owner',
          },
          {
            id: 2,
            user_id: 2,
            role: 'admin',
            user_email: 'admin@example.com',
            user_name: 'Admin',
          },
        ],
      }); // members list

      const result = await memberService.listMembers(organizationId, userId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].role).toBe('owner');
    });

    it('should return error if user does not have access', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // access check (not member)

      const result = await memberService.listMembers(organizationId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not have access to this organization');
    });
  });

  describe('updateMemberRole', () => {
    const validInput = {
      organizationId: 1,
      memberId: 10,
      newRole: 'admin' as const,
      actorId: 2,
    };

    it('should successfully update member role', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'owner' }],
      }); // actor role check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 5, role: 'editor' }],
      }); // target member
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, role: 'admin' }],
      }); // UPDATE
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.updateMemberRole(validInput);

      expect(result.success).toBe(true);
      expect(result.data?.role).toBe('admin');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error if new role is invalid', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.updateMemberRole({
        ...validInput,
        newRole: 'superadmin' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid role');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if actor is not owner/admin', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'editor' }],
      }); // actor is editor
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.updateMemberRole(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only organization owners and admins');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if trying to change owner role', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'owner' }],
      }); // actor role
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 1, role: 'owner' }],
      }); // target is owner
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.updateMemberRole(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot change owner role');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if trying to change own role', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 2, role: 'editor' }],
      }); // target is actor (user_id = actorId)
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.updateMemberRole(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot change your own role');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('removeMember', () => {
    const organizationId = 1;
    const memberId = 10;
    const actorId = 2;

    it('should successfully remove a member (soft delete)', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 5, role: 'editor' }],
      }); // target member
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE deleted_at
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.removeMember(organizationId, memberId, actorId);

      expect(result.success).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error if trying to remove owner', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 1, role: 'owner' }],
      }); // target is owner
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.removeMember(organizationId, memberId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot remove organization owner');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if trying to remove yourself', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ id: 10, user_id: 2, role: 'editor' }],
      }); // target is actor
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.removeMember(organizationId, memberId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot remove yourself from the organization');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('revokeInvite', () => {
    const organizationId = 1;
    const inviteId = 1;
    const actorId = 2;

    it('should successfully revoke a pending invite', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            email: 'test@example.com',
            accepted_at: null,
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // DELETE invite
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await memberService.revokeInvite(organizationId, inviteId, actorId);

      expect(result.success).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error if invite not found', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // invite not found
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.revokeInvite(organizationId, inviteId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation not found');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if invite belongs to different organization', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 2, // Different org
            email: 'test@example.com',
            accepted_at: null,
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.revokeInvite(organizationId, inviteId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation does not belong to this organization');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if invite already accepted', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            accepted_at: new Date(), // Already accepted
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.revokeInvite(organizationId, inviteId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot revoke an accepted invitation');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return error if actor is not owner/admin', async () => {
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            organization_id: 1,
            accepted_at: null,
          },
        ],
      }); // invite check
      mockClientQuery.mockResolvedValueOnce({
        rows: [{ role: 'editor' }],
      }); // actor is editor
      mockClientQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await memberService.revokeInvite(organizationId, inviteId, actorId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only organization owners and admins');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('listPendingInvites', () => {
    const organizationId = 1;
    const userId = 2;

    it('should successfully list pending invites for owner/admin', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
      }); // actor role check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: 'invite1@example.com',
            role: 'editor',
          },
          {
            id: 2,
            email: 'invite2@example.com',
            role: 'viewer',
          },
        ],
      }); // pending invites

      const result = await memberService.listPendingInvites(organizationId, userId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return error if user is not owner/admin', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ role: 'editor' }],
      }); // actor is editor

      const result = await memberService.listPendingInvites(organizationId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Only organization owners and admins');
    });
  });
});
