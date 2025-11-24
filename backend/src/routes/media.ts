import express from 'express';
import { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { query } from '../utils/database';
import { authenticateToken, requireAuthor } from '../middleware/auth';
import { enforceStorageQuota } from '../middleware/quota';
import { quotaService } from '../services/QuotaService';

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
    fileSize: 50 * 1024 * 1024 // 50MB limit
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
      mediaFiles: mediaFiles,
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

// Upload single file (admin only) with basic image optimization
// Custom wrapper to handle multer errors and return friendly messages
router.post('/upload', authenticateToken, requireAuthor, (req: Request, res: Response, next) => {
  const handler = upload.single('file');
  handler(req as any, res as any, function(err: any) {
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
}, enforceStorageQuota(), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { alt_text } = req.body;
    const userId = req.user?.userId;

    // If image, generate a web-optimized copy (webp) and a thumbnail
    let storedPath = `/uploads/${req.file.filename}`;
    let totalStorageBytes = req.file.size; // Start with original file size
    const fullPath = path.join(__dirname, '../../uploads', req.file.filename);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    try {
      if (isImage) {
        const baseName = path.basename(req.file.filename, ext);
        const webpName = `${baseName}.webp`;
        const thumbName = `${baseName}-thumb.webp`;
        const webpPath = path.join(__dirname, '../../uploads', webpName);
        const thumbPath = path.join(__dirname, '../../uploads', thumbName);

        await sharp(fullPath).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(webpPath);
        await sharp(fullPath).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbPath);

        // P1 bug fix: Account for all derivative files in storage quota (SF-010)
        // Calculate actual total storage: original + webp + thumbnail
        if (fs.existsSync(webpPath)) {
          totalStorageBytes += fs.statSync(webpPath).size;
        }
        if (fs.existsSync(thumbPath)) {
          totalStorageBytes += fs.statSync(thumbPath).size;
        }

        // prefer webp as canonical path
        storedPath = `/uploads/${webpName}`;
      }
    } catch (e) {
      // If optimization fails, fall back to original upload
      // totalStorageBytes already set to req.file.size
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

    const result = await query(insertQuery, values);
    const mediaFile = result.rows[0];

    // Increment quota after successful upload (SF-010)
    const organizationId = req.user?.organizationId;
    if (organizationId) {
      const incrementResult = await quotaService.incrementQuota({
        organizationId,
        dimension: 'storage_bytes',
        amount: totalStorageBytes // P1 fix: Use actual total including derivatives
      });

      // P1 bug fix: Rollback upload if quota increment fails (SF-010)
      if (!incrementResult.success || !incrementResult.data) {
        console.error('[CRITICAL] Quota increment failed, rolling back upload:', {
          mediaId: mediaFile.id,
          organizationId,
          fileSize: totalStorageBytes,
          error: incrementResult.error,
        });

        // Rollback: Delete database record
        try {
          await query('DELETE FROM media_files WHERE id = $1', [mediaFile.id]);
        } catch (dbError) {
          console.error('[CRITICAL] Failed to delete media record during rollback:', dbError);
        }

        // Rollback: Delete all uploaded files (original + derivatives)
        const ext = path.extname(req.file.filename);
        const baseName = path.basename(req.file.filename, ext);
        const filesToDelete = [
          path.join(__dirname, '../../uploads', req.file.filename), // Original
          path.join(__dirname, '../../uploads', `${baseName}.webp`), // WebP
          path.join(__dirname, '../../uploads', `${baseName}-thumb.webp`), // Thumbnail
        ];

        for (const filePath of filesToDelete) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (fileError) {
            console.error(`[CRITICAL] Failed to delete file during rollback: ${filePath}`, fileError);
          }
        }

        return res.status(500).json({
          error: 'Upload failed due to quota tracking error',
          details: incrementResult.error,
        });
      }
    }

    res.status(201).json({
      message: 'File uploaded successfully',
      data: mediaFile
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload multiple files (admin only)
router.post('/upload-multiple', authenticateToken, requireAuthor, upload.array('files', 10), enforceStorageQuota(), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user?.userId;
    const uploadedFiles = [];

    let totalBytes = 0;
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
      totalBytes += file.size;
    }

    // Increment quota after successful upload (SF-010)
    const organizationId = req.user?.organizationId;
    if (organizationId && totalBytes > 0) {
      const incrementResult = await quotaService.incrementQuota({
        organizationId,
        dimension: 'storage_bytes',
        amount: totalBytes
      });

      // P1 bug fix: Rollback uploads if quota increment fails (SF-010)
      if (!incrementResult.success || !incrementResult.data) {
        console.error('[CRITICAL] Quota increment failed, rolling back multiple uploads:', {
          fileCount: uploadedFiles.length,
          organizationId,
          totalBytes,
          error: incrementResult.error,
        });

        // Rollback: Delete all database records
        const mediaIds = uploadedFiles.map(f => f.id);
        try {
          await query('DELETE FROM media_files WHERE id = ANY($1::int[])', [mediaIds]);
        } catch (dbError) {
          console.error('[CRITICAL] Failed to delete media records during rollback:', dbError);
        }

        // Rollback: Delete all uploaded files
        for (const file of files) {
          try {
            const filePath = path.join(__dirname, '../../uploads', file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (fileError) {
            console.error(`[CRITICAL] Failed to delete file during rollback: ${file.filename}`, fileError);
          }
        }

        return res.status(500).json({
          error: 'Upload failed due to quota tracking error',
          details: incrementResult.error,
        });
      }
    }

    res.status(201).json({
      message: 'Files uploaded successfully',
      data: uploadedFiles
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
      data: updatedFile
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

    // P1 bug fix: Calculate total storage before deletion for quota decrement (SF-010)
    // For images, we created: original, webp, and thumbnail
    const filePath = path.join(__dirname, '../../uploads', mediaFile.filename);
    const ext = path.extname(mediaFile.filename);
    const baseName = path.basename(mediaFile.filename, ext);
    const webpPath = path.join(__dirname, '../../uploads', `${baseName}.webp`);
    const thumbPath = path.join(__dirname, '../../uploads', `${baseName}-thumb.webp`);

    // Calculate total storage used (before deletion)
    let totalStorageBytes = 0;
    if (fs.existsSync(filePath)) {
      totalStorageBytes += fs.statSync(filePath).size;
    }
    if (fs.existsSync(webpPath)) {
      totalStorageBytes += fs.statSync(webpPath).size;
    }
    if (fs.existsSync(thumbPath)) {
      totalStorageBytes += fs.statSync(thumbPath).size;
    }

    // Delete files
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(webpPath)) {
      fs.unlinkSync(webpPath);
    }
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    // Delete from database
    await query('DELETE FROM media_files WHERE id = $1', [id]);

    // P1 bug fix: Decrement storage quota after deletion (SF-010)
    const organizationId = req.user?.organizationId;
    if (organizationId && totalStorageBytes > 0) {
      const decrementResult = await quotaService.decrementQuota({
        organizationId,
        dimension: 'storage_bytes',
        amount: totalStorageBytes,
      });

      if (!decrementResult.success) {
        // Log error but don't fail the deletion - media is already deleted
        console.error('[WARNING] Media deleted but quota decrement failed:', {
          mediaId: id,
          organizationId,
          storageBytes: totalStorageBytes,
          error: decrementResult.error,
        });
      }
    }

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

    res.json({
      mediaFile: result.rows[0],
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get media file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 