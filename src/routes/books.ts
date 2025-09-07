// node-api/src/routes/books.ts
import { Router } from 'express';
import { pool } from '../db/pool';
import { requireJwt } from '../middleware/auth';

/*
Books API – content discovery and interactions. Requires JWT
- GET  /api/books: List all books.
- GET  /api/books/:id: Detailed book with author/reader/publisher/category/language/tags/reviews.
- POST /api/books: Filter by { category, author, publisher, reader, language }.
- POST /api/review: Add review for book/reader/author/publisher; updates book average rating if provided.
- POST /api/search: Search across readers/authors/publishers/books.
- POST /api/book_played: Add played record for book (analytics).
- GET  /api/book_played: List books with recent play records.
- GET  /api/get_featured_books: Featured picks.
- GET  /api/booklike/:bookid: Toggle like on a book.
- GET  /api/bookmark/:bookid: Toggle bookmark.
- GET  /api/getLikedBooks: Books liked by the user.
- GET  /api/getBookmarkBooks: Books bookmarked by the user.
- GET  /api/getPlayedBookByTimeFrame/:timeframe: Top played (monthly|weekly|yearly).
- GET  /api/getFreeBooks: Free-to-read books.
*/

const router = Router();

router.get('/books', requireJwt, async (_req, res) => {
	try {
		const [rows] = await pool.query('SELECT * FROM books');
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/books/:id', requireJwt, async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		const [bookRows]: any = await pool.query('SELECT * FROM books WHERE id = ? LIMIT 1', [id]);
		if (!Array.isArray(bookRows) || !bookRows[0]) return res.status(404).json({ status: 'true', data: null });
		const book = bookRows[0];
		const [author] = await pool.query('SELECT * FROM authors WHERE id = ? LIMIT 1', [book.author_id]);
		const [reader] = await pool.query('SELECT * FROM readers WHERE id = ? LIMIT 1', [book.reader_id]);
		const [publisher] = await pool.query('SELECT * FROM publishers WHERE id = ? LIMIT 1', [book.publisher_id]);
		const [category] = await pool.query('SELECT * FROM categories WHERE id = ? LIMIT 1', [book.category_id]);
		const [language] = await pool.query('SELECT * FROM languages WHERE id = ? LIMIT 1', [book.language_id]);
		const [tags] = await pool.query(`SELECT t.* FROM tags t JOIN book_tags bt ON bt.tag_id = t.id WHERE bt.book_id = ?`, [id]);
		const [reviews] = await pool.query(
			`SELECT r.*, u.id as user_id, u.full_name, u.email
			 FROM reviews r LEFT JOIN users u ON u.id = r.user_id
			 WHERE r.reviewable_type = 'App\\\\Models\\\\Book' AND r.reviewable_id = ?`, [id]
		);
		return res.json({
			status: 'true',
			data: { ...book, author: (author as any[])[0] || null, reader: (reader as any[])[0] || null, publisher: (publisher as any[])[0] || null, category: (category as any[])[0] || null, language: (language as any[])[0] || null, review: reviews, tags }
		});
	} catch (e: any) { return res.status(500).json({ status: 'false', message: e?.message || 'Internal error' }); }
});

router.post('/books', requireJwt, async (req, res) => {
	try {
		const { category, author, publisher, reader, language } = req.body || {};
		let sql = 'SELECT * FROM books WHERE 1=1';
		const params: any[] = [];
		if (category) { sql += ' AND category_id = ?'; params.push(category); }
		if (author) { sql += ' AND author_id = ?'; params.push(author); }
		if (publisher) { sql += ' AND publisher_id = ?'; params.push(publisher); }
		if (reader) { sql += ' AND reader_id = ?'; params.push(reader); }
		if (language) { sql += ' AND language_id = ?'; params.push(language); }
		const [rows] = await pool.query(sql, params);
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.post('/review', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const { type, review, emoji, rating, bookid, readerid, authorid, publisherid, average_rating } = req.body || {};
		let reviewableType = '', reviewableId: number | undefined;
		if (type === 'book') { reviewableType = 'App\\\\Models\\\\Book'; reviewableId = bookid; }
		if (type === 'reader') { reviewableType = 'App\\\\Models\\\\Reader'; reviewableId = readerid; }
		if (type === 'author') { reviewableType = 'App\\\\Models\\\\Author'; reviewableId = authorid; }
		if (type === 'publisher') { reviewableType = 'App\\\\Models\\\\Publisher'; reviewableId = publisherid; }
		if (!reviewableType || !reviewableId) return res.status(400).json({ status: false, message: 'Invalid review target' });
		await pool.execute(
			`INSERT INTO reviews (rating, reviewable_id, reviewable_type, user_id, review, emoji, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
			[rating || 0, reviewableId, reviewableType, id, review || null, emoji ? JSON.stringify(emoji) : null]
		);
		if (type === 'book' && average_rating) await pool.execute(`UPDATE books SET average_rating = ? WHERE id = ?`, [average_rating, bookid]);
		return res.json({ status: 'true', data: 'Review Added' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.post('/search', requireJwt, async (req, res) => {
	try {
		const { query, type } = req.body || {};
		if (!query) return res.json({ status: 'true', data: [] });
		let table = '';
		if (type === 'reader') table = 'readers';
		if (type === 'author') table = 'authors';
		if (type === 'publisher') table = 'publishers';
		if (type === 'books') table = 'books';
		if (!table) return res.json({ status: 'true', data: [] });
		const nameCol = table === 'books' ? 'title' : 'name';
		const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${nameCol} LIKE ?`, [`%${query}%`]);
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.post('/book_played', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const { author_id, reader_id, publisher_id, book_id, category_id } = req.body || {};
		await pool.execute(
			`INSERT INTO book_playeds (author_id, reader_id, publisher_id, book_id, category_id, user_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
			[author_id || null, reader_id || null, publisher_id || null, book_id || null, category_id || null, id]
		);
		return res.json({ status: true, message: 'Added Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/book_played', requireJwt, async (_req, res) => {
	try {
		const [rows] = await pool.query(
			`SELECT b.*, bp.user_id, bp.created_at as played_at
			 FROM books b JOIN book_playeds bp ON bp.book_id = b.id
			 ORDER BY bp.created_at DESC`
		);
		return res.json({ status: true, data: rows });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/get_featured_books', requireJwt, async (_req, res) => {
	try {
		const [rows] = await pool.query(`SELECT * FROM books WHERE is_featured = 1`);
		return res.json({ ststus: true, book: rows });
	} catch (e: any) { return res.status(500).json({ ststus: false, message: e?.message || 'Internal error' }); }
});

router.get('/booklike/:bookid', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const bookId = parseInt(req.params.bookid, 10);
		const [rows]: any = await pool.query(`SELECT id FROM book_likes WHERE user_id = ? AND book_id = ? LIMIT 1`, [id, bookId]);
		if (Array.isArray(rows) && rows[0]) {
			await pool.execute(`DELETE FROM book_likes WHERE id = ?`, [rows[0].id]);
			return res.json({ status: 'true', message: 'Unlike Successfully' });
		}
		await pool.execute(`INSERT INTO book_likes (user_id, book_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`, [id, bookId]);
		return res.json({ status: 'true', message: 'Liked Successfully' });
	} catch (e: any) { return res.status(500).json({ status: 'false', message: e?.message || 'Internal error' }); }
});

router.get('/bookmark/:bookid', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const bookId = parseInt(req.params.bookid, 10);
		const [rows]: any = await pool.query(`SELECT id FROM bookmark_models WHERE user_id = ? AND book_id = ? LIMIT 1`, [id, bookId]);
		if (Array.isArray(rows) && rows[0]) {
			await pool.execute(`DELETE FROM bookmark_models WHERE id = ?`, [rows[0].id]);
			return res.json({ status: 'true', message: 'Unbookmarked' });
		}
		await pool.execute(`INSERT INTO bookmark_models (user_id, book_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`, [id, bookId]);
		return res.json({ status: 'true', message: 'Bookmarked' });
	} catch (e: any) { return res.status(500).json({ status: 'false', message: e?.message || 'Internal error' }); }
});

router.get('/getLikedBooks', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const [rows] = await pool.query(
			`SELECT b.* FROM books b JOIN book_likes bl ON bl.book_id = b.id WHERE bl.user_id = ?`, [id]
		);
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ status: 'false', message: e?.message || 'Internal error' }); }
});

router.get('/getBookmarkBooks', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const [rows] = await pool.query(
			`SELECT b.* FROM books b JOIN bookmark_models bm ON bm.book_id = b.id WHERE bm.user_id = ?`, [id]
		);
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ status: 'false', message: e?.message || 'Internal error' }); }
});

router.get('/getPlayedBookByTimeFrame/:timeframe', requireJwt, async (req, res) => {
	try {
		const tf = req.params.timeframe;
		let sql = '';
		if (tf === 'monthly') sql = `
			SELECT b.*, COUNT(bp.id) AS total_plays FROM books b
			JOIN book_playeds bp ON b.id = bp.book_id
			WHERE DATE_FORMAT(bp.created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
			GROUP BY b.id ORDER BY total_plays DESC LIMIT 10`;
		else if (tf === 'weekly') sql = `
			SELECT b.*, COUNT(bp.id) AS total_plays FROM books b
			JOIN book_playeds bp ON b.id = bp.book_id
			WHERE YEAR(bp.created_at) = YEAR(NOW()) AND (WEEK(bp.created_at) = WEEK(NOW()) OR WEEK(bp.created_at, 3) = WEEK(NOW()))
			GROUP BY b.id ORDER BY total_plays DESC LIMIT 10`;
		else if (tf === 'yearly') sql = `
			SELECT b.*, COUNT(bp.id) AS total_plays FROM books b
			JOIN book_playeds bp ON b.id = bp.book_id
			WHERE YEAR(bp.created_at) = YEAR(NOW())
			GROUP BY b.id ORDER BY total_plays DESC LIMIT 10`;
		else return res.json({ status: true, book: [] });
		const [rows] = await pool.query(sql);
		return res.json({ status: true, book: rows });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/getFreeBooks', requireJwt, async (_req, res) => {
	try {
		const [rows] = await pool.query(`SELECT * FROM books WHERE is_free = 1`);
		return res.json({ status: true, books: rows });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

export default router;