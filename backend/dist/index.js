"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const posts_1 = __importDefault(require("./routes/posts"));
const categories_1 = __importDefault(require("./routes/categories"));
const pages_1 = __importDefault(require("./routes/pages"));
const media_1 = __importDefault(require("./routes/media"));
const settings_1 = __importDefault(require("./routes/settings"));
const admin_1 = __importDefault(require("./routes/admin"));
const templates_1 = __importDefault(require("./routes/templates"));
<<<<<<< HEAD
const domains_1 = __importDefault(require("./routes/domains"));
const menus_1 = __importDefault(require("./routes/menus"));
const sites_1 = __importDefault(require("./routes/sites"));
const versions_simple_1 = __importDefault(require("./routes/versions_simple"));
const autosave_1 = __importDefault(require("./routes/autosave"));
const versions_1 = require("./routes/versions");
const domainValidation_1 = require("./middleware/domainValidation");
const siteResolver_1 = require("./middleware/siteResolver");
const database_1 = __importDefault(require("./utils/database"));
=======
>>>>>>> chore/preflight-stabilize
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);
const isLocalIp = (ip) => {
    if (!ip)
        return false;
    const normalized = ip.replace('::ffff:', '');
    return (normalized === '127.0.0.1' ||
        normalized === '::1' ||
        normalized.startsWith('127.') ||
        /^10\./.test(normalized) ||
        /^192\.168\./.test(normalized) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(normalized));
};
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 600 : 0,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests. Please wait a moment and retry.',
    skip: (req) => process.env.NODE_ENV !== 'production' || isLocalIp(req.ip),
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests. Please wait a moment and retry.' });
    },
});
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
app.use(limiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
    if (req.path === '/api/health' || req.path.startsWith('/uploads')) {
        return next();
    }
    (0, domainValidation_1.validateDomain)(req, res, next);
});
app.use((req, res, next) => {
    if (req.path === '/api/health' || req.path.startsWith('/uploads')) {
        return next();
    }
    (0, domainValidation_1.resolveDomain)(req, res, next);
});
const DOMAINS_SITES_ENABLED = process.env.DOMAINS_SITES_ENABLED || 'off';
if (DOMAINS_SITES_ENABLED !== 'off') {
    app.use((req, res, next) => {
        if (req.path === '/api/health' || req.path.startsWith('/uploads') || req.path.startsWith('/api/admin')) {
            return next();
        }
        (0, siteResolver_1.siteResolver)(req, res, next);
    });
}
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use('/api/auth', auth_1.default);
app.use('/api/posts', posts_1.default);
app.use('/api/categories', categories_1.default);
app.use('/api/pages', pages_1.default);
app.use('/api/media', media_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/admin/templates', templates_1.default);
<<<<<<< HEAD
app.use('/api/admin/domains', domains_1.default);
app.use('/api/admin/sites', sites_1.default);
app.use('/api/menus', menus_1.default);
app.use('/api/sites', sites_1.default);
app.use('/api', versions_simple_1.default);
app.use('/api', autosave_1.default);
app.use('/api/versions', (0, versions_1.createVersionRoutes)(database_1.default));
=======
>>>>>>> chore/preflight-stabilize
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'CMS API is running' });
});
app.use('*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
//# sourceMappingURL=index.js.map