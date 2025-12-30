import express from 'express';
import { Request, Response } from 'express';
import Joi from 'joi';
import { authenticateToken } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { superAdminService } from '../services/SuperAdminService';

const router = express.Router();

// All routes require authentication and super admin access
router.use(authenticateToken);
router.use(requireSuperAdmin);

// Validation schemas
const createOrgAdminSchema = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
});

const toggleSuperAdminSchema = Joi.object({
  isSuperAdmin: Joi.boolean().required(),
});

const suspendOrgSchema = Joi.object({
  reason: Joi.string().min(1).max(500).required(),
});

const confirmDeleteSchema = Joi.object({
  confirmationWord: Joi.string().pattern(/^[A-Z]+-\d{3}$/).required(),
});

/**
 * GET /api/super-admin/dashboard
 * Get platform-wide metrics
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const result = await superAdminService.getDashboardMetrics();

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error getting dashboard metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/super-admin/organizations
 * List all organizations with owner info and member count
 */
router.get('/organizations', async (req: Request, res: Response) => {
  try {
    const result = await superAdminService.listAllOrganizations();

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error listing organizations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/super-admin/organizations/:id
 * Get detailed organization info including all members and stats
 */
router.get('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const result = await superAdminService.getOrganizationDetails(orgId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error getting organization details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/admins
 * Create a new admin user for an organization
 */
router.post('/organizations/:id/admins', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const { error, value } = createOrgAdminSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, firstName, lastName } = value;
    const createdBy = req.user!.userId;

    const result = await superAdminService.createOrgAdmin(
      orgId,
      email,
      firstName,
      lastName,
      createdBy
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      message: 'Organization admin created successfully',
      ...result.data,
    });
  } catch (error) {
    console.error('Error creating org admin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/super-admin/users
 * List all users with their organization memberships
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const result = await superAdminService.listAllUsers();

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/super-admin/users/:id/super-admin
 * Promote or demote a user's super admin status
 */
router.put('/users/:id/super-admin', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { error, value } = toggleSuperAdminSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { isSuperAdmin } = value;
    const currentUserId = req.user!.userId;

    let result;
    if (isSuperAdmin) {
      result = await superAdminService.promoteToSuperAdmin(userId, currentUserId);
    } else {
      result = await superAdminService.demoteSuperAdmin(userId, currentUserId);
    }

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: isSuperAdmin
        ? 'User promoted to super admin'
        : 'User demoted from super admin',
    });
  } catch (error) {
    console.error('Error toggling super admin status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/suspend
 * Suspend an organization
 */
router.post('/organizations/:id/suspend', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const { error, value } = suspendOrgSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { reason } = value;
    const suspendedBy = req.user!.userId;

    const result = await superAdminService.suspendOrganization(orgId, reason, suspendedBy);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Organization suspended successfully' });
  } catch (error) {
    console.error('Error suspending organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/unsuspend
 * Unsuspend/reactivate an organization
 */
router.post('/organizations/:id/unsuspend', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const unsuspendedBy = req.user!.userId;

    const result = await superAdminService.unsuspendOrganization(orgId, unsuspendedBy);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Organization reactivated successfully' });
  } catch (error) {
    console.error('Error unsuspending organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/initiate-deletion
 * Initiate organization deletion (returns confirmation word)
 */
router.post('/organizations/:id/initiate-deletion', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const initiatedBy = req.user!.userId;

    const result = await superAdminService.initiateOrganizationDeletion(orgId, initiatedBy);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: 'Deletion initiated. Enter the confirmation word to proceed.',
      confirmationWord: result.data!.confirmationWord,
      gracePeriodEnds: result.data!.gracePeriodEnds,
    });
  } catch (error) {
    console.error('Error initiating deletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/confirm-deletion
 * Confirm organization deletion with confirmation word
 */
router.post('/organizations/:id/confirm-deletion', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const { error, value } = confirmDeleteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { confirmationWord } = value;
    const deletedBy = req.user!.userId;

    const result = await superAdminService.confirmOrganizationDeletion(
      orgId,
      confirmationWord,
      deletedBy
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Organization permanently deleted' });
  } catch (error) {
    console.error('Error confirming deletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/super-admin/organizations/:id/cancel-deletion
 * Cancel pending organization deletion
 */
router.post('/organizations/:id/cancel-deletion', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const cancelledBy = req.user!.userId;

    const result = await superAdminService.cancelOrganizationDeletion(orgId, cancelledBy);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Deletion cancelled, organization reactivated' });
  } catch (error) {
    console.error('Error cancelling deletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/super-admin/organizations/:id/status
 * Get organization status including suspension info
 */
router.get('/organizations/:id/status', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);

    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const result = await superAdminService.getOrganizationStatus(orgId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Error getting organization status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
