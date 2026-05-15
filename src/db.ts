import { createPool } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const conmysql = createPool({
    host: process.env.BD_HOST,
    database: process.env.BD_DATABASE,
    user: process.env.BD_USER,
    password: process.env.BD_PASSWORD,
    port: Number(process.env.BD_PORT),

    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
});