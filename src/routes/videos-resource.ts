// node-api/src/routes/videos-resource.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== VIDEOS RESOURCE ====================

// Get all videos
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE v.status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (v.title LIKE ? OR v.book_name LIKE ? OR v.description LIKE ? OR c.category_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `
      SELECT COUNT(*) as total FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id 
      ${whereClause}
    `;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT v.*, c.category_name, sc.name as sub_category_name
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id 
      ${whereClause}
      ORDER BY v.created_at DESC 
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

// Get single video
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`
      SELECT v.*, c.category_name, sc.name as sub_category_name
      FROM videos v 
      LEFT JOIN categories c ON v.category_id = c.id 
      LEFT JOIN sub_categories sc ON v.sub_category_id = sc.id 
      WHERE v.id = ? AND v.status = 1
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create video
router.post('/', requireJwt, async (req, res) => {
  try {
    const { title, book_name, description, category_id, sub_category_id, type, url } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }
    
    await pool.execute(
      `INSERT INTO videos (title, book_name, description, category_id, sub_category_id, type, url, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, book_name, description, category_id, sub_category_id, type, url]
    );
    
    res.json({ success: true, message: 'Video created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update video
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, book_name, description, category_id, sub_category_id, type, url } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }
    
    await pool.execute(
      `UPDATE videos SET title = ?, book_name = ?, description = ?, category_id = ?, 
       sub_category_id = ?, type = ?, url = ?, updated_at = NOW() 
       WHERE id = ?`,
      [title, book_name, description, category_id, sub_category_id, type, url, id]
    );
    
    res.json({ success: true, message: 'Video updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete video
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM videos WHERE id = ?', [id]);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
