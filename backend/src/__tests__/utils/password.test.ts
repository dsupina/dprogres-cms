import { hashPassword, comparePassword } from '../../utils/password';

describe('Password Utilities', () => {
  const testPassword = 'testPassword123';

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically longer
    });

    it('should generate different hashes for the same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);
      expect(hash1).not.toBe(hash2); // Salt makes each hash unique
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const hash = await hashPassword(testPassword);
      const isMatch = await comparePassword(testPassword, hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashPassword(testPassword);
      const isMatch = await comparePassword('wrongPassword', hash);
      expect(isMatch).toBe(false);
    });

    it('should return false for empty password against hash', async () => {
      const hash = await hashPassword(testPassword);
      const isMatch = await comparePassword('', hash);
      expect(isMatch).toBe(false);
    });

    it('should handle comparing against invalid hash', async () => {
      const isMatch = await comparePassword(testPassword, 'invalid-hash');
      expect(isMatch).toBe(false);
    });
  });
}); 