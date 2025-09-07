import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(4000),
	// Use Laravel's standard DB environment variables
	DB_HOST: z.string().default('127.0.0.1'),
	DB_PORT: z.coerce.number().int().positive().default(3306),
	DB_USERNAME: z.string().default('forge'),
	DB_PASSWORD: z.string().optional().default(''),
	DB_DATABASE: z.string().default('forge'),
	DB_CONNECTION: z.string().default('mysql'),
	// Legacy support for existing MYSQL_ vars
	MYSQL_HOST: z.string().optional(),
	MYSQL_PORT: z.coerce.number().int().positive().optional(),
	MYSQL_USER: z.string().optional(),
	MYSQL_PASSWORD: z.string().optional(),
	MYSQL_DB: z.string().optional(),
	// Auth
	JWT_SECRET: z.string().min(16),
	BYPASS_TOKEN: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
