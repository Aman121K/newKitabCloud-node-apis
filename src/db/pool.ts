import mysql from 'mysql2/promise';
import { env } from '../setup/env';

export const pool = mysql.createPool({
	host: env.MYSQL_HOST || env.DB_HOST,
	port: env.MYSQL_PORT || env.DB_PORT,
	user: env.MYSQL_USER || env.DB_USERNAME,
	password: env.MYSQL_PASSWORD || env.DB_PASSWORD,
	database: env.MYSQL_DB || env.DB_DATABASE,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
	charset: 'utf8mb4',
	timezone: '+00:00',
});

// Test database connection
export async function testConnection(): Promise<boolean> {
	try {
		const connection = await pool.getConnection();
		await connection.ping();
		connection.release();
		console.log('✅ Database connection successful');
		return true;
	} catch (error) {
		console.error('❌ Database connection failed:', error);
		return false;
	}
}

// Test connection on startup
export async function initializeDatabase(): Promise<void> {
	const isConnected = await testConnection();
	if (!isConnected) {
		throw new Error('Failed to connect to database');
	}
}

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const result = await fn(connection);
		await connection.commit();
		return result;
	} catch (err) {
		await connection.rollback();
		throw err;
	} finally {
		connection.release();
	}
}
