import express, { Request, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import { organizationService } from '../services/OrganizationService';
import { memberService } from '../services/MemberService';

const router = express.Router();

// All organization routes require authentication
router.use(authenticateToken);

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/logos');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max for logos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
    }
  },
});

// Validation schemas
const updateOrganizationSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  logoUrl: Joi.string().uri().allow(null, '').optional(),
});

const inviteMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('admin', 'editor', 'publisher', 'viewer').required(),
  customMessage: Joi.string().max(500).optional(),
});

const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid('admin', 'editor', 'publisher', 'viewer').required(),
});

const transferOwnershipSchema = Joi.object({
  newOwnerId: Joi.number().integer().positive().required(),
});

/**
 * GET /api/organizations/current
 * Get the current user's organization (first organization they belong to)
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get user's organizations
    const orgsResult = await organizationService.listUserOrganizations(userId);
    if (!orgsResult.success) {
      return res.status(500).json({ success: false, error: orgsResult.error || 'Failed to retrieve organizations' });
    }
    if (!orgsResult.data || orgsResult.data.length === 0) {
      return res.status(404).json({ success: false, error: 'No organization found' });
    }

    // Return the first organization (user's primary org)
    const organization = orgsResult.data[0];

    // Get the user's role in this organization
    const roleResult = await organizationService.getMemberRole(organization.id, userId);

    return res.json({
      success: true,
      data: {
        ...organization,
        user_role: roleResult.success ? roleResult.data : null,
      },
    });
  } catch (error) {
    console.error('Error getting current organization:', error);
    return res.status(500).json({ success: false, error: 'Failed to get organization' });
  }
});

/**
 * GET /api/organizations/:id
 * Get organization by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const result = await organizationService.getOrganization(organizationId, userId);
    if (!result.success) {
      const status = result.error === 'Organization not found' ? 404 :
                     result.error?.includes('does not have access') ? 403 : 500;
      return res.status(status).json({
        success: false,
        error: result.error,
      });
    }

    // Get the user's role in this organization
    const roleResult = await organizationService.getMemberRole(organizationId, userId);

    return res.json({
      success: true,
      data: {
        ...result.data,
        user_role: roleResult.success ? roleResult.data : null,
      },
    });
  } catch (error) {
    console.error('Error getting organization:', error);
    return res.status(500).json({ success: false, error: 'Failed to get organization' });
  }
});

/**
 * PUT /api/organizations/:id
 * Update organization details (name, logo)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    // Validate input
    const { error, value } = updateOrganizationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const result = await organizationService.updateOrganization(organizationId, value, userId);
    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only organization owner') ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error updating organization:', error);
    return res.status(500).json({ success: false, error: 'Failed to update organization' });
  }
});

/**
 * POST /api/organizations/:id/logo
 * Upload organization logo
 */
router.post('/:id/logo', logoUpload.single('logo'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No logo file uploaded' });
    }

    // Build the logo URL
    const logoUrl = `/uploads/logos/${req.file.filename}`;

    // Update organization with new logo URL
    const result = await organizationService.updateOrganization(
      organizationId,
      { logoUrl },
      userId
    );

    if (!result.success) {
      // Delete the uploaded file if update fails
      fs.unlinkSync(req.file.path);
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only organization owner') ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: { logoUrl } });
  } catch (error) {
    console.error('Error uploading logo:', error);
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up uploaded file:', unlinkError);
      }
    }
    return res.status(500).json({ success: false, error: 'Failed to upload logo' });
  }
});

/**
 * GET /api/organizations/:id/members
 * List all members of an organization
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const result = await memberService.listMembers(organizationId, userId);
    if (!result.success) {
      return res.status(403).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error listing members:', error);
    return res.status(500).json({ success: false, error: 'Failed to list members' });
  }
});

/**
 * POST /api/organizations/:id/invites
 * Invite a new member to the organization
 */
router.post('/:id/invites', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    // Validate input
    const { error, value } = inviteMemberSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const result = await memberService.inviteMember({
      organizationId,
      email: value.email,
      role: value.role,
      invitedBy: userId,
      customMessage: value.customMessage,
    });

    if (!result.success) {
      const status = result.error?.includes('not a member') ||
                     result.error?.includes('Only organization') ? 403 :
                     result.error?.includes('already a member') ||
                     result.error?.includes('already exists') ? 409 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error inviting member:', error);
    return res.status(500).json({ success: false, error: 'Failed to invite member' });
  }
});

/**
 * GET /api/organizations/:id/invites
 * List pending invitations for an organization
 */
router.get('/:id/invites', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const result = await memberService.listPendingInvites(organizationId, userId);
    if (!result.success) {
      return res.status(403).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error listing invites:', error);
    return res.status(500).json({ success: false, error: 'Failed to list invites' });
  }
});

/**
 * DELETE /api/organizations/:id/invites/:inviteId
 * Revoke a pending invitation
 */
router.delete('/:id/invites/:inviteId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const inviteId = parseInt(req.params.inviteId, 10);
    if (isNaN(inviteId)) {
      return res.status(400).json({ success: false, error: 'Invalid invite ID' });
    }

    const result = await memberService.revokeInvite(inviteId, userId);
    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only organization') ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, message: 'Invitation revoked' });
  } catch (error) {
    console.error('Error revoking invite:', error);
    return res.status(500).json({ success: false, error: 'Failed to revoke invitation' });
  }
});

/**
 * PUT /api/organizations/:id/members/:memberId/role
 * Update a member's role
 */
router.put('/:id/members/:memberId/role', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(organizationId) || isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization or member ID' });
    }

    // Validate input
    const { error, value } = updateMemberRoleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const result = await memberService.updateMemberRole({
      organizationId,
      memberId,
      newRole: value.role,
      actorId: userId,
    });

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only organization') ||
                     result.error?.includes('Cannot change owner') ||
                     result.error?.includes('cannot change your own') ||
                     result.error?.includes('not a member') ||
                     result.error?.includes('does not have access') ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error updating member role:', error);
    return res.status(500).json({ success: false, error: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/organizations/:id/members/:memberId
 * Remove a member from the organization
 */
router.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    const memberId = parseInt(req.params.memberId, 10);
    if (isNaN(organizationId) || isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization or member ID' });
    }

    const result = await memberService.removeMember(organizationId, memberId, userId);
    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only organization') ||
                     result.error?.includes('Cannot remove') ||
                     result.error?.includes('cannot remove yourself') ||
                     result.error?.includes('not a member') ||
                     result.error?.includes('does not have access') ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Error removing member:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

/**
 * POST /api/organizations/:id/transfer-ownership
 * Transfer organization ownership to another member
 */
router.post('/:id/transfer-ownership', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizationId = parseInt(req.params.id, 10);
    if (isNaN(organizationId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    // Validate input
    const { error, value } = transferOwnershipSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const result = await organizationService.transferOwnership(
      organizationId,
      value.newOwnerId,
      userId
    );

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 :
                     result.error?.includes('Only current owner') ||
                     result.error?.includes('must be an existing') ? 403 :
                     result.error?.includes('Cannot transfer') ? 400 : 400;
      return res.status(status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    return res.status(500).json({ success: false, error: 'Failed to transfer ownership' });
  }
});

export default router;
