// node-api/src/routes/languages.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== LANGUAGES ====================

// Get all languages
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (name LIKE ? OR code LIKE ? OR native_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `SELECT COUNT(*) as total FROM languages ${whereClause}`;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT * FROM languages 
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

// Get single language
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM languages WHERE id = ? AND status = 1', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Language not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create language
router.post('/', requireJwt, async (req, res) => {
  try {
    const { name, code, native_name } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }
    
    await pool.execute(
      'INSERT INTO languages (name, code, native_name, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [name, code, native_name || name]
    );
    
    res.json({ success: true, message: 'Language created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update language
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, native_name } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }
    
    await pool.execute(
      'UPDATE languages SET name = ?, code = ?, native_name = ?, updated_at = NOW() WHERE id = ?',
      [name, code, native_name, id]
    );
    
    res.json({ success: true, message: 'Language updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete language
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if language is being used by books
    const [books]: any = await pool.query('SELECT COUNT(*) as count FROM books WHERE language_id = ?', [id]);
    if (books[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete language that is being used by books' 
      });
    }
    
    await pool.execute('DELETE FROM languages WHERE id = ?', [id]);
    res.json({ success: true, message: 'Language deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
