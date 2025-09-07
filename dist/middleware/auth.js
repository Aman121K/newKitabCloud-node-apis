import jwt from 'jsonwebtoken';
import { env } from '../setup/env';
export function requireJwt(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const payload = jwt.verify(token, env.JWT_SECRET);
        req.user = payload;
        return next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
}
