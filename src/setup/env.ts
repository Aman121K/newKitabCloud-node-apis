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
	// Stripe Configuration
	STRIPE_SECRET_KEY: z.string().min(1),
	STRIPE_PUBLIC_KEY: z.string().min(1),
	STRIPE_PLAN_ID: z.string().optional(),
	STRIPE_WEBHOOK_SECRET: z.string().optional(),
	EUROPE_PLAN: z.string().optional(),
	SOUTH_AFRICA_PLAN: z.string().optional(),
	// CORS
	CORS_ORIGIN: z.string().optional(),
	// Email Configuration
	IFUNZAEMAIL: z.string().optional(),
	IFUNZAPASSWORD: z.string().optional(),
	PRODUCT_LINK: z.string().optional(),
	// M-Pesa Configuration
	MERCHANT_UID: z.string().optional(),
	API_USER_ID: z.string().optional(),
	API_KEY: z.string().optional(),
	MPESA_PASSKEY: z.string().optional(),
	MPESA_CONSUMER_KEY: z.string().optional(),
	MPESA_CONSUMER_SECRET: z.string().optional(),
	MPESA_SHORTCODE: z.string().optional(),
	MPESA_TRANSACTION_TYPE: z.string().optional(),
	MPESA_MODE: z.string().optional(),
	MPESA_SUBSCRIPTION_AMOUNT: z.string().optional(),
	// FCM Configuration
	FCM_TOKEN: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
