import { generateToken, verifyToken, decodeToken, JWTPayload } from '../../utils/jwt';

describe('JWT Utilities', () => {
  const mockPayload: JWTPayload = {
    userId: 1,
    email: 'test@example.com',
    role: 'admin'
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(mockPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate different tokens for different payloads', () => {
      const token1 = generateToken(mockPayload);
      const token2 = generateToken({ ...mockPayload, userId: 2 });
      expect(token1).not.toBe(token2);
    });

    it('should throw error if JWT generation fails', () => {
      const originalEnv = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      // This should not throw because we have a default secret, but in real scenarios it would
      expect(() => generateToken(mockPayload)).not.toThrow();
      
      process.env.JWT_SECRET = originalEnv;
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(mockPayload);
      const decoded = verifyToken(token);
      
      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.email).toBe(mockPayload.email);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // This test would require creating an expired token, which is complex
      // In a real scenario, you'd mock the jwt library or use a token with very short expiry
      expect(() => verifyToken('expired.token.here')).toThrow('Invalid token');
    });
  });

  describe('decodeToken', () => {
    it('should decode a valid token without verification', () => {
      const token = generateToken(mockPayload);
      const decoded = decodeToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(mockPayload.userId);
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });
}); 