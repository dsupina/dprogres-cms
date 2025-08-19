"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = express_1.default.Router();
router.post('/login', (0, validation_1.validate)(validation_1.loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const userResult = await (0, database_1.query)('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = userResult.rows[0];
        if (!user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValidPassword = await (0, password_1.comparePassword)(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = (0, jwt_1.generateToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        const { password_hash, ...userWithoutPassword } = user;
        res.json({
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/register', auth_1.authenticateToken, (0, validation_1.validate)(validation_1.registerSchema), async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Only admin can create new users' });
        }
        const { email, password, first_name, last_name } = req.body;
        const existingUser = await (0, database_1.query)('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await (0, password_1.hashPassword)(password);
        const result = await (0, database_1.query)('INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, created_at', [email, hashedPassword, first_name, last_name, 'author']);
        const newUser = result.rows[0];
        res.status(201).json({
            message: 'User created successfully',
            user: newUser
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const result = await (0, database_1.query)('SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: result.rows[0] });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/profile', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { first_name, last_name, email } = req.body;
        if (email) {
            const existingUser = await (0, database_1.query)('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
            if (existingUser.rows.length > 0) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }
        const result = await (0, database_1.query)('UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), email = COALESCE($3, email), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, email, first_name, last_name, role, updated_at', [first_name, last_name, email, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/password', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }
        const userResult = await (0, database_1.query)('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];
        const isValidPassword = await (0, password_1.comparePassword)(current_password, user.password_hash);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        const hashedPassword = await (0, password_1.hashPassword)(new_password);
        await (0, database_1.query)('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, userId]);
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/logout', auth_1.authenticateToken, (req, res) => {
    res.json({ message: 'Logged out successfully' });
});
exports.default = router;
//# sourceMappingURL=auth.js.map