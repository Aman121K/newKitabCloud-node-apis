// node-api/src/routes/admin-extended.ts
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
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
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
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

router.put('/podcasts/:id', requireJwt, upload.single('cover_image'), async (req, res) => {
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
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
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/sub-categories', requireJwt, upload.single('image'), async (req, res) => {
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

router.put('/sub-categories/:id', requireJwt, upload.single('image'), async (req, res) => {
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM notifications 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM roles 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM permissions 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
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
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/coming-soon-books', requireJwt, upload.single('book_image'), async (req, res) => {
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

router.put('/coming-soon-books/:id', requireJwt, upload.single('book_image'), async (req, res) => {
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM advertisements 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/advertisements', requireJwt, upload.single('ad_image'), async (req, res) => {
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

router.put('/advertisements/:id', requireJwt, upload.single('ad_image'), async (req, res) => {
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
    const [countResult]: any = await pool.query(countQuery, searchValues);
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
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows, totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/episodes', requireJwt, upload.fields([
  { name: 'episode_thumbnail', maxCount: 1 },
  { name: 'episode_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { 
      title, description, podcast_id, author_id, duration, 
      episode_number, is_free, price 
    } = req.body;
    
    const episode_thumbnail = req.files?.episode_thumbnail?.[0]?.path || null;
    const episode_file = req.files?.episode_file?.[0]?.path || null;
    
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

router.put('/episodes/:id', requireJwt, upload.fields([
  { name: 'episode_thumbnail', maxCount: 1 },
  { name: 'episode_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, podcast_id, author_id, duration, 
      episode_number, is_free, price, status 
    } = req.body;
    
    const episode_thumbnail = req.files?.episode_thumbnail?.[0]?.path || null;
    const episode_file = req.files?.episode_file?.[0]?.path || null;
    
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

export default router;
