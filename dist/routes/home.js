// node-api/src/routes/home.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';
/*
Home API – personalized content. Requires JWT
- GET /api/home_data: Home payload (ads, bookmarks, random authors/readers, 5 books per user category, free/coming soon).
- GET /api/home_data_with_language?language_id=: Filtered home-like data by language.
- GET /api/guest-data: Lightweight list for guests (recent + coming soon).
*/
const router = Router();
router.get('/home_data', requireJwt, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.sub;
        const [ads] = await pool.query('SELECT * FROM advertisements');
        const [cats] = await pool.query(`SELECT c.* FROM categories c
			 JOIN user_categories uc ON uc.user_category_id = c.id
			 WHERE uc.user_id = ?`, [userId]);
        for (const cat of Array.isArray(cats) ? cats : []) {
            const [books] = await pool.query(`SELECT b.* FROM books b WHERE b.category_id = ? ORDER BY RAND() LIMIT 5`, [cat.id]);
            cat.books = books;
        }
        const [bookmark] = await pool.query(`SELECT bm.*, b.* FROM bookmark_models bm JOIN books b ON b.id = bm.book_id WHERE bm.user_id = ?`, [userId]);
        const [coming] = await pool.query(`SELECT * FROM books WHERE coming_soon = 1 ORDER BY RAND() LIMIT 5`);
        const [freeBooks] = await pool.query(`SELECT * FROM books WHERE is_free = 1 ORDER BY RAND() LIMIT 5`);
        const [randomAuthors] = await pool.query(`SELECT * FROM authors ORDER BY RAND() LIMIT 10`);
        const [randomReaders] = await pool.query(`SELECT * FROM readers ORDER BY RAND() LIMIT 10`);
        return res.json({
            ads, bookmark,
            top_played_author: [], top_played_reader: [], top_played_book: [],
            author: randomAuthors, reader: randomReaders,
            categoryWithBooks: cats, categoryWithPodcast: [],
            user_has_subscription: false, free_books: freeBooks, coming_soon: coming,
        });
    }
    catch (e) {
        return res.status(500).json({ message: e?.message || 'Internal error' });
    }
});
router.get('/home_data_with_language', requireJwt, async (req, res) => {
    try {
        const languageId = parseInt(req.query.language_id || '0', 10);
        const [ads] = await pool.query('SELECT * FROM advertisements');
        const [cats] = await pool.query(`SELECT * FROM categories`);
        for (const cat of Array.isArray(cats) ? cats : []) {
            const [books] = await pool.query(`SELECT b.* FROM books b WHERE b.category_id = ? AND b.language_id = ? ORDER BY RAND() LIMIT 5`, [cat.id, languageId]);
            cat.books = books;
        }
        const [randomAuthors] = await pool.query(`SELECT * FROM authors WHERE language_id = ? ORDER BY RAND() LIMIT 10`, [languageId]);
        const [randomReaders] = await pool.query(`SELECT * FROM readers WHERE language_id = ? ORDER BY RAND() LIMIT 10`, [languageId]);
        return res.json({
            ads, bookmark: [],
            top_played_author: [], top_played_reader: [], top_played_book: [],
            author: randomAuthors, reader: randomReaders,
            categoryWithBooks: cats, categoryWithPodcast: [],
        });
    }
    catch (e) {
        return res.status(500).json({ message: e?.message || 'Internal error' });
    }
});
router.get('/guest-data', requireJwt, async (_req, res) => {
    try {
        const [coming] = await pool.query(`SELECT * FROM books WHERE coming_soon = 1 ORDER BY RAND() LIMIT 5`);
        const [books] = await pool.query(`SELECT * FROM books ORDER BY created_at DESC LIMIT 5`);
        return res.json({ newbooks: books, coming_soon: coming });
    }
    catch (e) {
        return res.status(500).json({ message: e?.message || 'Internal error' });
    }
});
export default router;
