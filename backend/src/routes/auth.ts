import express from 'express';
import { Request, Response } from 'express';
import { query, pool } from '../utils/database';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { authenticateToken } from '../middleware/auth';
import { validate, loginSchema, registerSchema, signupSchema } from '../middleware/validation';
import { User } from '../types';
import { organizationService } from '../services/OrganizationService';
import crypto from 'crypto';

const router = express.Router();

// Login endpoint
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user by email - include current_organization_id for quota enforcement
    const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user: User = userResult.rows[0];

    // Check password
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification (SF-008)
    // Block only users who explicitly have email_verified = false
    // Allow legacy users (email_verified = null/undefined) to log in
    if (user.email_verified === false && user.email_verification_token !== null) {
      return res.status(403).json({
        error: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Generate JWT token with organizationId for quota enforcement (SF-010)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.current_organization_id
    });

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint (for admin use)
router.post('/register', authenticateToken, validate(registerSchema), async (req: Request, res: Response) => {
  try {
    // Only admin can create new users
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can create new users' });
    }

    const { email, password, first_name, last_name } = req.body;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const result = await query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, created_at',
      [email, hashedPassword, first_name, last_name, 'author']
    );

    const newUser = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public signup endpoint with free tier organization creation
// Ticket: SF-008
router.post('/signup', validate(signupSchema), async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { email, password, first_name, last_name } = req.body;

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user with email verification fields
    const userResult = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        role,
        email_verified,
        email_verification_token,
        email_verification_sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, email, first_name, last_name, role, created_at`,
      [email, hashedPassword, first_name, last_name, 'author', false, verificationToken]
    );

    const newUser = userResult.rows[0];
    const userId = newUser.id;

    // Create organization directly (within the same transaction)
    const orgName = `${first_name}'s Organization`;

    // Generate unique slug for organization
    const baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const slug = `${baseSlug}-${randomSuffix}`;

    // Create organization
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, owner_id, plan_tier)
       VALUES ($1, $2, $3, 'free')
       RETURNING *`,
      [orgName, slug, userId]
    );

    const organization = orgResult.rows[0];
    const organizationId = organization.id;

    // Add user as organization member with "owner" role
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [organizationId, userId]
    );

    // Initialize usage_quotas for free tier (5 dimensions)
    const quotas = [
      { dimension: 'sites', limit: 1, hasPeriod: false },
      { dimension: 'posts', limit: 20, hasPeriod: false },
      { dimension: 'users', limit: 2, hasPeriod: false },
      { dimension: 'storage_bytes', limit: 524288000, hasPeriod: false }, // 500MB
      { dimension: 'api_calls', limit: 10000, hasPeriod: true }, // Monthly reset
    ];

    for (const quota of quotas) {
      if (quota.hasPeriod) {
        // For monthly quotas (api_calls), set period_end to 1 month from now
        await client.query(
          `INSERT INTO usage_quotas (
            organization_id,
            dimension,
            current_usage,
            quota_limit,
            period_start,
            period_end
          ) VALUES ($1, $2, 0, $3, NOW(), NOW() + INTERVAL '1 month')`,
          [organizationId, quota.dimension, quota.limit]
        );
      } else {
        // For non-resetting quotas (sites, posts, users, storage_bytes)
        await client.query(
          `INSERT INTO usage_quotas (
            organization_id,
            dimension,
            current_usage,
            quota_limit,
            period_start,
            period_end
          ) VALUES ($1, $2, 0, $3, NOW(), NULL)`,
          [organizationId, quota.dimension, quota.limit]
        );
      }
    }

    // Update user's current_organization_id
    await client.query(
      'UPDATE users SET current_organization_id = $1 WHERE id = $2',
      [organizationId, userId]
    );

    await client.query('COMMIT');

    // Generate verification URL
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;

    // TODO: SF-013 - Send email via EmailService when implemented
    // For now, log to console in development and return URL in all environments
    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== EMAIL VERIFICATION ===');
      console.log(`To: ${email}`);
      console.log(`Verification URL: ${verificationUrl}`);
      console.log('==========================\n');
    }

    res.status(201).json({
      message: 'Signup successful! Please verify your email to complete registration.',
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      // TEMPORARY: Return verification URL until SF-013 implements email sending
      // This allows production signup to work while we build EmailService
      verificationUrl,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const result = await query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { first_name, last_name, email } = req.body;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const result = await query(
      'UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), email = COALESCE($3, email), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, email, first_name, last_name, role, updated_at',
      [first_name, last_name, email, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.put('/password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current password hash
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isValidPassword = await comparePassword(current_password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(new_password);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify email endpoint
// Ticket: SF-008
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user by verification token
    const userResult = await query(
      `SELECT id, email, email_verified
       FROM users
       WHERE email_verification_token = $1`,
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = userResult.rows[0];

    // Check if already verified
    if (user.email_verified) {
      return res.json({ message: 'Email already verified. You can now log in.' });
    }

    // Mark email as verified and clear token
    await query(
      `UPDATE users
       SET email_verified = true,
           email_verification_token = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    res.json({
      message: 'Email verified successfully! You can now log in.',
      email: user.email,
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticateToken, (req: Request, res: Response) => {
  // Since we're using JWT, logout is handled client-side by removing the token
  res.json({ message: 'Logged out successfully' });
});

export default router; 