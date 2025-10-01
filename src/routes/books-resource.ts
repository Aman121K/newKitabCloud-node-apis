// node-api/src/routes/books-resource.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== BOOKS RESOURCE ====================

// Get all books
router.get('/', requireJwt, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE b.status = 1';
    let params: any[] = [];
    
    if (search) {
      whereClause += ' AND (b.title LIKE ? OR b.description LIKE ? OR a.name LIKE ? OR r.name LIKE ? OR p.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const countQuery = `
      SELECT COUNT(*) as total FROM books b 
      LEFT JOIN authors a ON b.author_id = a.id 
      LEFT JOIN readers r ON b.reader_id = r.id 
      LEFT JOIN publishers p ON b.publisher_id = p.id 
      ${whereClause}
    `;
    const [countResult]: any = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    const query = `
      SELECT b.*, a.name as author_name, r.name as reader_name, p.name as publisher_name, c.category_name, l.name as language_name
      FROM books b 
      LEFT JOIN authors a ON b.author_id = a.id 
      LEFT JOIN readers r ON b.reader_id = r.id 
      LEFT JOIN publishers p ON b.publisher_id = p.id 
      LEFT JOIN categories c ON b.category_id = c.id 
      LEFT JOIN languages l ON b.language_id = l.id 
      ${whereClause}
      ORDER BY b.created_at DESC 
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

// Get single book
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`
      SELECT b.*, a.name as author_name, r.name as reader_name, p.name as publisher_name, c.category_name, l.name as language_name
      FROM books b 
      LEFT JOIN authors a ON b.author_id = a.id 
      LEFT JOIN readers r ON b.reader_id = r.id 
      LEFT JOIN publishers p ON b.publisher_id = p.id 
      LEFT JOIN categories c ON b.category_id = c.id 
      LEFT JOIN languages l ON b.language_id = l.id 
      WHERE b.id = ? AND b.status = 1
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create book
router.post('/', requireJwt, async (req, res) => {
  try {
    const { 
      title, description, author_id, reader_id, publisher_id, category_id, language_id, 
      is_free, is_featured, price, bookaudio, bookpdf, bookimage, coming_soon 
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }
    
    await pool.execute(
      `INSERT INTO books (title, description, author_id, reader_id, publisher_id, category_id, language_id, 
       is_free, is_featured, price, bookaudio, bookpdf, bookimage, coming_soon, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [title, description, author_id, reader_id, publisher_id, category_id, language_id, 
       is_free || 0, is_featured || 0, price, bookaudio, bookpdf, bookimage, coming_soon || 0]
    );
    
    res.json({ success: true, message: 'Book created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update book
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, author_id, reader_id, publisher_id, category_id, language_id, 
      is_free, is_featured, price, bookaudio, bookpdf, bookimage, coming_soon 
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }
    
    await pool.execute(
      `UPDATE books SET title = ?, description = ?, author_id = ?, reader_id = ?, publisher_id = ?, 
       category_id = ?, language_id = ?, is_free = ?, is_featured = ?, price = ?, 
       bookaudio = ?, bookpdf = ?, bookimage = ?, coming_soon = ?, updated_at = NOW() 
       WHERE id = ?`,
      [title, description, author_id, reader_id, publisher_id, category_id, language_id, 
       is_free || 0, is_featured || 0, price, bookaudio, bookpdf, bookimage, coming_soon || 0, id]
    );
    
    res.json({ success: true, message: 'Book updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete book
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM books WHERE id = ?', [id]);
    res.json({ success: true, message: 'Book deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
