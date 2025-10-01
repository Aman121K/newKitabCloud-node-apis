// node-api/src/routes/publishers.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== PUBLISHERS ====================

// Get all publishers
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (name LIKE ? OR email LIKE ? OR about LIKE ? OR address LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `SELECT COUNT(*) as total FROM publishers ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT id, name, email, phone, about, address, website, image, status, created_at, updated_at
      FROM publishers 
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

// Get single publisher
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      'SELECT id, name, email, phone, about, address, website, image, status, created_at, updated_at FROM publishers WHERE id = ? AND status = 1', 
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Publisher not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create publisher
router.post('/', requireJwt, async (req, res) => {
  try {
    const { name, email, password, phone, about, address, website } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    
    // Check if email already exists
    const [existing]: any = await pool.query('SELECT id FROM publishers WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.execute(
      'INSERT INTO publishers (name, email, password, phone, about, address, website, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [name, email, hashedPassword, phone, about, address, website]
    );
    
    res.json({ success: true, message: 'Publisher created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update publisher
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, about, address, website } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }
    
    // Check if email already exists for another publisher
    const [existing]: any = await pool.query('SELECT id FROM publishers WHERE email = ? AND id != ?', [email, id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    
    await pool.execute(
      'UPDATE publishers SET name = ?, email = ?, phone = ?, about = ?, address = ?, website = ?, updated_at = NOW() WHERE id = ?',
      [name, email, phone, about, address, website, id]
    );
    
    res.json({ success: true, message: 'Publisher updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete publisher
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if publisher is being used by books
    const [books]: any = await pool.query('SELECT COUNT(*) as count FROM books WHERE publisher_id = ?', [id]);
    if (books[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete publisher that is being used by books' 
      });
    }
    
    await pool.execute('DELETE FROM publishers WHERE id = ?', [id]);
    res.json({ success: true, message: 'Publisher deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
