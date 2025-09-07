import jwt from 'jsonwebtoken';
import { env } from '../setup/env';
export function signToken(payload) {
    return jwt.sign({ sub: payload.id, email: payload.email }, env.JWT_SECRET, { expiresIn: '7d' });
}
