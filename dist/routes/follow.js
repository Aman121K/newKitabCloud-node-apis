// node-api/src/routes/follow.ts
import { Router } from 'express';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';
/*
Follow API – social follows. Requires JWT
- POST /api/follower: Toggle follow/unfollow by type={author|reader|publisher} and respective *_id.
  Useful to let users curate their feeds and author/reader/publisher updates.
*/
const router = Router();
router.post('/follower', requireJwt, async (req, res) => {
    try {
        const id = req.user?.id || req.user?.sub;
        const { type, author_id, reader_id, publisher_id } = req.body || {};
        if (type === 'author') {
            const [rows] = await pool.query(`SELECT id FROM author_followers WHERE author_id = ? AND user_id = ? LIMIT 1`, [author_id, id]);
            if (Array.isArray(rows) && rows[0]) {
                await pool.execute(`DELETE FROM author_followers WHERE id = ?`, [rows[0].id]);
                return res.json({ status: true, message: 'Unfollow Author' });
            }
            await pool.execute(`INSERT INTO author_followers (author_id, user_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`, [author_id, id]);
            return res.json({ status: true, message: 'Followed Author' });
        }
        if (type === 'reader') {
            const [rows] = await pool.query(`SELECT id FROM reader_followers WHERE reader_id = ? AND user_id = ? LIMIT 1`, [reader_id, id]);
            if (Array.isArray(rows) && rows[0]) {
                await pool.execute(`DELETE FROM reader_followers WHERE id = ?`, [rows[0].id]);
                return res.json({ status: true, message: 'Unfollow Reader' });
            }
            await pool.execute(`INSERT INTO reader_followers (reader_id, user_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`, [reader_id, id]);
            return res.json({ status: true, message: 'Follow Reader' });
        }
        if (type === 'publisher') {
            const [rows] = await pool.query(`SELECT id FROM publisher_followers WHERE publisher_id = ? AND user_id = ? LIMIT 1`, [publisher_id, id]);
            if (Array.isArray(rows) && rows[0]) {
                await pool.execute(`DELETE FROM publisher_followers WHERE id = ?`, [rows[0].id]);
                return res.json({ status: true, message: 'Unfollow Publisher' });
            }
            await pool.execute(`INSERT INTO publisher_followers (publisher_id, user_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`, [publisher_id, id]);
            return res.json({ status: true, message: 'Follow Publisher' });
        }
        return res.status(400).json({ status: false, message: 'Invalid type' });
    }
    catch (e) {
        return res.status(500).json({ status: false, message: e?.message || 'Internal error' });
    }
});
export default router;
