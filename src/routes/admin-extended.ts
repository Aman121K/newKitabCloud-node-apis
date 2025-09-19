// node-api/src/routes/admin-extended.ts
// @ts-nocheck
import { Router } from 'express';
import { pool } from '../db/pool';
import { requireJwt } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPaginationParams, buildPaginationResult, buildSearchCondition, getSearchValues } from '../utils/pagination';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, '../../uploads/');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ==================== PODCASTS ====================
router.get('/podcasts', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['p.name', 'p.description', 'a.name', 'r.name', 'c.category_name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM podcasts p
      LEFT JOIN authors a ON p.author_id = a.id
      LEFT JOIN readers r ON p.reader_id = r.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT p.*, a.name as author_name, r.name as reader_name, c.category_name
      FROM podcasts p
      LEFT JOIN authors a ON p.author_id = a.id
      LEFT JOIN readers r ON p.reader_id = r.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/podcasts', requireJwt, upload.single('cover_image'), async (req, res) => {
  try {
    const { 
      name, description, author_id, reader_id, category_id, 
      background_color, release_date 
    } = req.body;
    
    const cover_image = req.file ? req.file.path : null;
    
    const [result]: any = await pool.execute(
      `INSERT INTO podcasts (name, description, author_id, reader_id, category_id, 
       cover_image, background_color, release_date, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [name, description, author_id, reader_id, category_id, 
       cover_image, background_color, release_date]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/podcasts/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT p.*, a.name as author_name, r.name as reader_name, c.category_name
      FROM podcasts p
      LEFT JOIN authors a ON p.author_id = a.id
      LEFT JOIN readers r ON p.reader_id = r.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Podcast not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/podcasts/:id', requireJwt as any, upload.single('cover_image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, description, author_id, reader_id, category_id, 
      background_color, release_date 
    } = req.body;
    
    const cover_image = req.file ? req.file.path : null;
    
    let updateFields = [
      'name = ?', 'description = ?', 'author_id = ?', 'reader_id = ?', 
      'category_id = ?', 'background_color = ?', 'release_date = ?', 
      'updated_at = NOW()'
    ];
    let values = [
      name, description, author_id, reader_id, category_id, 
      background_color, release_date
    ];
    
    if (cover_image) {
      updateFields.push('cover_image = ?');
      values.push(cover_image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE podcasts SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Podcast updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/podcasts/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM podcast_tags WHERE podcast_id = ?', [id]);
    await pool.execute('DELETE FROM podcasts WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Podcast deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/podcasts/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE podcasts SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Podcast status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== SUB CATEGORIES ====================
router.get('/sub-categories', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['sc.name', 'sc.description', 'c.category_name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM sub_categories sc
      LEFT JOIN categories c ON sc.category_id = c.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT sc.*, c.category_name
      FROM sub_categories sc
      LEFT JOIN categories c ON sc.category_id = c.id
      ${whereClause}
      ORDER BY sc.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sub-categories', requireJwt as any, upload.single('image'), async (req, res) => {
  try {
    const { name, category_id, description } = req.body;
    const image = req.file ? req.file.path : null;
    
    const [result]: any = await pool.execute(
      'INSERT INTO sub_categories (name, category_id, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [name, category_id, description]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/sub-categories/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT sc.*, c.category_name
      FROM sub_categories sc
      LEFT JOIN categories c ON sc.category_id = c.id
      WHERE sc.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sub Category not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/sub-categories/:id', requireJwt as any, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, description } = req.body;
    const image = req.file ? req.file.path : null;
    
    let updateFields = ['name = ?', 'category_id = ?', 'description = ?', 'updated_at = NOW()'];
    let values = [name, category_id, description];
    
    if (image) {
      updateFields.push('image = ?');
      values.push(image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE sub_categories SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Sub category updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/sub-categories/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM sub_categories WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Sub category deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sub-categories/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE sub_categories SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Sub category status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== NOTIFICATIONS ====================
router.get('/notifications', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['title', 'message', 'type'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM notifications ${whereClause}`;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM notifications 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/notifications', requireJwt, async (req, res) => {
  try {
    const { title, message, type, user_id, is_sent } = req.body;
    
    const [result]: any = await pool.execute(
      'INSERT INTO notifications (title, message, type, user_id, is_sent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [title, message, type, user_id, is_sent || 0]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/notifications/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute('SELECT * FROM notifications WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/notifications/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type, user_id, is_sent } = req.body;
    
    await pool.execute(
      'UPDATE notifications SET title = ?, message = ?, type = ?, user_id = ?, is_sent = ?, updated_at = NOW() WHERE id = ?',
      [title, message, type, user_id, is_sent, id]
    );
    
    return res.json({ success: true, message: 'Notification updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/notifications/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM notifications WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/notifications/:id/send', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('UPDATE notifications SET is_sent = 1, updated_at = NOW() WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ROLES & PERMISSIONS ====================
router.get('/roles', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'description'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM roles ${whereClause}`;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM roles 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/roles', requireJwt, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    const [result]: any = await pool.execute(
      'INSERT INTO roles (name, description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      [name, description]
    );
    
    // Handle permissions if provided
    if (permissions && Array.isArray(permissions)) {
      for (const permissionId of permissions) {
        await pool.execute(
          'INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [result.insertId, permissionId]
        );
      }
    }
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/roles/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    
    await pool.execute(
      'UPDATE roles SET name = ?, description = ?, updated_at = NOW() WHERE id = ?',
      [name, description, id]
    );
    
    // Update permissions if provided
    if (permissions && Array.isArray(permissions)) {
      await pool.execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      for (const permissionId of permissions) {
        await pool.execute(
          'INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [id, permissionId]
        );
      }
    }
    
    return res.json({ success: true, message: 'Role updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/roles/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await pool.execute('DELETE FROM roles WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/permissions', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'description'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM permissions ${whereClause}`;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM permissions 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== COMING SOON BOOKS ====================
router.get('/coming-soon-books', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['csb.title', 'csb.description', 'a.name', 'c.category_name', 'l.name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM coming_soon_books csb
      LEFT JOIN authors a ON csb.author_id = a.id
      LEFT JOIN categories c ON csb.category_id = c.id
      LEFT JOIN languages l ON csb.language_id = l.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT csb.*, a.name as author_name, c.category_name, l.name as language_name
      FROM coming_soon_books csb
      LEFT JOIN authors a ON csb.author_id = a.id
      LEFT JOIN categories c ON csb.category_id = c.id
      LEFT JOIN languages l ON csb.language_id = l.id
      ${whereClause}
      ORDER BY csb.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/coming-soon-books', requireJwt as any, upload.single('book_image'), async (req, res) => {
  try {
    const { 
      title, description, author_id, category_id, language_id, 
      expected_release_date, price 
    } = req.body;
    
    const book_image = req.file ? req.file.path : null;
    
    const [result]: any = await pool.execute(
      `INSERT INTO coming_soon_books (title, description, author_id, category_id, language_id, 
       book_image, expected_release_date, price, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, description, author_id, category_id, language_id, 
       book_image, expected_release_date, price]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/coming-soon-books/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT csb.*, a.name as author_name, c.category_name, l.name as language_name
      FROM coming_soon_books csb
      LEFT JOIN authors a ON csb.author_id = a.id
      LEFT JOIN categories c ON csb.category_id = c.id
      LEFT JOIN languages l ON csb.language_id = l.id
      WHERE csb.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coming Soon Book not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/coming-soon-books/:id', requireJwt as any, upload.single('book_image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, author_id, category_id, language_id, 
      expected_release_date, price, status 
    } = req.body;
    
    const book_image = req.file ? req.file.path : null;
    
    let updateFields = [
      'title = ?', 'description = ?', 'author_id = ?', 'category_id = ?', 
      'language_id = ?', 'expected_release_date = ?', 'price = ?', 
      'status = ?', 'updated_at = NOW()'
    ];
    let values = [
      title, description, author_id, category_id, language_id, 
      expected_release_date, price, status
    ];
    
    if (book_image) {
      updateFields.push('book_image = ?');
      values.push(book_image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE coming_soon_books SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Coming soon book updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/coming-soon-books/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM coming_soon_books WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Coming soon book deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ADVERTISEMENTS ====================
router.get('/advertisements', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['title', 'description', 'ad_url', 'position'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM advertisements ${whereClause}`;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM advertisements 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/advertisements', requireJwt as any, upload.single('ad_image'), async (req, res) => {
  try {
    const { 
      title, description, ad_url, position, start_date, end_date, 
      is_active, click_count 
    } = req.body;
    
    const ad_image = req.file ? req.file.path : null;
    
    const [result]: any = await pool.execute(
      `INSERT INTO advertisements (title, description, ad_url, ad_image, position, 
       start_date, end_date, is_active, click_count, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, description, ad_url, ad_image, position, 
       start_date, end_date, is_active || 1, click_count || 0]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/advertisements/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute('SELECT * FROM advertisements WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Advertisement not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/advertisements/:id', requireJwt as any, upload.single('ad_image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, ad_url, position, start_date, end_date, 
      is_active, click_count 
    } = req.body;
    
    const ad_image = req.file ? req.file.path : null;
    
    let updateFields = [
      'title = ?', 'description = ?', 'ad_url = ?', 'position = ?', 
      'start_date = ?', 'end_date = ?', 'is_active = ?', 'click_count = ?', 
      'updated_at = NOW()'
    ];
    let values = [
      title, description, ad_url, position, start_date, end_date, 
      is_active, click_count
    ];
    
    if (ad_image) {
      updateFields.push('ad_image = ?');
      values.push(ad_image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE advertisements SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Advertisement updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/advertisements/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM advertisements WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Advertisement deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== EPISODES ====================
router.get('/episodes', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['e.title', 'e.description', 'p.title', 'a.name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM episodes e
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN authors a ON e.author_id = a.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT e.*, p.title as podcast_title, a.name as author_name
      FROM episodes e
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN authors a ON e.author_id = a.id
      ${whereClause}
      ORDER BY e.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/episodes', requireJwt as any, upload.fields([
  { name: 'episode_thumbnail', maxCount: 1 },
  { name: 'episode_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { 
      title, description, podcast_id, author_id, duration, 
      episode_number, is_free, price 
    } = req.body;
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const episode_thumbnail = files?.episode_thumbnail?.[0]?.path || null;
    const episode_file = files?.episode_file?.[0]?.path || null;
    
    const [result]: any = await pool.execute(
      `INSERT INTO episodes (title, description, podcast_id, author_id, duration, 
       episode_number, episode_thumbnail, episode_file, is_free, price, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, description, podcast_id, author_id, duration, 
       episode_number, episode_thumbnail, episode_file, is_free || 0, price]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/episodes/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT e.*, p.name as podcast_name
      FROM episodes e
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      WHERE e.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Episode not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/episodes/:id', requireJwt as any, upload.fields([
  { name: 'episode_thumbnail', maxCount: 1 },
  { name: 'episode_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, podcast_id, author_id, duration, 
      episode_number, is_free, price, status 
    } = req.body;
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const episode_thumbnail = files?.episode_thumbnail?.[0]?.path || null;
    const episode_file = files?.episode_file?.[0]?.path || null;
    
    let updateFields = [
      'title = ?', 'description = ?', 'podcast_id = ?', 'author_id = ?', 
      'duration = ?', 'episode_number = ?', 'is_free = ?', 'price = ?', 
      'status = ?', 'updated_at = NOW()'
    ];
    let values = [
      title, description, podcast_id, author_id, duration, 
      episode_number, is_free || 0, price, status
    ];
    
    if (episode_thumbnail) {
      updateFields.push('episode_thumbnail = ?');
      values.push(episode_thumbnail);
    }
    
    if (episode_file) {
      updateFields.push('episode_file = ?');
      values.push(episode_file);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE episodes SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Episode updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/episodes/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM episodes WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Episode deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== EXPENSES ====================
router.get('/expenses', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['e.description', 'ec.name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const total = countResult[0].total;
    
    // Get expenses with pagination
    const query = `
      SELECT 
        e.id,
        e.description,
        e.amount,
        e.date,
        e.created_at,
        e.updated_at,
        ec.name as category_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      ${whereClause}
      ORDER BY e.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    
    const [rows]: any = await pool.execute(query, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, total, page, limit);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/expenses', requireJwt, async (req, res) => {
  try {
    const { description, amount, date, category_id } = req.body;
    
    const [result]: any = await pool.execute(
      'INSERT INTO expenses (description, amount, date, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [description, amount, date, category_id]
    );
    
    return res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: { id: result.insertId }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/expenses/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT e.*, ec.name as category_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.expense_category_id = ec.id
      WHERE e.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/expenses/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, date, category_id } = req.body;
    
    await pool.execute(
      'UPDATE expenses SET description = ?, amount = ?, date = ?, category_id = ?, updated_at = NOW() WHERE id = ?',
      [description, amount, date, category_id, id]
    );
    
    return res.json({
      success: true,
      message: 'Expense updated successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/expenses/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM expenses WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== BACKGROUND IMAGES ====================
router.get('/background-images', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['title', 'description'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM background_images
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const total = countResult[0].total;
    
    // Get background images with pagination
    const query = `
      SELECT 
        id,
        title,
        description,
        image,
        status,
        created_at,
        updated_at
      FROM background_images
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    
    const [rows]: any = await pool.execute(query, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, total, page, limit);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/background-images', requireJwt as any, upload.single('image'), async (req, res) => {
  try {
    const { title, description, status = 1 } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    
    const [result]: any = await pool.execute(
      'INSERT INTO background_images (title, description, image, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [title, description, image, status]
    );
    
    return res.status(201).json({
      success: true,
      message: 'Background image created successfully',
      data: { id: result.insertId }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/background-images/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute('SELECT * FROM background_images WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Background Image not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/background-images/:id', requireJwt as any, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;
    
    let updateFields = ['title = ?', 'description = ?', 'status = ?', 'updated_at = NOW()'];
    let updateValues = [title, description, status];
    
    if (req.file) {
      updateFields.push('image = ?');
      updateValues.push(`/uploads/${req.file.filename}`);
    }
    
    updateValues.push(id);
    
    await pool.execute(
      `UPDATE background_images SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    return res.json({
      success: true,
      message: 'Background image updated successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/background-images/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await pool.execute(
      'UPDATE background_images SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    return res.json({
      success: true,
      message: 'Background image status updated successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/background-images/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM background_images WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Background image deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== FEEDBACK ====================
// Submit feedback from client
router.post('/feedback', async (req, res) => {
  try {
    const { feedback, timestamp } = req.body || {};
    
    // Validate required fields
    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Feedback is required' 
      });
    }
    
    // Insert feedback into database
    const [result]: any = await pool.execute(
      'INSERT INTO feedback (feedback, timestamp, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      [feedback.trim(), timestamp ? new Date(timestamp) : new Date()]
    );
    
    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: { id: result.insertId }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get all feedback with pagination and search
router.get('/feedback', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['f.feedback', 'u.full_name', 'u.email'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.execute(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get feedback with pagination
    const dataQuery = `
      SELECT 
        f.id,
        f.feedback,
        f.timestamp,
        f.created_at,
        f.updated_at,
        u.id as user_id,
        u.full_name,
        u.email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${whereClause}
      ORDER BY f.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows]: any = await pool.execute(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get single feedback by ID
router.get('/feedback/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.execute(`
      SELECT 
        f.id,
        f.feedback,
        f.timestamp,
        f.created_at,
        f.updated_at,
        u.id as user_id,
        u.full_name,
        u.email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update feedback (admin only)
router.put('/feedback/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body || {};
    
    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Feedback is required' 
      });
    }
    
    await pool.execute(
      'UPDATE feedback SET feedback = ?, updated_at = NOW() WHERE id = ?',
      [feedback.trim(), id]
    );
    
    return res.json({
      success: true,
      message: 'Feedback updated successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Delete feedback (admin only)
router.delete('/feedback/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM feedback WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Feedback deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get feedback statistics
router.get('/feedback/stats', requireJwt, async (req, res) => {
  try {
    // Get total feedback count
    const [totalCount]: any = await pool.execute('SELECT COUNT(*) as total FROM feedback');
    
    // Get feedback count by month (last 6 months)
    const [monthlyCount]: any = await pool.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM feedback 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `);
    
    // Get recent feedback (last 7 days)
    const [recentCount]: any = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM feedback 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    return res.json({
      success: true,
      data: {
        total: totalCount[0].total,
        recent: recentCount[0].count,
        monthly: monthlyCount
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
