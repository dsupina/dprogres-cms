import request from 'supertest';
import express from 'express';
import authRoutes from '../../routes/auth';

// Mock the database
jest.mock('../../utils/database');
jest.mock('../../utils/password');
jest.mock('../../utils/jwt');

import { query } from '../../utils/database';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateToken } from '../../utils/jwt';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockedComparePassword = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockedGenerateToken = generateToken as jest.MockedFunction<typeof generateToken>;

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123'
    };

    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'admin',
        first_name: 'John',
        last_name: 'Doe'
      };

      mockedQuery.mockResolvedValueOnce({ 
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });
      mockedComparePassword.mockResolvedValueOnce(true);
      mockedGenerateToken.mockReturnValueOnce('mock_token');

      const response = await request(app)
        .post('/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBe('mock_token');
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should fail with invalid email', async () => {
      mockedQuery.mockResolvedValueOnce({ 
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      const response = await request(app)
        .post('/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should fail with invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'admin'
      };

      mockedQuery.mockResolvedValueOnce({ 
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });
      mockedComparePassword.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should fail with missing email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
    });

    it('should fail with missing password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/register', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'password123',
          first_name: 'Jane',
          last_name: 'Doe'
        });

      expect(response.status).toBe(401);
    });

    // Note: Testing authenticated routes would require setting up proper auth middleware mocking
    // This is a simplified version - in a real test you'd mock the authenticateToken middleware
  });

  describe('GET /auth/me', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/auth/me');
      expect(response.status).toBe(401);
    });
  });
}); 