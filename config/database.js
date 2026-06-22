const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ตั้งค่าพูลการเชื่อมต่อ MySQL (Connection Pool)
// โดยดึงค่าจาก Environment Variables หรือใช้ค่า Default สำหรับ XAMPP
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'family_expense',
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// แปลงเป็น Promise wrapper เพื่อความง่ายในการใช้ async/await
const promisePool = pool.promise();

module.exports = promisePool;
