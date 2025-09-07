import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MYSQL_HOST: z.string(),
    MYSQL_PORT: z.coerce.number().int().positive().default(3306),
    MYSQL_USER: z.string(),
    MYSQL_PASSWORD: z.string().optional().default(''),
    MYSQL_DB: z.string(),
    JWT_SECRET: z.string().min(16),
});
export const env = EnvSchema.parse(process.env);
