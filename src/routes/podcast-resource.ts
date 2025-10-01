// node-api/src/routes/podcast-resource.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== PODCAST RESOURCE ====================

// Get all podcasts
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE p.status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (p.name LIKE ? OR p.description LIKE ? OR a.name LIKE ? OR r.name LIKE ? OR c.category_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `
      SELECT COUNT(*) as total FROM podcasts p 
      LEFT JOIN authors a ON p.author_id = a.id 
      LEFT JOIN readers r ON p.reader_id = r.id 
      LEFT JOIN categories c ON p.category_id = c.id 
      ${whereClause}
    `;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT p.*, a.name as author_name, r.name as reader_name, c.category_name
      FROM podcasts p 
      LEFT JOIN authors a ON p.author_id = a.id 
      LEFT JOIN readers r ON p.reader_id = r.id 
      LEFT JOIN categories c ON p.category_id = c.id 
      ${whereClause}
      ORDER BY p.created_at DESC 
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

// Get single podcast
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`
      SELECT p.*, a.name as author_name, r.name as reader_name, c.category_name
      FROM podcasts p 
      LEFT JOIN authors a ON p.author_id = a.id 
      LEFT JOIN readers r ON p.reader_id = r.id 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = ? AND p.status = 1
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Podcast not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create podcast
router.post('/', requireJwt, async (req, res) => {
  try {
    const { name, description, author_id, reader_id, category_id } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }
    
    await pool.execute(
      `INSERT INTO podcasts (name, description, author_id, reader_id, category_id, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [name, description, author_id, reader_id, category_id]
    );
    
    res.json({ success: true, message: 'Podcast created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update podcast
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, author_id, reader_id, category_id } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }
    
    await pool.execute(
      `UPDATE podcasts SET name = ?, description = ?, author_id = ?, reader_id = ?, 
       category_id = ?, updated_at = NOW() 
       WHERE id = ?`,
      [name, description, author_id, reader_id, category_id, id]
    );
    
    res.json({ success: true, message: 'Podcast updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete podcast
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM podcasts WHERE id = ?', [id]);
    res.json({ success: true, message: 'Podcast deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
