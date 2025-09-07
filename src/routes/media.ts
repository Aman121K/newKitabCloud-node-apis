// node-api/src/routes/media.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';

/*
Media API – curated lists and interactions. Requires JWT
- GET /api/audio: Categories -> 5 random audiobooks each.
- GET /api/ebooks: Categories -> 5 random ebooks each.
- GET /api/magazines: Categories that have magazines -> 5 each.
- GET /api/podcast: User categories -> 5 podcasts each.
- GET /api/videos: Categories -> 5 videos each.
- GET /api/getAudiobooksByLanguage?language_id=: Audio by language grouped by category.
- GET /api/getEbooksByLanguage?language_id=: Ebooks by language grouped by category.
- GET /api/getMagazinesByLanguage?language_id=: Magazines by language grouped by category.
- GET /api/getPodcastsByLanguage: Podcasts grouped by category.
- GET /api/getBooksByLanguageCategory?language_id=&category_id=: Books filtered by language/category.
- GET /api/getVideosByLanguage: Videos grouped by category.
- GET /api/videoLike/:video_id: Toggle like on a video.
- GET /api/podcastLike/:podcast_id: Toggle like on a podcast.
- GET /api/videoPlayed/:video_id: Increment plays and record played for video.
- GET /api/podcastPlayed/:podcast_id: Increment plays and record played for podcast.
*/

const router = Router();

router.get('/audio', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(
			`SELECT c.* FROM categories c WHERE EXISTS (SELECT 1 FROM books b WHERE b.category_id = c.id AND b.bookaudio IS NOT NULL AND b.bookaudio <> '')`
		);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND bookaudio IS NOT NULL AND bookaudio <> '' ORDER BY RAND() LIMIT 5`,
				[(cat as any).id]
			);
			(cat as any).books = books;
		}
		return res.json({ categoryWithAudioBooks: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/ebooks', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(
			`SELECT c.* FROM categories c WHERE EXISTS (SELECT 1 FROM books b WHERE b.category_id = c.id AND b.bookfile IS NOT NULL AND b.bookfile <> '')`
		);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND bookfile IS NOT NULL AND bookfile <> '' ORDER BY RAND() LIMIT 5`,
				[(cat as any).id]
			);
			(cat as any).books = books;
		}
		return res.json({ categoryWithEBooks: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/magazines', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(`SELECT * FROM categories`);
		const out: any[] = [];
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND is_magazine = 1 ORDER BY RAND() LIMIT 5`,
				[(cat as any).id]
			);
			if (Array.isArray(books) && (books as any[]).length) out.push({ ...(cat as any), books });
		}
		return res.json({ categoryWithMagazines: out });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/podcast', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const [cats] = await pool.query(
			`SELECT c.* FROM categories c JOIN user_categories uc ON uc.user_category_id = c.id WHERE uc.user_id = ?`, [id]
		);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [podcasts] = await pool.query(`SELECT * FROM podcasts WHERE category_id = ? ORDER BY RAND() LIMIT 5`, [(cat as any).id]);
			(cat as any).podcasts = podcasts;
		}
		return res.json({ categoryWithPodcast: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/videos', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(`SELECT * FROM categories WHERE EXISTS (SELECT 1 FROM videos v WHERE v.category_id = categories.id)`);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [videos] = await pool.query(`SELECT * FROM videos WHERE category_id = ? ORDER BY RAND() LIMIT 5`, [(cat as any).id]);
			(cat as any).videos = videos;
		}
		return res.json({ categoryWithVideos: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getAudiobooksByLanguage', requireJwt, async (req, res) => {
	try {
		const languageId = parseInt((req.query.language_id as string) || '0', 10);
		const [cats] = await pool.query(`SELECT * FROM categories`);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND language_id = ? AND bookaudio IS NOT NULL AND bookaudio <> '' ORDER BY RAND() LIMIT 5`,
				[(cat as any).id, languageId]
			);
			(cat as any).books = books;
		}
		return res.json({ categoryWithAudioBooks: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getEbooksByLanguage', requireJwt, async (req, res) => {
	try {
		const languageId = parseInt((req.query.language_id as string) || '0', 10);
		const [cats] = await pool.query(`SELECT * FROM categories`);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND language_id = ? AND bookfile IS NOT NULL AND bookfile <> '' ORDER BY RAND() LIMIT 5`,
				[(cat as any).id, languageId]
			);
			(cat as any).books = books;
		}
		return res.json({ categoryWithEBooks: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getMagazinesByLanguage', requireJwt, async (req, res) => {
	try {
		const languageId = parseInt((req.query.language_id as string) || '0', 10);
		const [cats] = await pool.query(`SELECT * FROM categories`);
		const out: any[] = [];
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [books] = await pool.query(
				`SELECT * FROM books WHERE category_id = ? AND language_id = ? AND is_magazine = 1 ORDER BY RAND() LIMIT 5`,
				[(cat as any).id, languageId]
			);
			if (Array.isArray(books) && (books as any[]).length) out.push({ ...(cat as any), books });
		}
		return res.json({ categoryWithMagazines: out });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getPodcastsByLanguage', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(`SELECT * FROM categories WHERE EXISTS (SELECT 1 FROM podcasts p WHERE p.category_id = categories.id)`);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [podcasts] = await pool.query(
				`SELECT * FROM podcasts WHERE category_id = ? ORDER BY RAND() LIMIT 5`,
				[(cat as any).id]
			);
			(cat as any).podcasts = podcasts;
		}
		return res.json({ categoryWithPodcast: cats });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getBooksByLanguageCategory', requireJwt, async (req, res) => {
	try {
		const languageId = req.query.language_id ? parseInt(req.query.language_id as string, 10) : undefined;
		const categoryId = req.query.category_id ? parseInt(req.query.category_id as string, 10) : undefined;
		let sql = 'SELECT * FROM books WHERE 1=1';
		const params: any[] = [];
		if (languageId) { sql += ' AND language_id = ?'; params.push(languageId); }
		if (categoryId) { sql += ' AND category_id = ?'; params.push(categoryId); }
		const [rows] = await pool.query(sql, params);
		return res.json({ status: 'true', data: rows });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/getVideosByLanguage', requireJwt, async (_req, res) => {
	try {
		const [cats] = await pool.query(`SELECT * FROM categories WHERE EXISTS (SELECT 1 FROM videos v WHERE v.category_id = categories.id)`);
		for (const cat of Array.isArray(cats) ? (cats as any[]) : []) {
			const [videos] = await pool.query(`SELECT * FROM videos WHERE category_id = ? ORDER BY RAND() LIMIT 5`, [(cat as any).id]);
			(cat as any).videos = videos;
		}
		return res.json(cats);
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/videoLike/:video_id', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const videoId = parseInt(req.params.video_id, 10);
		const likeableType = 'App\\\\Models\\\\Video';
		const [rows]: any = await pool.query(
			`SELECT id FROM likes WHERE user_id = ? AND likeable_id = ? AND likeable_type = ? LIMIT 1`, [id, videoId, likeableType]
		);
		if (Array.isArray(rows) && rows[0]) {
			await pool.execute(`DELETE FROM likes WHERE id = ?`, [rows[0].id]);
			return res.json({ status: true, message: 'Video Unliked Successfully' });
		}
		await pool.execute(
			`INSERT INTO likes (user_id, likeable_id, likeable_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`, [id, videoId, likeableType]
		);
		return res.json({ status: true, message: 'Video Liked Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/podcastLike/:podcast_id', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const podcastId = parseInt(req.params.podcast_id, 10);
		const likeableType = 'App\\\\Models\\\\Podcast';
		const [rows]: any = await pool.query(
			`SELECT id FROM likes WHERE user_id = ? AND likeable_id = ? AND likeable_type = ? LIMIT 1`, [id, podcastId, likeableType]
		);
		if (Array.isArray(rows) && rows[0]) {
			await pool.execute(`DELETE FROM likes WHERE id = ?`, [rows[0].id]);
			return res.json({ status: true, message: 'Podcast Unliked Successfully' });
		}
		await pool.execute(
			`INSERT INTO likes (user_id, likeable_id, likeable_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`, [id, podcastId, likeableType]
		);
		return res.json({ status: true, message: 'Podcast Liked Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/videoPlayed/:video_id', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const videoId = parseInt(req.params.video_id, 10);
		const playedType = 'App\\\\Models\\\\Video';
		await pool.execute(`UPDATE videos SET plays_count = COALESCE(plays_count,0) + 1 WHERE id = ?`, [videoId]);
		await pool.execute(
			`INSERT INTO playeds (user_id, played_id, played_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
			[id, videoId, playedType]
		);
		return res.json({ status: true, message: 'Count Added Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/podcastPlayed/:podcast_id', requireJwt, async (req: any, res) => {
	try {
		const id = req.user?.id || req.user?.sub;
		const podcastId = parseInt(req.params.podcast_id, 10);
		const playedType = 'App\\\\Models\\\\Podcast';
		await pool.execute(`UPDATE podcasts SET plays_count = COALESCE(plays_count,0) + 1 WHERE id = ?`, [podcastId]);
		await pool.execute(
			`INSERT INTO playeds (user_id, played_id, played_type, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
			[id, podcastId, playedType]
		);
		return res.json({ status: true, message: 'Count Added Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

export default router;