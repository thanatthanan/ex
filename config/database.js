const mysql = require('mysql2');
require('dotenv').config();

// ตั้งค่าพูลการเชื่อมต่อ MySQL (Connection Pool)
// โดยดึงค่าจาก Environment Variables หรือใช้ค่า Default สำหรับ XAMPP
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'family_expense',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// แปลงเป็น Promise wrapper เพื่อความง่ายในการใช้ async/await
const promisePool = pool.promise();

module.exports = promisePool;
