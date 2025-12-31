import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET || JWT_SECRET === 'your-default-secret') {
  console.warn('Using default JWT secret - this should be changed in production');
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  organizationId?: number;
  isSuperAdmin?: boolean;
}

export const generateToken = (payload: JWTPayload): string => {
  try {
    return jwt.sign(payload as any, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
  } catch (error) {
    throw new Error('Error generating token');
  }
};

export const verifyToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as JWTPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.decode(token);
    return decoded as JWTPayload;
  } catch (error) {
    return null;
  }
}; 