import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from '../web/routes';

export function createApp() {
	const app = express();

	app.use(helmet());
	app.use(cors());
	app.use(express.json({ limit: '2mb' }));
	app.use(express.urlencoded({ extended: true }));
	app.use(compression());
	app.use(morgan('dev'));
	app.use(
		rateLimit({
			windowMs: 60 * 1000,
			max: 300,
			standardHeaders: true,
			legacyHeaders: false,
		})
	);

	registerRoutes(app);

	app.get('/health', (_req, res) => {
		res.json({ ok: true });
	});

	app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		console.error(err);
		res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
	});

	return app;
}
