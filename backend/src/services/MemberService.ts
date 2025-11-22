import { EventEmitter } from 'events';
import { pool } from '../utils/database';
import type { ServiceResponse } from '../types/versioning';
import jwt from 'jsonwebtoken';
import { sendEmail, generateInviteEmailHTML, generateInviteEmailText } from '../utils/email';

/**
 * Organization member entity from database
 */
export interface OrganizationMember {
  id: number;
  organization_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'editor' | 'publisher' | 'viewer';
  invited_by?: number;
  joined_at: Date;
  deleted_at?: Date;
}

/**
 * Organization invite entity from database
 */
export interface OrganizationInvite {
  id: number;
  organization_id: number;
  email: string;
  role: 'admin' | 'editor' | 'publisher' | 'viewer';
  invited_by: number;
  invite_token: string;
  expires_at: Date;
  accepted_at?: Date;
  accepted_by?: number;
  created_at: Date;
}

/**
 * Member with user details (for listing)
 */
export interface MemberWithUser extends OrganizationMember {
  user_email: string;
  user_name?: string;
  inviter_email?: string;
  inviter_name?: string;
}

/**
 * Input for inviting a new member
 */
export interface InviteMemberInput {
  organizationId: number;
  email: string;
  role: 'admin' | 'editor' | 'publisher' | 'viewer';
  invitedBy: number;
  customMessage?: string;
  inviteUrl?: string; // Base URL for invite acceptance page
}

/**
 * Input for updating member role
 */
export interface UpdateMemberRoleInput {
  organizationId: number;
  memberId: number;
  newRole: 'admin' | 'editor' | 'publisher' | 'viewer';
  actorId: number;
}

/**
 * JWT payload for invite tokens
 */
interface InviteTokenPayload {
  type: 'invite';
  inviteId: number;
  organizationId: number;
  email: string;
  role: string;
  invitedBy: number;
  customMessage?: string;
}

/**
 * MemberService
 *
 * Handles organization member management including:
 * - Inviting new members with email-based JWT tokens
 * - Accepting invitations and creating memberships
 * - Listing organization members with user details
 * - Updating member roles (admin+ only)
 * - Removing members (soft delete with GDPR compliance)
 * - Revoking pending invitations
 *
 * Ticket: SF-006
 */
export class MemberService extends EventEmitter {
  private readonly INVITE_EXPIRATION_DAYS = 7;
  private readonly JWT_INVITE_SECRET = process.env.JWT_INVITE_SECRET || 'dev-invite-secret';

  /**
   * Invite a new member to the organization
   * Creates invite record, generates JWT token, sends email via AWS SES
   *
   * Business Rules:
   * - Cannot invite to 'owner' role (only one owner per org)
   * - Cannot invite existing members
   * - Cannot have duplicate pending invites for same email
   * - Only owner/admin can invite
   */
  async inviteMember(input: InviteMemberInput): Promise<ServiceResponse<OrganizationInvite>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { organizationId, email, role, invitedBy, customMessage, inviteUrl } = input;

      // Validate inputs
      if (!email || !email.includes('@')) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Valid email address is required' };
      }

      if (!role || !['admin', 'editor', 'publisher', 'viewer'].includes(role)) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invalid role. Must be admin, editor, publisher, or viewer' };
      }

      // Verify organization exists
      const { rows: orgs } = await client.query(
        'SELECT id, name FROM organizations WHERE id = $1 AND deleted_at IS NULL',
        [organizationId]
      );

      if (orgs.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Organization not found' };
      }

      const organization = orgs[0];

      // Verify inviter is owner or admin
      const { rows: inviterMembers } = await client.query(
        `SELECT role FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [organizationId, invitedBy]
      );

      if (inviterMembers.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'You are not a member of this organization' };
      }

      const inviterRole = inviterMembers[0].role;
      if (!['owner', 'admin'].includes(inviterRole)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Only organization owners and admins can invite members',
        };
      }

      // Check if user is already a member
      const { rows: existingUsers } = await client.query(
        `SELECT u.id FROM users u
         INNER JOIN organization_members om ON u.id = om.user_id
         WHERE u.email = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
        [email, organizationId]
      );

      if (existingUsers.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User is already a member of this organization',
        };
      }

      // Check if there's already a pending invite
      const { rows: existingInvites } = await client.query(
        `SELECT id FROM organization_invites
         WHERE organization_id = $1 AND email = $2
           AND accepted_at IS NULL AND expires_at > NOW()`,
        [organizationId, email]
      );

      if (existingInvites.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'An active invitation for this email already exists',
        };
      }

      // Calculate expiration date (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.INVITE_EXPIRATION_DAYS);

      // Create invite record (without token first)
      const { rows: [invite] } = await client.query<OrganizationInvite>(
        `INSERT INTO organization_invites
         (organization_id, email, role, invited_by, invite_token, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [organizationId, email, role, invitedBy, 'pending', expiresAt]
      );

      // Generate JWT token with invite details
      const tokenPayload: InviteTokenPayload = {
        type: 'invite',
        inviteId: invite.id,
        organizationId,
        email,
        role,
        invitedBy,
        customMessage,
      };

      const inviteToken = jwt.sign(tokenPayload, this.JWT_INVITE_SECRET, {
        expiresIn: `${this.INVITE_EXPIRATION_DAYS}d`,
      });

      // Update invite record with actual token
      const { rows: [updatedInvite] } = await client.query<OrganizationInvite>(
        `UPDATE organization_invites
         SET invite_token = $1
         WHERE id = $2
         RETURNING *`,
        [inviteToken, invite.id]
      );

      // Get inviter details for email
      const { rows: [inviter] } = await client.query<{ email: string; name?: string }>(
        'SELECT email, name FROM users WHERE id = $1',
        [invitedBy]
      );

      await client.query('COMMIT');

      // Send invitation email via AWS SES (async, don't block on email delivery)
      const baseUrl = inviteUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
      const acceptUrl = `${baseUrl}/accept-invite?token=${inviteToken}`;

      const inviterName = inviter.name || inviter.email.split('@')[0];

      const emailHTML = generateInviteEmailHTML({
        organizationName: organization.name,
        inviterName,
        inviteUrl: acceptUrl,
        role,
        customMessage,
      });

      const emailText = generateInviteEmailText({
        organizationName: organization.name,
        inviterName,
        inviteUrl: acceptUrl,
        role,
        customMessage,
      });

      // Send email asynchronously (don't await to avoid blocking)
      sendEmail({
        to: email,
        subject: `You've been invited to join ${organization.name} on DProgres CMS`,
        html: emailHTML,
        text: emailText,
        replyTo: inviter.email,
      }).catch((error) => {
        console.error('Failed to send invitation email:', error);
        // Emit event for failed email delivery (can be logged/retried)
        this.emit('invite:email_failed', {
          inviteId: invite.id,
          email,
          error: error.message,
          timestamp: new Date(),
        });
      });

      // Emit success event
      this.emit('member:invited', {
        inviteId: updatedInvite.id,
        organizationId,
        email,
        role,
        invitedBy,
        expiresAt,
        timestamp: new Date(),
      });

      return { success: true, data: updatedInvite };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error inviting member:', error);
      return {
        success: false,
        error: error.message || 'Failed to invite member',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Accept an invitation and create organization membership
   *
   * Business Rules:
   * - Token must be valid and not expired
   * - User accepting must match email in invite
   * - Creates organization_members entry
   * - Marks invite as accepted
   */
  async acceptInvite(token: string, userId: number): Promise<ServiceResponse<OrganizationMember>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify and decode JWT token
      let payload: InviteTokenPayload;
      try {
        payload = jwt.verify(token, this.JWT_INVITE_SECRET) as InviteTokenPayload;
      } catch (error: any) {
        await client.query('ROLLBACK');
        if (error.name === 'TokenExpiredError') {
          return { success: false, error: 'Invitation has expired' };
        }
        return { success: false, error: 'Invalid invitation token' };
      }

      // Verify token type
      if (payload.type !== 'invite') {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invalid token type' };
      }

      // Get invite record
      const { rows: invites } = await client.query<OrganizationInvite>(
        `SELECT * FROM organization_invites
         WHERE id = $1 AND invite_token = $2`,
        [payload.inviteId, token]
      );

      if (invites.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invitation not found' };
      }

      const invite = invites[0];

      // Check if already accepted
      if (invite.accepted_at) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invitation has already been accepted' };
      }

      // Check if expired
      if (new Date() > new Date(invite.expires_at)) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invitation has expired' };
      }

      // Verify user email matches invite email
      const { rows: users } = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );

      if (users.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'User not found' };
      }

      if (users[0].email.toLowerCase() !== invite.email.toLowerCase()) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'This invitation was sent to a different email address',
        };
      }

      // Check if user is already an active member
      const { rows: activeMembers } = await client.query(
        `SELECT id FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [invite.organization_id, userId]
      );

      if (activeMembers.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You are already a member of this organization',
        };
      }

      // Check for soft-deleted membership (user was previously removed)
      const { rows: deletedMembers } = await client.query<OrganizationMember>(
        `SELECT id FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
        [invite.organization_id, userId]
      );

      let member: OrganizationMember;

      if (deletedMembers.length > 0) {
        // Re-activate soft-deleted membership (UPSERT pattern)
        const { rows: [reactivated] } = await client.query<OrganizationMember>(
          `UPDATE organization_members
           SET deleted_at = NULL, role = $1, invited_by = $2, joined_at = NOW()
           WHERE organization_id = $3 AND user_id = $4
           RETURNING *`,
          [invite.role, invite.invited_by, invite.organization_id, userId]
        );
        member = reactivated;
      } else {
        // Create new organization membership
        const { rows: [created] } = await client.query<OrganizationMember>(
          `INSERT INTO organization_members
           (organization_id, user_id, role, invited_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [invite.organization_id, userId, invite.role, invite.invited_by]
        );
        member = created;
      }

      // Mark invite as accepted
      await client.query(
        `UPDATE organization_invites
         SET accepted_at = NOW(), accepted_by = $1
         WHERE id = $2`,
        [userId, invite.id]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('member:joined', {
        memberId: member.id,
        organizationId: invite.organization_id,
        userId,
        role: invite.role,
        invitedBy: invite.invited_by,
        timestamp: new Date(),
      });

      return { success: true, data: member };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error accepting invite:', error);
      return {
        success: false,
        error: error.message || 'Failed to accept invitation',
      };
    } finally {
      client.release();
    }
  }

  /**
   * List all members of an organization with user details
   *
   * Access Control: Any member can list members
   */
  async listMembers(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<MemberWithUser[]>> {
    try {
      // Verify user has access to organization
      const { rows: userMembers } = await pool.query(
        `SELECT id FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [organizationId, userId]
      );

      if (userMembers.length === 0) {
        return {
          success: false,
          error: 'You do not have access to this organization',
        };
      }

      // Get all members with user details
      const { rows } = await pool.query<MemberWithUser>(
        `SELECT
           om.*,
           u.email as user_email,
           u.name as user_name,
           inviter.email as inviter_email,
           inviter.name as inviter_name
         FROM organization_members om
         INNER JOIN users u ON om.user_id = u.id
         LEFT JOIN users inviter ON om.invited_by = inviter.id
         WHERE om.organization_id = $1 AND om.deleted_at IS NULL
         ORDER BY
           CASE om.role
             WHEN 'owner' THEN 1
             WHEN 'admin' THEN 2
             WHEN 'editor' THEN 3
             WHEN 'publisher' THEN 4
             WHEN 'viewer' THEN 5
           END,
           om.joined_at ASC`,
        [organizationId]
      );

      return { success: true, data: rows };
    } catch (error: any) {
      console.error('Error listing members:', error);
      return {
        success: false,
        error: 'Failed to retrieve members',
      };
    }
  }

  /**
   * Update a member's role
   *
   * Business Rules:
   * - Only owner/admin can update roles
   * - Cannot change owner role (use transferOwnership instead)
   * - Cannot change your own role
   * - New role must be valid (admin, editor, publisher, viewer)
   */
  async updateMemberRole(
    input: UpdateMemberRoleInput
  ): Promise<ServiceResponse<OrganizationMember>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { organizationId, memberId, newRole, actorId } = input;

      // Validate new role
      if (!['admin', 'editor', 'publisher', 'viewer'].includes(newRole)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Invalid role. Must be admin, editor, publisher, or viewer',
        };
      }

      // Get actor's role
      const { rows: actorMembers } = await client.query<OrganizationMember>(
        `SELECT * FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [organizationId, actorId]
      );

      if (actorMembers.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You are not a member of this organization',
        };
      }

      const actorRole = actorMembers[0].role;

      // Only owner/admin can update roles
      if (!['owner', 'admin'].includes(actorRole)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Only organization owners and admins can update member roles',
        };
      }

      // Get target member
      const { rows: targetMembers } = await client.query<OrganizationMember>(
        `SELECT * FROM organization_members
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [memberId, organizationId]
      );

      if (targetMembers.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Member not found' };
      }

      const targetMember = targetMembers[0];

      // Cannot change owner role (must use transferOwnership)
      if (targetMember.role === 'owner') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot change owner role. Use transfer ownership instead.',
        };
      }

      // Cannot change your own role
      if (targetMember.user_id === actorId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You cannot change your own role',
        };
      }

      // Update role
      const { rows: [updated] } = await client.query<OrganizationMember>(
        `UPDATE organization_members
         SET role = $1
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [newRole, memberId]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('member:role_updated', {
        memberId,
        organizationId,
        userId: targetMember.user_id,
        oldRole: targetMember.role,
        newRole,
        updatedBy: actorId,
        timestamp: new Date(),
      });

      return { success: true, data: updated };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error updating member role:', error);
      return {
        success: false,
        error: error.message || 'Failed to update member role',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Remove a member from the organization (soft delete)
   *
   * Business Rules:
   * - Only owner/admin can remove members
   * - Cannot remove yourself
   * - Cannot remove owner (must transfer ownership first)
   * - Soft delete with 30-day retention for GDPR compliance
   */
  async removeMember(
    organizationId: number,
    memberId: number,
    actorId: number
  ): Promise<ServiceResponse<void>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get actor's role
      const { rows: actorMembers } = await client.query<OrganizationMember>(
        `SELECT * FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [organizationId, actorId]
      );

      if (actorMembers.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You are not a member of this organization',
        };
      }

      const actorRole = actorMembers[0].role;

      // Only owner/admin can remove members
      if (!['owner', 'admin'].includes(actorRole)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Only organization owners and admins can remove members',
        };
      }

      // Get target member
      const { rows: targetMembers } = await client.query<OrganizationMember>(
        `SELECT * FROM organization_members
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [memberId, organizationId]
      );

      if (targetMembers.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Member not found' };
      }

      const targetMember = targetMembers[0];

      // Cannot remove owner
      if (targetMember.role === 'owner') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot remove organization owner. Transfer ownership first.',
        };
      }

      // Cannot remove yourself
      if (targetMember.user_id === actorId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You cannot remove yourself from the organization',
        };
      }

      // Soft delete member
      await client.query(
        `UPDATE organization_members
         SET deleted_at = NOW()
         WHERE id = $1`,
        [memberId]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('member:removed', {
        memberId,
        organizationId,
        userId: targetMember.user_id,
        role: targetMember.role,
        removedBy: actorId,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error removing member:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove member',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Revoke a pending invitation
   *
   * Business Rules:
   * - Only owner/admin can revoke invites
   * - Can only revoke unaccepted invites
   */
  async revokeInvite(
    inviteId: number,
    actorId: number
  ): Promise<ServiceResponse<void>> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get invite
      const { rows: invites } = await client.query<OrganizationInvite>(
        'SELECT * FROM organization_invites WHERE id = $1',
        [inviteId]
      );

      if (invites.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Invitation not found' };
      }

      const invite = invites[0];

      // Check if already accepted
      if (invite.accepted_at) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot revoke an accepted invitation',
        };
      }

      // Verify actor is owner/admin
      const { rows: actorMembers } = await client.query<OrganizationMember>(
        `SELECT role FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [invite.organization_id, actorId]
      );

      if (actorMembers.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'You are not a member of this organization',
        };
      }

      const actorRole = actorMembers[0].role;

      if (!['owner', 'admin'].includes(actorRole)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Only organization owners and admins can revoke invitations',
        };
      }

      // Delete invite (hard delete since it was never accepted)
      await client.query(
        'DELETE FROM organization_invites WHERE id = $1',
        [inviteId]
      );

      await client.query('COMMIT');

      // Emit event
      this.emit('invite:revoked', {
        inviteId,
        organizationId: invite.organization_id,
        email: invite.email,
        role: invite.role,
        revokedBy: actorId,
        timestamp: new Date(),
      });

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('Error revoking invite:', error);
      return {
        success: false,
        error: error.message || 'Failed to revoke invitation',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get pending invites for an organization
   *
   * Access Control: Only owner/admin can view pending invites
   */
  async listPendingInvites(
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse<OrganizationInvite[]>> {
    try {
      // Verify user is owner/admin
      const { rows: members } = await pool.query<OrganizationMember>(
        `SELECT role FROM organization_members
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [organizationId, userId]
      );

      if (members.length === 0) {
        return {
          success: false,
          error: 'You are not a member of this organization',
        };
      }

      if (!['owner', 'admin'].includes(members[0].role)) {
        return {
          success: false,
          error: 'Only organization owners and admins can view pending invitations',
        };
      }

      // Get pending invites
      const { rows } = await pool.query<OrganizationInvite>(
        `SELECT * FROM organization_invites
         WHERE organization_id = $1
           AND accepted_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [organizationId]
      );

      return { success: true, data: rows };
    } catch (error: any) {
      console.error('Error listing pending invites:', error);
      return {
        success: false,
        error: 'Failed to retrieve pending invitations',
      };
    }
  }
}

// Export singleton instance
export const memberService = new MemberService();
