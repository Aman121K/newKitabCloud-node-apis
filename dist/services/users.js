import { pool } from '../db/pool';
import bcrypt from 'bcryptjs';
function sanitize(row) {
    if (!row)
        return row;
    const { password, ...rest } = row;
    return rest;
}
export async function getUserByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const row = Array.isArray(rows) && rows[0];
    return row || null;
}
export async function getUserById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const row = Array.isArray(rows) && rows[0];
    return row || null;
}
export async function createUser(input) {
    const hash = await bcrypt.hash(input.password, 10);
    const [result] = await pool.execute('INSERT INTO users (full_name, email, password, country, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())', [input.full_name, input.email, hash, input.country || null]);
    const id = result.insertId;
    return await getUserById(id);
}
export async function setOtp(email, otp, expiresAt) {
    await pool.execute('UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE email = ?', [otp, expiresAt, email]);
}
export async function verifyOtpCode(email, otp) {
    const user = await getUserByEmail(email);
    if (!user)
        return { ok: false, message: 'Email not found.' };
    if (!user.otp_code || user.otp_code !== otp)
        return { ok: false, message: 'Invalid OTP.' };
    if (user.otp_expires_at && new Date(user.otp_expires_at).getTime() < Date.now())
        return { ok: false, message: 'OTP has expired.' };
    return { ok: true };
}
export async function resetPasswordForEmail(email, newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password = ?, otp_code = NULL, otp_expires_at = NULL WHERE email = ?', [hash, email]);
}
export async function getUserWithRelations(id) {
    const user = await getUserById(id);
    if (!user)
        return null;
    const [catRows] = await pool.query(`SELECT c.* FROM categories c
		 JOIN user_categories uc ON uc.user_category_id = c.id
		 WHERE uc.user_id = ?`, [id]);
    const [langRows] = await pool.query(`SELECT l.* FROM languages l
		 JOIN user_languages ul ON ul.user_language_id = l.id
		 WHERE ul.user_id = ?`, [id]);
    const safe = sanitize(user);
    return { ...safe, categories: catRows, languages: langRows };
}
