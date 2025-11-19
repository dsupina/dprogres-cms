"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path_1.default.join(__dirname, '../../uploads');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path_1.default.extname(file.originalname);
        const filename = `${uniqueSuffix}${extension}`;
        cb(null, filename);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('File type not allowed'), false);
    }
};
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});
router.get('/', auth_1.authenticateToken, auth_1.requireAuthor, async (req, res) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        let whereClause = '';
        const params = [];
        if (type) {
            whereClause = 'WHERE mime_type LIKE $1';
            params.push(`${type}%`);
        }
        const mediaQuery = `
      SELECT 
        m.*,
        u.first_name, u.last_name, u.email as uploader_email
      FROM media_files m
      LEFT JOIN users u ON m.uploaded_by = u.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
        params.push(limit, offset);
        const countQuery = `
      SELECT COUNT(*) FROM media_files m
      ${whereClause}
    `;
        const [mediaResult, countResult] = await Promise.all([
            (0, database_1.query)(mediaQuery, params),
            (0, database_1.query)(countQuery, params.slice(0, -2))
        ]);
        const mediaFiles = mediaResult.rows;
        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / Number(limit));
        res.json({
            data: mediaFiles,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalCount,
                totalPages,
                hasNextPage: Number(page) < totalPages,
                hasPreviousPage: Number(page) > 1
            }
        });
    }
    catch (error) {
        console.error('Get media error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/upload', auth_1.authenticateToken, auth_1.requireAuthor, (req, res, next) => {
    const handler = upload.single('file');
    handler(req, res, function (err) {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large', maxSize: '50MB' });
            }
            if (err.message === 'File type not allowed') {
                return res.status(400).json({ error: 'File type not allowed' });
            }
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const { alt_text } = req.body;
        const userId = req.user?.userId;
        let storedPath = `/uploads/${req.file.filename}`;
        const fullPath = path_1.default.join(__dirname, '../../uploads', req.file.filename);
        const ext = path_1.default.extname(req.file.originalname).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        try {
            if (isImage) {
                const baseName = path_1.default.basename(req.file.filename, ext);
                const webpName = `${baseName}.webp`;
                const thumbName = `${baseName}-thumb.webp`;
                const webpPath = path_1.default.join(__dirname, '../../uploads', webpName);
                const thumbPath = path_1.default.join(__dirname, '../../uploads', thumbName);
                await (0, sharp_1.default)(fullPath).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(webpPath);
                await (0, sharp_1.default)(fullPath).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbPath);
                storedPath = `/uploads/${webpName}`;
            }
        }
        catch (e) {
        }
        const insertQuery = `
      INSERT INTO media_files (
        filename, original_name, file_path, file_size, mime_type, 
        alt_text, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const values = [
            req.file.filename,
            req.file.originalname,
            storedPath,
            req.file.size,
            req.file.mimetype,
            alt_text,
            userId
        ];
        const result = await (0, database_1.query)(insertQuery, values);
        const mediaFile = result.rows[0];
        res.status(201).json({
            message: 'File uploaded successfully',
            data: mediaFile
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/upload-multiple', auth_1.authenticateToken, auth_1.requireAuthor, upload.array('files', 10), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        const userId = req.user?.userId;
        const uploadedFiles = [];
        for (const file of files) {
            const insertQuery = `
        INSERT INTO media_files (
          filename, original_name, file_path, file_size, mime_type, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
            const values = [
                file.filename,
                file.originalname,
                `/uploads/${file.filename}`,
                file.size,
                file.mimetype,
                userId
            ];
            const result = await (0, database_1.query)(insertQuery, values);
            uploadedFiles.push(result.rows[0]);
        }
        res.status(201).json({
            message: 'Files uploaded successfully',
            data: uploadedFiles
        });
    }
    catch (error) {
        console.error('Multiple upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', auth_1.authenticateToken, auth_1.requireAuthor, async (req, res) => {
    try {
        const { id } = req.params;
        const { alt_text } = req.body;
        const existingFile = await (0, database_1.query)('SELECT * FROM media_files WHERE id = $1', [id]);
        if (existingFile.rows.length === 0) {
            return res.status(404).json({ error: 'Media file not found' });
        }
        const updateQuery = `
      UPDATE media_files 
      SET alt_text = $1
      WHERE id = $2
      RETURNING *
    `;
        const result = await (0, database_1.query)(updateQuery, [alt_text, id]);
        const updatedFile = result.rows[0];
        res.json({
            message: 'Media file updated successfully',
            data: updatedFile
        });
    }
    catch (error) {
        console.error('Update media error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', auth_1.authenticateToken, auth_1.requireAuthor, async (req, res) => {
    try {
        const { id } = req.params;
        const existingFile = await (0, database_1.query)('SELECT * FROM media_files WHERE id = $1', [id]);
        if (existingFile.rows.length === 0) {
            return res.status(404).json({ error: 'Media file not found' });
        }
        const mediaFile = existingFile.rows[0];
        const filePath = path_1.default.join(__dirname, '../../uploads', mediaFile.filename);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
        await (0, database_1.query)('DELETE FROM media_files WHERE id = $1', [id]);
        res.json({ message: 'Media file deleted successfully' });
    }
    catch (error) {
        console.error('Delete media error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/:id', auth_1.authenticateToken, auth_1.requireAuthor, async (req, res) => {
    try {
        const { id } = req.params;
        const mediaQuery = `
      SELECT 
        m.*,
        u.first_name, u.last_name, u.email as uploader_email
      FROM media_files m
      LEFT JOIN users u ON m.uploaded_by = u.id
      WHERE m.id = $1
    `;
        const result = await (0, database_1.query)(mediaQuery, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Media file not found' });
        }
        res.json({ mediaFile: result.rows[0] });
    }
    catch (error) {
        console.error('Get media file error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=media.js.map