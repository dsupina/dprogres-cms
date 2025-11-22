/**
 * SF-008: Auto-Create Free Tier on Signup Tests
 *
 * Tests for public signup endpoint with:
 * - Organization creation
 * - Usage quotas initialization
 * - Email verification flow
 * - Transaction safety
 */

import request from 'supertest';
import express from 'express';
import { pool } from '../../utils/database';
import { hashPassword } from '../../utils/password';
import authRoutes from '../../routes/auth';

// Create app instance
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('SF-008: Signup with Free Tier Organization', () => {
  let client: any;

  beforeEach(async () => {
    // Clean up test data before each test (order matters for FK constraints)
    client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete in reverse FK dependency order
      // Clear all test user current_organization_id references first
      await client.query('UPDATE users SET current_organization_id = NULL WHERE email LIKE \'%test-signup%\'');
      // Now safe to delete in order
      await client.query('DELETE FROM usage_quotas WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\')');
      await client.query('DELETE FROM organization_members WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\')');
      await client.query('DELETE FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\'');
      await client.query('DELETE FROM users WHERE email LIKE \'%test-signup%\'');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // Ignore cleanup errors
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // Final cleanup (order matters for FK constraints)
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query('BEGIN');
      // Delete in reverse FK dependency order
      await cleanupClient.query('UPDATE users SET current_organization_id = NULL WHERE email LIKE \'%test-signup%\'');
      await cleanupClient.query('DELETE FROM usage_quotas WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\')');
      await cleanupClient.query('DELETE FROM organization_members WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\')');
      await cleanupClient.query('DELETE FROM organizations WHERE name LIKE \'%Test%\' OR name LIKE \'%Organization\'');
      await cleanupClient.query('DELETE FROM users WHERE email LIKE \'%test-signup%\'');
      await cleanupClient.query('COMMIT');
    } catch (error) {
      await cleanupClient.query('ROLLBACK');
      // Ignore cleanup errors
    } finally {
      cleanupClient.release();
    }

    // Don't end pool - let Jest handle cleanup
  });

  describe('POST /auth/signup', () => {
    const validSignupData = {
      email: 'john.doe-test-signup@example.com',
      password: 'SecurePass123!',
      first_name: 'John',
      last_name: 'Doe',
    };

    it('should create user, organization, and quotas successfully', async () => {
      const response = await request(app)
        .post('/auth/signup')
        .send(validSignupData);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('Signup successful');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(validSignupData.email);
      expect(response.body.user.first_name).toBe(validSignupData.first_name);
      expect(response.body.organization).toBeDefined();
      expect(response.body.organization.name).toBe(`${validSignupData.first_name}'s Organization`);
      expect(response.body.organization.slug).toBeDefined();

      // Verify user in database
      const userResult = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [validSignupData.email]
      );
      expect(userResult.rows.length).toBe(1);
      const user = userResult.rows[0];
      expect(user.email_verified).toBe(false);
      expect(user.email_verification_token).toBeTruthy();
      expect(user.current_organization_id).toBeTruthy();

      // Verify organization was created
      const orgResult = await pool.query(
        'SELECT * FROM organizations WHERE id = $1',
        [user.current_organization_id]
      );
      expect(orgResult.rows.length).toBe(1);
      const org = orgResult.rows[0];
      expect(org.plan_tier).toBe('free');
      expect(org.owner_id).toBe(user.id);

      // Verify user is a member with owner role
      const memberResult = await pool.query(
        'SELECT * FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [org.id, user.id]
      );
      expect(memberResult.rows.length).toBe(1);
      expect(memberResult.rows[0].role).toBe('owner');

      // Verify 5 usage quotas were created
      const quotaResult = await pool.query(
        'SELECT * FROM usage_quotas WHERE organization_id = $1 ORDER BY dimension',
        [org.id]
      );
      expect(quotaResult.rows.length).toBe(5);

      const quotas = quotaResult.rows;
      const quotaMap = new Map(quotas.map(q => [q.dimension, q]));

      // Verify sites quota
      expect(quotaMap.get('sites')).toBeDefined();
      expect(quotaMap.get('sites').quota_limit).toBe('1');
      expect(quotaMap.get('sites').current_usage).toBe('0');
      expect(quotaMap.get('sites').period_end).toBeNull();

      // Verify posts quota
      expect(quotaMap.get('posts')).toBeDefined();
      expect(quotaMap.get('posts').quota_limit).toBe('20');
      expect(quotaMap.get('posts').period_end).toBeNull();

      // Verify users quota
      expect(quotaMap.get('users')).toBeDefined();
      expect(quotaMap.get('users').quota_limit).toBe('2');

      // Verify storage_bytes quota
      expect(quotaMap.get('storage_bytes')).toBeDefined();
      expect(quotaMap.get('storage_bytes').quota_limit).toBe('524288000'); // 500MB

      // Verify api_calls quota with monthly reset
      expect(quotaMap.get('api_calls')).toBeDefined();
      expect(quotaMap.get('api_calls').quota_limit).toBe('10000');
      expect(quotaMap.get('api_calls').period_end).toBeTruthy(); // Should have a period_end
    });

    it('should return verification URL for all environments', async () => {
      // TEMPORARY: Until SF-013 implements email sending, verification URL
      // is returned in all environments to allow signup to work
      const response = await request(app)
        .post('/auth/signup')
        .send({
          ...validSignupData,
          email: 'url-test-signup@example.com',
        });

      expect(response.status).toBe(201);
      expect(response.body.verificationUrl).toBeDefined();
      expect(response.body.verificationUrl).toContain('/verify-email?token=');

      // Verify the token in the URL matches the user's token
      const token = response.body.verificationUrl.split('token=')[1];
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(32); // Should be hex-encoded 32 bytes
    });

    it('should fail with duplicate email', async () => {
      // First signup
      await request(app)
        .post('/auth/signup')
        .send(validSignupData);

      // Second signup with same email
      const response = await request(app)
        .post('/auth/signup')
        .send(validSignupData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User already exists');
    });

    it('should fail with missing required fields', async () => {
      const testCases = [
        { data: { ...validSignupData, email: undefined }, field: 'email' },
        { data: { ...validSignupData, password: undefined }, field: 'password' },
        { data: { ...validSignupData, first_name: undefined }, field: 'first_name' },
        { data: { ...validSignupData, last_name: undefined }, field: 'last_name' },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/auth/signup')
          .send(testCase.data);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app)
        .post('/auth/signup')
        .send({
          ...validSignupData,
          email: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });

    it('should fail with short password', async () => {
      const response = await request(app)
        .post('/auth/signup')
        .send({
          ...validSignupData,
          email: 'short-pass-test-signup@example.com',
          password: '12345', // Less than 6 characters
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });

    it('should generate unique slugs with random suffixes', async () => {
      // Signup twice with same first name to test slug uniqueness
      const firstSignup = await request(app)
        .post('/auth/signup')
        .send({
          ...validSignupData,
          email: 'slug-test-1-signup@example.com',
        });

      const secondSignup = await request(app)
        .post('/auth/signup')
        .send({
          ...validSignupData,
          email: 'slug-test-2-signup@example.com',
        });

      // Both should succeed
      expect(firstSignup.status).toBe(201);
      expect(secondSignup.status).toBe(201);

      // Slugs should be different due to random suffixes
      expect(firstSignup.body.organization.slug).not.toBe(secondSignup.body.organization.slug);
    });
  });

  describe('GET /auth/verify-email', () => {
    let verificationToken: string;
    let userEmail: string;

    beforeEach(async () => {
      // Create a user with verification token
      userEmail = 'verify-test-signup@example.com';
      verificationToken = 'test-verification-token-' + Date.now();

      const hashedPass = await hashPassword('TestPass123!');
      await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, email_verification_token)
         VALUES ($1, $2, 'Test', 'User', false, $3)`,
        [userEmail, hashedPass, verificationToken]
      );
    });

    it('should verify email with valid token', async () => {
      const response = await request(app)
        .get(`/auth/verify-email?token=${verificationToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('verified successfully');
      expect(response.body.email).toBe(userEmail);

      // Verify user is marked as verified
      const userResult = await pool.query(
        'SELECT email_verified, email_verification_token FROM users WHERE email = $1',
        [userEmail]
      );
      expect(userResult.rows[0].email_verified).toBe(true);
      expect(userResult.rows[0].email_verification_token).toBeNull();
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/auth/verify-email?token=invalid-token');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should fail with missing token', async () => {
      const response = await request(app)
        .get('/auth/verify-email');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('token is required');
    });

    it('should handle already verified email gracefully', async () => {
      // Verify once
      await request(app)
        .get(`/auth/verify-email?token=${verificationToken}`);

      // Try to verify again (token is now null)
      const response = await request(app)
        .get(`/auth/verify-email?token=${verificationToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('POST /auth/login - Email Verification Check', () => {
    it('should block login for unverified users', async () => {
      // Create unverified user via signup
      const signupResponse = await request(app)
        .post('/auth/signup')
        .send({
          email: 'unverified-login-test-signup@example.com',
          password: 'TestPass123!',
          first_name: 'Unverified',
          last_name: 'User',
        });

      expect(signupResponse.status).toBe(201);

      // Try to login without verifying
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'unverified-login-test-signup@example.com',
          password: 'TestPass123!',
        });

      expect(loginResponse.status).toBe(403);
      expect(loginResponse.body.error).toContain('verify your email');
      expect(loginResponse.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should allow login for verified users', async () => {
      // Create user via signup (verification URL now returned in all environments)
      const signupResponse = await request(app)
        .post('/auth/signup')
        .send({
          email: 'verified-login-test-signup@example.com',
          password: 'TestPass123!',
          first_name: 'Verified',
          last_name: 'User',
        });

      const verificationToken = signupResponse.body.verificationUrl?.split('token=')[1];
      expect(verificationToken).toBeTruthy();

      // Verify email
      const verifyResponse = await request(app)
        .get(`/auth/verify-email?token=${verificationToken}`);
      expect(verifyResponse.status).toBe(200);

      // Now login should work
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'verified-login-test-signup@example.com',
          password: 'TestPass123!',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.message).toBe('Login successful');
      expect(loginResponse.body.token).toBeDefined();
    });

    it('should allow login for legacy users without email_verified field', async () => {
      // Create a legacy user (email_verified = null, simulating pre-SF-008 user)
      const hashedPass = await hashPassword('LegacyPass123!');
      await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, 'Legacy', 'User', 'author')`,
        ['legacy-user-test-signup@example.com', hashedPass]
      );

      // Login should work (email_verified is null for legacy users)
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'legacy-user-test-signup@example.com',
          password: 'LegacyPass123!',
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.message).toBe('Login successful');
    });
  });

  describe('Transaction Safety', () => {
    it('should create all entities atomically in transaction', async () => {
      // Verify signup creates everything together
      const response = await request(app)
        .post('/auth/signup')
        .send({
          email: 'atomic-test-signup@example.com',
          password: 'TestPass123!',
          first_name: 'Atomic',
          last_name: 'Test',
        });

      expect(response.status).toBe(201);

      // Verify user was created
      const userResult = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        ['atomic-test-signup@example.com']
      );
      expect(userResult.rows.length).toBe(1);
      const user = userResult.rows[0];

      // Verify quotas match user's current_organization_id
      const quotaResult = await pool.query(
        'SELECT * FROM usage_quotas WHERE organization_id = $1',
        [user.current_organization_id]
      );
      expect(quotaResult.rows.length).toBe(5);

      // Verify organization exists
      const orgResult = await pool.query(
        'SELECT * FROM organizations WHERE id = $1',
        [user.current_organization_id]
      );
      expect(orgResult.rows.length).toBe(1);
    });
  });
});
