// node-api/src/routes/authors.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== AUTHORS ====================

// Get all authors
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (name LIKE ? OR email LIKE ? OR about LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `SELECT COUNT(*) as total FROM authors ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT id, name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, image, status, created_at, updated_at
      FROM authors 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    
    const [rows]: any = await pool.query(query, [...params, Number(limit), offset]);
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        current_page: Number(page),
        per_page: Number(limit),
        total,
        last_page: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single author
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      'SELECT id, name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, image, status, created_at, updated_at FROM authors WHERE id = ? AND status = 1', 
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Author not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create author
router.post('/', requireJwt, async (req, res) => {
  try {
    const { name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    
    // Check if email already exists
    const [existing]: any = await pool.query('SELECT id FROM authors WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.execute(
      'INSERT INTO authors (name, email, password, phone, about, facebook, instagram, snapchat, twitter, youtube, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [name, email, hashedPassword, phone, about, facebook, instagram, snapchat, twitter, youtube]
    );
    
    res.json({ success: true, message: 'Author created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update author
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, about, facebook, instagram, snapchat, twitter, youtube } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }
    
    // Check if email already exists for another author
    const [existing]: any = await pool.query('SELECT id FROM authors WHERE email = ? AND id != ?', [email, id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    
    await pool.execute(
      'UPDATE authors SET name = ?, email = ?, phone = ?, about = ?, facebook = ?, instagram = ?, snapchat = ?, twitter = ?, youtube = ?, updated_at = NOW() WHERE id = ?',
      [name, email, phone, about, facebook, instagram, snapchat, twitter, youtube, id]
    );
    
    res.json({ success: true, message: 'Author updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete author
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if author is being used by books
    const [books]: any = await pool.query('SELECT COUNT(*) as count FROM books WHERE author_id = ?', [id]);
    if (books[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete author that is being used by books' 
      });
    }
    
    await pool.execute('DELETE FROM authors WHERE id = ?', [id]);
    res.json({ success: true, message: 'Author deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
