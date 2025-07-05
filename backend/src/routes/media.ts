import express from 'express';
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../utils/database';
import { authenticateToken, requireAuthor } from '../middleware/auth';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = `${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Allow only specific file types
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
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Get all media files (admin only)
router.get('/', authenticateToken, requireAuthor, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const params: any[] = [];

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
      query(mediaQuery, params),
      query(countQuery, params.slice(0, -2))
    ]);

    const mediaFiles = mediaResult.rows;
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / Number(limit));

    res.json({
      mediaFiles,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages,
        hasNextPage: Number(page) < totalPages,
        hasPreviousPage: Number(page) > 1
      }
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload single file (admin only)
router.post('/upload', authenticateToken, requireAuthor, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { alt_text } = req.body;
    const userId = req.user?.userId;

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
      `/uploads/${req.file.filename}`,
      req.file.size,
      req.file.mimetype,
      alt_text,
      userId
    ];

    const result = await query(insertQuery, values);
    const mediaFile = result.rows[0];

    res.status(201).json({
      message: 'File uploaded successfully',
      mediaFile
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload multiple files (admin only)
router.post('/upload-multiple', authenticateToken, requireAuthor, upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
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

      const result = await query(insertQuery, values);
      uploadedFiles.push(result.rows[0]);
    }

    res.status(201).json({
      message: 'Files uploaded successfully',
      mediaFiles: uploadedFiles
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update media file metadata (admin only)
router.put('/:id', authenticateToken, requireAuthor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { alt_text } = req.body;

    // Check if media file exists
    const existingFile = await query('SELECT * FROM media_files WHERE id = $1', [id]);
    if (existingFile.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const updateQuery = `
      UPDATE media_files 
      SET alt_text = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(updateQuery, [alt_text, id]);
    const updatedFile = result.rows[0];

    res.json({
      message: 'Media file updated successfully',
      mediaFile: updatedFile
    });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete media file (admin only)
router.delete('/:id', authenticateToken, requireAuthor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if media file exists
    const existingFile = await query('SELECT * FROM media_files WHERE id = $1', [id]);
    if (existingFile.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const mediaFile = existingFile.rows[0];

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../uploads', mediaFile.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await query('DELETE FROM media_files WHERE id = $1', [id]);

    res.json({ message: 'Media file deleted successfully' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media file info (admin only)
router.get('/:id', authenticateToken, requireAuthor, async (req: Request, res: Response) => {
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

    const result = await query(mediaQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    res.json({ mediaFile: result.rows[0] });
  } catch (error) {
    console.error('Get media file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 