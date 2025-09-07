import jwt from 'jsonwebtoken';
import { env } from '../setup/env';

export function signToken(payload: { id: number; email?: string }) {
	return jwt.sign({ sub: payload.id, email: payload.email }, env.JWT_SECRET, { expiresIn: '7d' });
}


