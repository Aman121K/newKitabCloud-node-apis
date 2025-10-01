import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { signToken } from '../utils/jwt';
import { getUserByEmail, getUserById, createUser, setOtp, verifyOtpCode, resetPasswordForEmail } from '../services/users';

/*
Auth API – when to use each endpoint
- POST /api/register: Create a new user account (email/password). Returns JWT + user.
- POST /api/login: Authenticate with email/password. Returns JWT + user.
- GET  /api/getIpInfo: Utility to fetch client IP/country info (public helper).
- GET  /api/backgroundImages: Public list of background images for app UI.
- POST /api/socialSignup: Create/login a user via social/provider_id, records device/fcm tokens.
- POST /api/socialLogin: Login (or create then login) by provider_id + password.
- POST /api/appleloginSignup: Same as socialSignup but tailored to Apple sign-in payloads.
- POST /api/forgot: Start password reset flow; generates and stores OTP (no email sent here).
- POST /api/verify-otp: Verify OTP from email for password reset.
- POST /api/reset-password: Finalize password reset after OTP verification.
Notes: All endpoints under this router are public except those that require JWT in other routers.
*/

const router = Router();

router.post('/register', async (req, res) => {
	try {
		const { full_name, email, password, password_confirmation, country } = req.body || {};
		if (!full_name || !email || !password || !password_confirmation) return res.status(200).json({ error: 'Validation failed' });
		if (password !== password_confirmation) return res.status(200).json({ error: 'Passwords do not match' });
		const existing = await getUserByEmail(email);
		if (existing) return res.status(200).json({ error: 'The email has already been taken.' });
		const user = await createUser({ full_name, email, password, country });
		if (!user) return res.status(500).json({ success: false, message: 'User creation failed.' });
		const token = signToken({ id: user.id, email: user.email });
		return res.json({ success: true, token, user });
	} catch (e: any) { return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(200).json({ error: { email: ['email is required'], password: ['password is required'] } });
		const user = await getUserByEmail(email);
		if (!user) return res.status(200).json({ success: false, message: 'Login credentials are invalid.' });
		const ok = await bcrypt.compare(password, user.password || '');
		if (!ok) return res.status(200).json({ success: false, message: 'Login credentials are invalid.' });
		const token = signToken({ id: user.id, email: user.email });
		const { password: _p, ...safe } = user;
		return res.json({ success: true, token, user: safe });
	} catch (e: any) { return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.get('/getIpInfo', async (req, res) => {
	try {
		const xfwd = (req.headers['x-forwarded-for'] as string) || '';
		const ip = xfwd.split(',')[0].trim() || (req.socket.remoteAddress || '');
		const r = await fetch('https://ipapi.co/json/');
		const data = await r.json();
		return res.json({ ip, ...data });
	} catch (e: any) { return res.status(500).json({ message: e?.message || 'Internal error' }); }
});

router.get('/backgroundImages', async (_req, res) => {
	try {
		console.log('backgroundImages api is calling');
		const [rows] = await pool.query('SELECT * FROM back_ground_images');
		return res.json({ status: true, data: rows });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.get('/country/lat-lng', async (req, res) => {
	try {
		const { lat, lng } = req.query;
		// This would typically use a geolocation service like Google Maps API
		// For now, return a mock response
		return res.json({ 
			success: true, 
			data: { 
				country: 'Unknown', 
				country_code: 'XX',
				lat: lat || 0,
				lng: lng || 0
			} 
		});
	} catch (e: any) { return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.post('/socialSignup', async (req, res) => {
	try {
		const { provider_id, password, device_type, device_token, fcm_token, email, full_name, country } = req.body || {};
		if (!provider_id || !password) return res.status(400).json({ success: false, message: 'provider_id and password required' });
		const [rows]: any = await pool.query('SELECT * FROM users WHERE provider_id = ? LIMIT 1', [provider_id]);
		if (Array.isArray(rows) && rows[0]) {
			await pool.execute('UPDATE users SET device_type=?, device_token=?, fcm_token=?, updated_at=NOW() WHERE provider_id = ?', [
				device_type || null, device_token || null, fcm_token || null, provider_id
			]);
			const u = rows[0];
			const ok = await bcrypt.compare(password, u.password);
			if (!ok) return res.status(400).json({ success: false, message: 'Login credentials are invalid.' });
			const token = signToken({ id: u.id, email: u.email });
			return res.json({ success: true, token, user: u });
		}
		const hash = await bcrypt.hash(password, 10);
		const [result]: any = await pool.execute(
			`INSERT INTO users (full_name, email, country, provider_id, password, device_type, device_token, fcm_token, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
			[full_name || '', email || '', country || null, provider_id, hash, device_type || null, device_token || null, fcm_token || null]
		);
		const id = result.insertId;
		const user = await getUserById(id);
		const token = signToken({ id, email: user?.email });
		return res.json({ success: true, token, user });
	} catch (e: any) { 
		return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.post('/socialLogin', async (req, res) => {
	try {
		const { provider_id, password } = req.body || {};
		if (!provider_id || !password) return res.status(400).json({ success: false, message: 'provider_id and password required' });
		const [rows]: any = await pool.query('SELECT * FROM users WHERE provider_id = ? LIMIT 1', [provider_id]);
		if (!(Array.isArray(rows) && rows[0])) {
			const { email, full_name, device_type, device_token, fcm_token, country } = req.body || {};
			const hash = await bcrypt.hash(password, 10);
			await pool.execute(
				`INSERT INTO users (full_name, email, country, provider_id, password, device_type, device_token, fcm_token, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
				[full_name || '', email || '', country || null, provider_id, hash, device_type || null, device_token || null, fcm_token || null]
			);
		}
		const [rows2]: any = await pool.query('SELECT * FROM users WHERE provider_id = ? LIMIT 1', [provider_id]);
		const u = rows2[0];
		const ok = await bcrypt.compare(password, u.password);
		if (!ok) return res.status(400).json({ success: false, message: 'Could not create token.' });
		const token = signToken({ id: u.id, email: u.email });
		return res.json({ success: true, token, user: u });
	} catch (e: any) { return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.post('/appleloginSignup', async (req, res) => {
	try {
		const { provider_id, password } = req.body || {};
		if (!provider_id || !password) return res.status(400).json({ success: false, message: 'provider_id and password required' });
		const { device_type, device_token, fcm_token, email, full_name, country } = req.body || {};
		const [exists]: any = await pool.query('SELECT * FROM users WHERE provider_id = ? LIMIT 1', [provider_id]);
		if (Array.isArray(exists) && exists[0]) {
			await pool.execute('UPDATE users SET device_type=?, device_token=?, fcm_token=?, updated_at=NOW() WHERE provider_id = ?', [
				device_type || null, device_token || null, fcm_token || null, provider_id
			]);
			const u = exists[0];
			const ok = await bcrypt.compare(password, u.password);
			if (!ok) return res.status(400).json({ success: false, message: 'Login credentials are invalid.' });
			const token = signToken({ id: u.id, email: u.email });
			return res.json({ success: true, token, user: u });
		}
		const hash = await bcrypt.hash(password, 10);
		const [ins]: any = await pool.execute(
			`INSERT INTO users (full_name, email, country, provider_id, password, device_type, device_token, fcm_token, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
			[full_name || '', email || '', country || null, provider_id, hash, device_type || null, device_token || null, fcm_token || null]
		);
		const id = ins.insertId;
		const user = await getUserById(id);
		const token = signToken({ id, email: user?.email });
		return res.json({ success: true, token, user });
	} catch (e: any) { return res.status(500).json({ success: false, message: e?.message || 'Internal error' }); }
});

router.post('/forgot', async (req, res) => {
	try {
		const { email } = req.body || {};
		if (!email) return res.status(422).json({ status: false, message: 'Validation errors', errors: { email: ['email is required'] } });
		const user = await getUserByEmail(email);
		if (!user) return res.json({ status: false, message: 'Email not found.' });
		const otp = Math.floor(1000 + Math.random() * 9000).toString();
		const expires = new Date(Date.now() + 5 * 60 * 1000);
		await setOtp(email, otp, expires);
		return res.json({ status: true, message: 'OTP sent to your email.' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.post('/verify-otp', async (req, res) => {
	try {
		const { email, otp } = req.body || {};
		if (!otp) return res.status(422).json({ status: false, message: 'Validation errors', errors: { otp: ['otp is required'] } });
		const ok = await verifyOtpCode(email, otp);
		if (!ok.ok) return res.json({ status: false, message: ok.message || 'Invalid OTP.' });
		return res.json({ status: true, message: 'OTP verified. You can now reset your password.' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

router.post('/reset-password', async (req, res) => {
	try {
		const { email, password, password_confirmation } = req.body || {};
		if (!password || password !== password_confirmation) return res.status(422).json({ status: false, message: 'Validation errors', errors: { password: ['password confirmation mismatch'] } });
		await resetPasswordForEmail(email, password);
		return res.json({ status: true, message: 'Password reset successfully.' });
	} catch (e: any) { return res.status(500).json({ status: false, message: e?.message || 'Internal error' }); }
});

export default router;

