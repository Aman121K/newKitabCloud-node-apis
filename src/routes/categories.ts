// node-api/src/routes/categories.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// ==================== CATEGORIES ====================

// Get all categories
router.get('/', requireJwt, async (req, res) => {
  try { 
    const query = `
      SELECT * FROM categories 
      ORDER BY created_at DESC 
    `;
    
    const [rows]: any = await pool.query(query);
    
    res.json({
      success: true,
      data: rows,
      
    });
  } catch (error: any) {
    console.log('error', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single category
router.get('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ? AND status = 1', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create category
router.post('/', requireJwt, async (req, res) => {
  try {
    const { category_name, category_color } = req.body;
    
    if (!category_name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    
    await pool.execute(
      'INSERT INTO categories (category_name, category_color, status, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())',
      [category_name, category_color || '#705ec8']
    );
    
    res.json({ success: true, message: 'Category created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update category
router.put('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name, category_color } = req.body;
    
    if (!category_name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    
    await pool.execute(
      'UPDATE categories SET category_name = ?, category_color = ?, updated_at = NOW() WHERE id = ?',
      [category_name, category_color, id]
    );
    
    res.json({ success: true, message: 'Category updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete category
router.delete('/:id', requireJwt, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if category is being used by books
    const [books]: any = await pool.query('SELECT COUNT(*) as count FROM books WHERE category_id = ?', [id]);
    if (books[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete category that is being used by books' 
      });
    }
    
    await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
