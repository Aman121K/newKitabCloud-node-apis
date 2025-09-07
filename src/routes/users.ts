// node-api/src/routes/users.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireJwt } from '../middleware/auth';
import { pool } from '../db/pool';
import { getUserById, getUserWithRelations } from '../services/users';

/*
User API – requires Authorization: Bearer <JWT>
- POST /api/verify_email: Triggers email verification link (stubbed OK response).
- POST /api/get_user: Returns the authenticated user + categories + languages.
- POST /api/save/category|language: Replace user categories/languages with provided list.
- POST /api/update/category|language: Alias of save; updates current selection.
- POST /api/get_user_data/:dataType: Returns user with relations (both categories, languages).
- POST /api/update: Update profile fields (hashes password if present).
- GET  /api/logout: Stateless logout (client discards JWT).
- GET  /api/destroy: Permanently delete the authenticated account.
*/

function uid(req: any) { return req.user?.id || req.user?.sub; }

const router = Router();

router.post('/verify_email', requireJwt, (_req, res) => res.json({ success: true, message: 'verification link has been sent to your email' }));

router.post('/get_user', requireJwt, async (req, res) => {
	try {
		const id = uid(req);
		const user = await getUserById(id);
		if (!user) return res.status(404).json({ message: 'User not found' });
		const userWith = await getUserWithRelations(id);
		return res.json({ user: userWith });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.post('/save/:dataType', requireJwt, async (req, res) => {
	try {
		const id = uid(req);
		const { dataType } = req.params;
		if (dataType === 'category') {
			const categories: number[] = req.body?.categories || [];
			await pool.execute('DELETE FROM user_categories WHERE user_id = ?', [id]);
			if (categories.length) {
				const values = categories.map((cid) => [id, cid]);
				await pool.query('INSERT INTO user_categories (user_id, user_category_id) VALUES ?', [values]);
			}
		} else {
			const languages: number[] = req.body?.languages || [];
			await pool.execute('DELETE FROM user_languages WHERE user_id = ?', [id]);
			if (languages.length) {
				const values = languages.map((lid) => [id, lid]);
				await pool.query('INSERT INTO user_languages (user_id, user_language_id) VALUES ?', [values]);
			}
		}
		const userWith = await getUserWithRelations(id);
		return res.json({ user: userWith });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.post('/update/:dataType', requireJwt, async (req, res) => {
	try {
		const id = uid(req);
		const { dataType } = req.params;
		if (dataType === 'category') {
			const categories: number[] = req.body?.categories || [];
			await pool.execute('DELETE FROM user_categories WHERE user_id = ?', [id]);
			if (categories.length) {
				const values = categories.map((cid) => [id, cid]);
				await pool.query('INSERT INTO user_categories (user_id, user_category_id) VALUES ?', [values]);
			}
		} else {
			const languages: number[] = req.body?.languages || [];
			await pool.execute('DELETE FROM user_languages WHERE user_id = ?', [id]);
			if (languages.length) {
				const values = languages.map((lid) => [id, lid]);
				await pool.query('INSERT INTO user_languages (user_id, user_language_id) VALUES ?', [values]);
			}
		}
		const userWith = await getUserWithRelations(id);
		return res.json({ user: userWith });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.post('/get_user_data/:_dataType', requireJwt, async (req, res) => {
	try {
		const id = uid(req);
		const userWith = await getUserWithRelations(id);
		return res.json({ user: userWith });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.post('/update', requireJwt, async (req, res) => {
	try {
		const id = uid(req);
		const payload: any = { ...req.body };
		if (payload.password) payload.password = await bcrypt.hash(payload.password, 10);
		const fields = Object.keys(payload);
		if (!fields.length) return res.json({ success: false, data: 'Nothing to update' });
		const setSql = fields.map((f) => `${f} = ?`).join(', ');
		const values = fields.map((f) => payload[f]);
		values.push(id);
		await pool.execute(`UPDATE users SET ${setSql} WHERE id = ?`, values);
		return res.json({ success: false, data: 'User Data Updated Successfully' });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/logout', requireJwt, (_req, res) => res.json({ success: true, message: 'User has been logged out' }));

router.get('/destroy', requireJwt, async (req, res) => {
	try {
		await pool.execute('DELETE FROM users WHERE id = ?', [uid(req)]);
		return res.json({ status: true, message: 'Account Deleted Successfully' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

export default router;