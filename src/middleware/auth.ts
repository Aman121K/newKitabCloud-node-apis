import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../setup/env';

declare global {
	namespace Express {
		interface Request {
			user?: any;
		}
	}
}

export function requireJwt(req: Request, res: Response, next: NextFunction) {
	// Check for Laravel-style bypass token first
	const customToken = req.headers['x-custom-token'] as string;
	if (customToken && env.BYPASS_TOKEN && customToken === env.BYPASS_TOKEN) {
		// Bypass authentication with a fake user for testing
		req.user = { id: 1, sub: 1, email: 'bypass@test.com' };
		return next();
	}

	const header = req.headers.authorization || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
	if (!token) return res.status(401).json({ message: 'Unauthorized' });
	try {
		const payload = jwt.verify(token, env.JWT_SECRET);
		req.user = payload;
		return next();
	} catch {
		return res.status(401).json({ message: 'Invalid token' });
	}
}
