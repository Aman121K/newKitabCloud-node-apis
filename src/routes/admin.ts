// node-api/src/routes/admin.ts
import { Router } from 'express';
import { pool } from '../db/pool';
import { requireJwt } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
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

// Helper function to get user ID from JWT
function getUserId(req: any) {
  return req.user?.id || req.user?.sub;
}

// ==================== DASHBOARD ====================
router.get('/dashboard', requireJwt, async (req, res) => {
  try {
    // Get dashboard statistics
    const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [bookCount] = await pool.query('SELECT COUNT(*) as count FROM books');
    const [authorCount] = await pool.query('SELECT COUNT(*) as count FROM authors');
    const [readerCount] = await pool.query('SELECT COUNT(*) as count FROM readers');
    const [publisherCount] = await pool.query('SELECT COUNT(*) as count FROM publishers');
    const [videoCount] = await pool.query('SELECT COUNT(*) as count FROM videos');
    const [podcastCount] = await pool.query('SELECT COUNT(*) as count FROM podcasts');
    const [subscriptionCount] = await pool.query('SELECT COUNT(*) as count FROM subscriptions');
    
    // Get recent books and authors
    const [recentBooks] = await pool.query(`
      SELECT b.*, a.name as author_name 
      FROM books b 
      LEFT JOIN authors a ON b.author_id = a.id 
      ORDER BY b.created_at DESC 
      LIMIT 5
    `);
    
    const [recentAuthors] = await pool.query(`
      SELECT * FROM authors 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    return res.json({
      success: true,
      data: {
        user: (userCount as any[])[0]?.count || 0,
        book: (bookCount as any[])[0]?.count || 0,
        author: (authorCount as any[])[0]?.count || 0,
        reader: (readerCount as any[])[0]?.count || 0,
        publisher: (publisherCount as any[])[0]?.count || 0,
        video: (videoCount as any[])[0]?.count || 0,
        podcast: (podcastCount as any[])[0]?.count || 0,
        subscription: (subscriptionCount as any[])[0]?.count || 0,
        recentbooks: recentBooks,
        recentauthor: recentAuthors
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CATEGORIES ====================
router.get('/categories', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['category_name', 'category_color'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM categories ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM categories 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/categories', requireJwt, upload.single('category_image'), async (req, res) => {
  try {
    const { category_name, category_color } = req.body;
    const category_image = req.file ? req.file.path : null;
    
    const [result]: any = await pool.execute(
      'INSERT INTO categories (category_name, category_image, category_color, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [category_name, category_image, category_color]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/categories/:id', requireJwt, upload.single('category_image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name, category_color } = req.body;
    const category_image = req.file ? req.file.path : null;
    
    let updateFields = ['category_name = ?', 'category_color = ?', 'updated_at = NOW()'];
    let values = [category_name, category_color];
    
    if (category_image) {
      updateFields.push('category_image = ?');
      values.push(category_image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE categories SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Category updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/categories/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/categories/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/categories/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE categories SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Category status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== USERS ====================
router.get('/users', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['full_name', 'email', 'phone', 'country', 'role'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM users 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/users', requireJwt, async (req, res) => {
  try {
    const { full_name, email, password, phone, country, role } = req.body || {};
    console.log("input values>>", full_name, email, password, phone, country, role);
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("hashedPassword>>", hashedPassword);
    
    const [result]: any = await pool.execute(
      'INSERT INTO users (full_name, email, password, country, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [full_name, email, hashedPassword, country, role]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/users/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, country, role, status } = req.body;
    
    await pool.execute(
      'UPDATE users SET full_name = ?, email = ?, phone = ?, country = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [full_name, email, phone, country, role, status, id]
    );
    
    return res.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/users/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/users/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/users/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'User status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== AUTHORS ====================
router.get('/authors', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'email', 'phone', 'about'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM authors ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM authors 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/authors', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube } = req.body;
    const image = req.file ? req.file.path : null;
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result]: any = await pool.execute(
      'INSERT INTO authors (name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube, image, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [name, email, hashedPassword, phone, about, facebook, instagram, snapchat, twitter, youtube, image]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/authors/:id', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, status } = req.body;
    const image = (req as any).file ? (req as any).file.path : null;

    let updateFields = ['name = ?', 'email = ?', 'phone = ?', 'about = ?', 'facebook = ?', 'instagram = ?', 'snapchat = ?', 'twitter = ?', 'youtube = ?', 'status = ?', 'updated_at = NOW()'];
    let values = [name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, status];
    if (image) {
      updateFields.push('image = ?');
      values.push(image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE authors SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Author updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/authors/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM authors WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Author deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/authors/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM authors WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Author not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/authors/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE authors SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Author status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== LANGUAGES ====================
router.get('/languages', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'code', 'native_name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM languages ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM languages 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/languages', requireJwt, async (req, res) => {
  try {
    const { name, code, native_name } = req.body;
    
    const [result]: any = await pool.execute(
      'INSERT INTO languages (name, code, native_name, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [name, code, native_name]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/languages/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, native_name, status } = req.body;
    
    await pool.execute(
      'UPDATE languages SET name = ?, code = ?, native_name = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [name, code, native_name, status, id]
    );
    
    return res.json({ success: true, message: 'Language updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/languages/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM languages WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Language deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/languages/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM languages WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Language not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/languages/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE languages SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Language status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== TAGS ====================
router.get('/tags', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'description', 'color'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM tags ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM tags 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tags', requireJwt, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    const [result]: any = await pool.execute(
      'INSERT INTO tags (name, description, color, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [name, description, color]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/tags/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, status } = req.body;
    
    await pool.execute(
      'UPDATE tags SET name = ?, description = ?, color = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [name, description, color, status, id]
    );
    
    return res.json({ success: true, message: 'Tag updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/tags/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM tags WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/tags/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM tags WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/tags/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE tags SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Tag status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PUBLISHERS ====================
router.get('/publishers', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'email', 'phone', 'about', 'address', 'website'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM publishers ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM publishers 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/publishers', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { name, email, password, phone, about, address, website, status } = req.body || {};
    const image = req.file ? req.file.path : null;
    const bcrypt = require('bcryptjs');
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    
    const [result]: any = await pool.execute(
      'INSERT INTO publishers (name, email, password, phone, about, address, website, image, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [name, email, hashedPassword, phone, about, address, website, image, status || 1]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/publishers/:id', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, about, address, website, status } = req.body || {};
    const image = req.file ? req.file.path : null;
    
    let updateFields = ['name = ?', 'email = ?', 'phone = ?', 'about = ?', 'address = ?', 'website = ?', 'status = ?', 'updated_at = NOW()'];
    let updateValues = [name, email, phone, about, address, website, status];
    
    if (image) {
      updateFields.push('image = ?');
      updateValues.push(image);
    }
    
    updateValues.push(id);
    
    await pool.execute(
      `UPDATE publishers SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    return res.json({ success: true, message: 'Publisher updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/publishers/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM publishers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Publisher deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/publishers/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM publishers WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Publisher not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/publishers/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    await pool.execute('UPDATE publishers SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Publisher status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== READERS ====================
router.get('/readers', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['name', 'email', 'phone', 'about'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM readers ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT * FROM readers 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder} 
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/readers', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube } = req.body;
    const image = req.file ? req.file.path : null;
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result]: any = await pool.execute(
      'INSERT INTO readers (name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube, image, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [name, email, hashedPassword, phone, about, facebook, instagram, snapchat, twitter, youtube, image]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/readers/:id', requireJwt, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, status } = req.body;
    const image = req.file ? req.file.path : null;
    
    let updateFields = ['name = ?', 'email = ?', 'phone = ?', 'about = ?', 'facebook = ?', 'instagram = ?', 'snapchat = ?', 'twitter = ?', 'youtube = ?', 'status = ?', 'updated_at = NOW()'];
    let values = [name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, status];
    
    if (image) {
      updateFields.push('image = ?');
      values.push(image);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE readers SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    return res.json({ success: true, message: 'Reader updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/readers/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM readers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Reader deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/readers/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM readers WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Reader not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/readers/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE readers SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Reader status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== BOOKS ====================
router.get('/books', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['b.title', 'b.description', 'a.name', 'r.name', 'p.name', 'c.category_name', 'l.name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN readers r ON b.reader_id = r.id
      LEFT JOIN publishers p ON b.publisher_id = p.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN languages l ON b.language_id = l.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT b.*, a.name as author_name, r.name as reader_name, p.name as publisher_name, c.category_name, l.name as language_name
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN readers r ON b.reader_id = r.id
      LEFT JOIN publishers p ON b.publisher_id = p.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN languages l ON b.language_id = l.id
      ${whereClause}
      ORDER BY b.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/books', requireJwt, upload.fields([
  { name: 'coverimage', maxCount: 1 },
  { name: 'bookfile', maxCount: 1 },
  { name: 'bookaudio', maxCount: 1 },
  { name: 'sample_audio', maxCount: 1 },
  { name: 'gif', maxCount: 1 }
]), async (req, res) => {
  try {
    const { 
      title, description, author_id, reader_id, publisher_id, 
      category_id, language_id, is_free, is_featured, price, 
      book_length, type, file_type, is_download, is_magazine, 
      coming_soon, ifunza_status, tags, color, average_rating
    } = req.body;
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const coverimage = files?.coverimage?.[0]?.path || null;
    const bookfile = files?.bookfile?.[0]?.path || null;
    const bookaudio = files?.bookaudio?.[0]?.path || null;
    const sample_audio = files?.sample_audio?.[0]?.path || null;
    const gif = files?.gif?.[0]?.path || null;
    
    const [result]: any = await pool.execute(
      `INSERT INTO books (title, description, author_id, reader_id, publisher_id, category_id, language_id, 
       coverimage, bookfile, bookaudio, sample_audio, gif, is_free, is_featured, price, book_length, 
       type, file_type, is_download, is_magazine, coming_soon, ifunza_status, color, average_rating, 
       status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, description, author_id, reader_id, publisher_id, category_id, language_id, 
       coverimage, bookfile, bookaudio, sample_audio, gif, is_free || 0, is_featured || 0, 
       price, book_length, type, file_type, is_download || 1, is_magazine || 0, 
       coming_soon || 0, ifunza_status || 0, color, average_rating || 0]
    );
    
    // Handle tags if provided
    if (tags && Array.isArray(tags)) {
      for (const tagId of tags) {
        await pool.execute(
          'INSERT INTO book_tags (book_id, tag_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [result.insertId, tagId]
        );
      }
    }
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/books/:id', requireJwt, upload.fields([
  { name: 'coverimage', maxCount: 1 },
  { name: 'bookfile', maxCount: 1 },
  { name: 'bookaudio', maxCount: 1 },
  { name: 'sample_audio', maxCount: 1 },
  { name: 'gif', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, author_id, reader_id, publisher_id, 
      category_id, language_id, is_free, is_featured, price, 
      book_length, type, file_type, is_download, is_magazine, 
      coming_soon, ifunza_status, status, tags, color, average_rating
    } = req.body;
    
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const coverimage = files?.coverimage?.[0]?.path || null;
    const bookfile = files?.bookfile?.[0]?.path || null;
    const bookaudio = files?.bookaudio?.[0]?.path || null;
    const sample_audio = files?.sample_audio?.[0]?.path || null;
    const gif = files?.gif?.[0]?.path || null;
    
    let updateFields = [
      'title = ?', 'description = ?', 'author_id = ?', 'reader_id = ?', 
      'publisher_id = ?', 'category_id = ?', 'language_id = ?', 
      'is_free = ?', 'is_featured = ?', 'price = ?', 'book_length = ?', 
      'type = ?', 'file_type = ?', 'is_download = ?', 'is_magazine = ?', 
      'coming_soon = ?', 'ifunza_status = ?', 'status = ?', 'color = ?', 
      'average_rating = ?', 'updated_at = NOW()'
    ];
    let values = [
      title, description, author_id, reader_id, publisher_id, 
      category_id, language_id, is_free || 0, is_featured || 0, 
      price, book_length, type, file_type, is_download || 1, 
      is_magazine || 0, coming_soon || 0, ifunza_status || 0, 
      status, color, average_rating || 0
    ];
    
    if (coverimage) {
      updateFields.push('coverimage = ?');
      values.push(coverimage);
    }
    
    if (bookfile) {
      updateFields.push('bookfile = ?');
      values.push(bookfile);
    }
    
    if (bookaudio) {
      updateFields.push('bookaudio = ?');
      values.push(bookaudio);
    }
    
    if (sample_audio) {
      updateFields.push('sample_audio = ?');
      values.push(sample_audio);
    }
    
    if (gif) {
      updateFields.push('gif = ?');
      values.push(gif);
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE books SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    // Update tags if provided
    if (tags && Array.isArray(tags)) {
      await pool.execute('DELETE FROM book_tags WHERE book_id = ?', [id]);
      for (const tagId of tags) {
        await pool.execute(
          'INSERT INTO book_tags (book_id, tag_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [id, tagId]
        );
      }
    }
    
    return res.json({ success: true, message: 'Book updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/books/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM book_tags WHERE book_id = ?', [id]);
    await pool.execute('DELETE FROM books WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Book deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/books/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`
      SELECT b.*, a.name as author_name, r.name as reader_name, p.name as publisher_name, 
             c.category_name, l.name as language_name
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.id
      LEFT JOIN readers r ON b.reader_id = r.id
      LEFT JOIN publishers p ON b.publisher_id = p.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN languages l ON b.language_id = l.id
      WHERE b.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    
    // Get tags for this book
    const [tags]: any = await pool.query(`
      SELECT t.* FROM tags t
      INNER JOIN book_tags bt ON t.id = bt.tag_id
      WHERE bt.book_id = ?
    `, [id]);
    
    const book = rows[0];
    book.tags = tags;
    
    return res.json({ success: true, data: book });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/books/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE books SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Book status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== VIDEOS ====================
router.get('/videos', requireJwt, async (req, res) => {
  try {
    const { page, limit, search, sortBy, sortOrder } = getPaginationParams(req.query);
    const offset = (page - 1) * limit;
    
    // Build search condition
    const searchFields = ['v.title', 'v.book_name', 'v.description', 'c.category_name', 'sc.name'];
    const searchCondition = buildSearchCondition(search, searchFields);
    const searchValues = getSearchValues(search, searchFields);
    
    // Build WHERE clause
    const whereClause = searchCondition ? `WHERE ${searchCondition}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id
      ${whereClause}
    `;
    const [countResult]: any = await pool.query(countQuery, searchValues);
    const totalItems = countResult[0]?.total || 0;
    
    // Get paginated data
    const dataQuery = `
      SELECT v.*, c.category_name, sc.name as sub_category_name
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id
      ${whereClause}
      ORDER BY v.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...searchValues, limit, offset]);
    
    const result = buildPaginationResult(rows as any[], totalItems, page, limit);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/videos', requireJwt, async (req, res) => {
  try {
    const { 
      title, book_name, description, category_id, sub_category_id, 
      type, url 
    } = req.body;
    
    const [result]: any = await pool.execute(
      `INSERT INTO videos (title, book_name, description, category_id, sub_category_id, 
       type, url, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, book_name, description, category_id, sub_category_id, type, url]
    );
    
    return res.json({ success: true, data: { id: result.insertId } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/videos/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, book_name, description, category_id, sub_category_id, 
      type, url 
    } = req.body;
    
    await pool.execute(
      `UPDATE videos SET title = ?, book_name = ?, description = ?, category_id = ?, 
       sub_category_id = ?, type = ?, url = ?, updated_at = NOW() WHERE id = ?`,
      [title, book_name, description, category_id, sub_category_id, type, url, id]
    );
    
    return res.json({ success: true, message: 'Video updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/videos/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM video_tags WHERE video_id = ?', [id]);
    await pool.execute('DELETE FROM videos WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/videos/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`
      SELECT v.*, c.category_name, sc.name as sub_category_name
      FROM videos v
      LEFT JOIN categories c ON v.category_id = c.id
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id
      WHERE v.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/videos/:id/status', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE videos SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    return res.json({ success: true, message: 'Video status updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== COUNTRIES ====================
// Get all countries with pagination and search
router.get('/countries', requireJwt, async (req, res) => {
  try {
    const { page, limit, search } = getPaginationParams(req);
    const searchCondition = buildSearchCondition(search, ['name', 'country_code', 'phone_code']);
    const searchValues = getSearchValues(search, ['name', 'country_code', 'phone_code']);

    // Get total count
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM countries WHERE deleted_at IS NULL ${searchCondition}`,
      searchValues
    );
    const total = (countResult as any)[0].total;

    // Get countries with pagination
    const [countries] = await pool.query(
      `SELECT id, name, country_code, phone_code, created_at, updated_at 
       FROM countries 
       WHERE deleted_at IS NULL ${searchCondition}
       ORDER BY name ASC 
       LIMIT ? OFFSET ?`,
      [...searchValues, limit, (page - 1) * limit]
    );

    const pagination = buildPaginationResult(countries as any[], total, page, limit);

    return res.json({
      success: true,
      data: countries,
      pagination
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get single country
router.get('/countries/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;

    const [countries] = await pool.query(
      'SELECT id, name, country_code, phone_code, created_at, updated_at FROM countries WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!(countries as any).length) {
      return res.status(404).json({ success: false, message: 'Country not found' });
    }

    return res.json({
      success: true,
      data: (countries as any)[0]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Create new country
router.post('/countries', requireJwt, async (req, res) => {
  try {
    const { name, country_code, phone_code } = req.body;

    // Validate required fields
    if (!name || !country_code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and country code are required' 
      });
    }

    // Check if country code already exists
    const [existing] = await pool.query(
      'SELECT id FROM countries WHERE country_code = ? AND deleted_at IS NULL',
      [country_code]
    );

    if ((existing as any).length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Country code already exists' 
      });
    }

    const [result] = await pool.query(
      'INSERT INTO countries (name, country_code, phone_code, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [name, country_code, phone_code || null]
    );

    const countryId = (result as any).insertId;

    // Get the created country
    const [newCountry] = await pool.query(
      'SELECT id, name, country_code, phone_code, created_at, updated_at FROM countries WHERE id = ?',
      [countryId]
    );

    return res.status(201).json({
      success: true,
      message: 'Country created successfully',
      data: (newCountry as any)[0]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update country
router.put('/countries/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, country_code, phone_code } = req.body;

    // Validate required fields
    if (!name || !country_code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and country code are required' 
      });
    }

    // Check if country exists
    const [existing] = await pool.query(
      'SELECT id FROM countries WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!(existing as any).length) {
      return res.status(404).json({ success: false, message: 'Country not found' });
    }

    // Check if country code already exists for another country
    const [duplicate] = await pool.query(
      'SELECT id FROM countries WHERE country_code = ? AND id != ? AND deleted_at IS NULL',
      [country_code, id]
    );

    if ((duplicate as any).length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Country code already exists' 
      });
    }

    await pool.query(
      'UPDATE countries SET name = ?, country_code = ?, phone_code = ?, updated_at = NOW() WHERE id = ?',
      [name, country_code, phone_code || null, id]
    );

    // Get the updated country
    const [updatedCountry] = await pool.query(
      'SELECT id, name, country_code, phone_code, created_at, updated_at FROM countries WHERE id = ?',
      [id]
    );

    return res.json({
      success: true,
      message: 'Country updated successfully',
      data: (updatedCountry as any)[0]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Delete country (soft delete)
router.delete('/countries/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if country exists
    const [existing] = await pool.query(
      'SELECT id FROM countries WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!(existing as any).length) {
      return res.status(404).json({ success: false, message: 'Country not found' });
    }

    // Check if country is being used by any users
    const [usersUsingCountry] = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE country = (SELECT name FROM countries WHERE id = ?)',
      [id]
    );

    if ((usersUsingCountry as any)[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete country as it is being used by users' 
      });
    }

    await pool.query(
      'UPDATE countries SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    return res.json({
      success: true,
      message: 'Country deleted successfully'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get all countries for dropdown (without pagination)
router.get('/countries/dropdown', requireJwt, async (req, res) => {
  try {
    const [countries] = await pool.query(
      'SELECT id, name, country_code, phone_code FROM countries WHERE deleted_at IS NULL ORDER BY name ASC'
    );

    return res.json({
      success: true,
      data: countries
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
