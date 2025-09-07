import { createApp } from './setup/app';
import { env } from './setup/env';
import { initializeDatabase } from './db/pool';

async function main() {
	// Test database connection first
	console.log('🔍 Testing database connection...');
	await initializeDatabase();
	
	const app = createApp();

	app.listen(env.PORT, () => {
		console.log(`🚀 API listening on http://localhost:${env.PORT}`);
	});
}

main().catch((err) => {
	console.error('❌ Fatal error starting server', err);
	process.exit(1);
});
