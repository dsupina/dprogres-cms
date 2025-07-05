import { Request, Response, NextFunction } from 'express';
import { authenticateToken, requireAuthor } from '../../middleware/auth';

// Mock JWT utility
jest.mock('../../utils/jwt');
import { verifyToken } from '../../utils/jwt';
const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', () => {
      const mockUser = {
        userId: 1,
        email: 'test@example.com',
        role: 'admin'
      };

      mockRequest.headers = {
        authorization: 'Bearer valid_token'
      };

      mockedVerifyToken.mockReturnValueOnce(mockUser);

      authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should reject request without authorization header', () => {
      mockRequest.headers = {};

      authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat'
      };

      authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid_token'
      };

      mockedVerifyToken.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      authenticateToken(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('requireAuthor', () => {
    it('should allow admin users', () => {
      mockRequest.user = {
        userId: 1,
        email: 'admin@example.com',
        role: 'admin'
      };

      requireAuthor(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should allow editor users', () => {
      mockRequest.user = {
        userId: 2,
        email: 'editor@example.com',
        role: 'editor'
      };

      requireAuthor(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should allow author users', () => {
      mockRequest.user = {
        userId: 3,
        email: 'author@example.com',
        role: 'author'
      };

      requireAuthor(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should reject users without proper role', () => {
      mockRequest.user = {
        userId: 4,
        email: 'user@example.com',
        role: 'user'
      };

      requireAuthor(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Author access required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject requests without user', () => {
      mockRequest.user = undefined;

      requireAuthor(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Author access required' });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
}); 