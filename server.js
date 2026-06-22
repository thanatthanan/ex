const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '.env') }); // โหลด .env file
const db = require('./config/database');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Middleware สำหรับจัดการกับ Subdirectory /exapp บน Production
app.use((req, res, next) => {
  if (req.url === '/exapp') {
    return res.redirect(301, '/exapp/');
  }
  if (req.url.startsWith('/exapp/')) {
    req.url = req.url.substring(6) || '/';
  }
  next();
});

// Middleware สำหรับจัดการ JSON และ Form-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session สำหรับเก็บสถานะ Login (อายุเซสชัน 1 วัน)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-please-change-in-env',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ชั่วโมง
}));

// เสิร์ฟไฟล์สแตติกจากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// เช็คว่าเชื่อมต่อฐานข้อมูลได้ไหม และช่วยสร้างตาราง/ข้อมูลตัวอย่างให้อัตโนมัติ (Auto-seeding)
async function initializeDatabase() {
  try {
    // 1. ตรวจสอบการเชื่อมต่อ และเปิดใช้ UTF8MB4 บนการเชื่อมต่อนี้
    await db.query('SET NAMES utf8mb4');
    await db.query('SELECT 1');
    console.log('✅ เชื่อมต่อ MySQL และตั้งค่า Session UTF8MB4 สำเร็จ!');

    // 2. สร้างตารางผู้ใช้
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`username\` VARCHAR(50) NOT NULL UNIQUE,
        \`password\` VARCHAR(255) NOT NULL,
        \`display_name\` VARCHAR(100) NOT NULL,
        \`avatar\` VARCHAR(255) DEFAULT 'default',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ตรวจสอบและขยายคอลัมน์ avatar เป็น VARCHAR(255) เพื่อรองรับ URL ยาวจาก LINE
    try {
      await db.query("ALTER TABLE `users` MODIFY COLUMN `avatar` VARCHAR(255) DEFAULT 'default'");
      console.log("✅ ปรับปรุงคอลัมน์ avatar เป็น VARCHAR(255) สำเร็จ!");
    } catch (e) {
      console.error("❌ ไม่สามารถปรับปรุงขนาดคอลัมน์ avatar ได้:", e.message);
    }

    // ตรวจสอบและสร้างคอลัมน์ line_id
    try {
      const [columns] = await db.query("SHOW COLUMNS FROM `users` LIKE 'line_id'");
      if (columns.length === 0) {
        await db.query("ALTER TABLE `users` ADD COLUMN `line_id` VARCHAR(255) UNIQUE DEFAULT NULL");
        console.log("✅ เพิ่มคอลัมน์ line_id ในตาราง users สำเร็จ!");
      }
    } catch (e) {
      console.error("❌ ไม่สามารถตรวจสอบหรือเพิ่มคอลัมน์ line_id ได้:", e.message);
    }

    // 3. สร้างตารางหมวดหมู่
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`type\` ENUM('income', 'expense') NOT NULL,
        \`icon\` VARCHAR(50) DEFAULT 'fa-question',
        \`color\` VARCHAR(7) DEFAULT '#888888',
        \`sort_order\` INT DEFAULT 0,
        \`parent_category\` VARCHAR(100) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. สร้างตารางรายรับรายจ่าย
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`transactions\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`type\` ENUM('income', 'expense') NOT NULL,
        \`category_id\` INT NOT NULL,
        \`transaction_date\` DATE NOT NULL,
        \`description\` TEXT,
        \`payment_method\` VARCHAR(20) DEFAULT 'cash',
        \`credit_status\` VARCHAR(20) DEFAULT 'none',
        \`credit_card_name\` VARCHAR(50) DEFAULT NULL,
        \`meal_type\` VARCHAR(20) DEFAULT NULL,
        \`recipient\` VARCHAR(50) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ตรวจสอบและเพิ่มคอลัมน์ที่อาจจะยังไม่มีในตาราง transactions (กรณีฐานข้อมูลเดิมสร้างไว้ก่อนเพิ่มฟีเจอร์)
    try {
      const [cols] = await db.query("SHOW COLUMNS FROM `transactions`");
      const colNames = cols.map(c => c.Field);
      
      if (!colNames.includes('payment_method')) {
        await db.query("ALTER TABLE `transactions` ADD COLUMN `payment_method` VARCHAR(20) DEFAULT 'cash'");
        console.log("✅ เพิ่มคอลัมน์ payment_method ในตาราง transactions สำเร็จ!");
      }
      if (!colNames.includes('credit_status')) {
        await db.query("ALTER TABLE `transactions` ADD COLUMN `credit_status` VARCHAR(20) DEFAULT 'none'");
        console.log("✅ เพิ่มคอลัมน์ credit_status ในตาราง transactions สำเร็จ!");
      }
      if (!colNames.includes('credit_card_name')) {
        await db.query("ALTER TABLE `transactions` ADD COLUMN `credit_card_name` VARCHAR(50) DEFAULT NULL");
        console.log("✅ เพิ่มคอลัมน์ credit_card_name ในตาราง transactions สำเร็จ!");
      }
      if (!colNames.includes('meal_type')) {
        await db.query("ALTER TABLE `transactions` ADD COLUMN `meal_type` VARCHAR(20) DEFAULT NULL");
        console.log("✅ เพิ่มคอลัมน์ meal_type ในตาราง transactions สำเร็จ!");
      }
      if (!colNames.includes('recipient')) {
        await db.query("ALTER TABLE `transactions` ADD COLUMN `recipient` VARCHAR(50) DEFAULT NULL");
        console.log("✅ เพิ่มคอลัมน์ recipient ในตาราง transactions สำเร็จ!");
      }
    } catch (e) {
      console.error("❌ ไม่สามารถตรวจสอบหรือเพิ่มคอลัมน์ในตาราง transactions ได้:", e.message);
    }

    // 5. สร้างตาราง EV Logs
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`ev_logs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`transaction_id\` INT NOT NULL,
        \`station_name\` VARCHAR(255) DEFAULT NULL,
        \`station_branch\` VARCHAR(100) DEFAULT NULL,
        \`station_cabinet\` VARCHAR(50) DEFAULT NULL,
        \`charger_power\` INT DEFAULT NULL,
        \`energy_delivered\` DECIMAL(5,2) DEFAULT NULL,
        \`start_battery\` INT DEFAULT NULL,
        \`end_battery\` INT DEFAULT NULL,
        \`odometer\` INT DEFAULT NULL,
        FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5.0 แปลงฐานข้อมูลและตารางทั้งหมดที่มีอยู่แล้วให้เป็น utf8mb4 เพื่อรองรับ Emoji
    try {
      const dbName = process.env.DB_NAME || 'family_expense';
      await db.query(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await db.query('ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await db.query('ALTER TABLE `categories` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await db.query('ALTER TABLE `transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await db.query('ALTER TABLE `ev_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      console.log('✅ แปลงฐานข้อมูลและทุกตารางในระบบเป็น UTF8MB4 สำเร็จ!');
    } catch (e) {
      console.error('❌ ข้อผิดพลาดในการแปลงตารางเป็น UTF8MB4:', e.message);
    }

    // 5.1 ตรวจสอบว่าเคยมีรายการธุรกรรมไหม ถ้ายังไม่มีเลย สามารถรีเซ็ตตารางผู้ใช้และหมวดหมู่เพื่อแก้ปัญหาฟอนต์/อีโมจิเพี้ยนได้
    const [transactionsCount] = await db.query('SELECT COUNT(*) as count FROM transactions');
    if (transactionsCount[0].count === 0) {
      await db.query('SET FOREIGN_KEY_CHECKS = 0');
      await db.query('DELETE FROM users');
      await db.query('DELETE FROM categories');
      await db.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('🔄 ตรวจพบระบบว่างเปล่า ทำการรีเซ็ตข้อมูลเริ่มต้นเพื่อรองรับ UTF8MB4...');
    }

    // 6. เพิ่มข้อมูลผู้ใช้เริ่มต้น (สำหรับใช้ในครอบครัว 3 คน: dad, mom, kid รหัสผ่าน: 1234)
    const [users] = await db.query('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      console.log('🌱 กำลังสร้างผู้ใช้งานเริ่มต้นสำหรับครอบครัว...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('1234', salt);

      await db.query(`
        INSERT INTO users (username, password, display_name, avatar) VALUES
        ('dad', ?, 0xe0b884e0b8b8e0b893e0b89ee0b988e0b8ad20f09f91a8, 'dad'),
        ('mom', ?, 0xe0b884e0b8b8e0b893e0b981e0b8a1e0b98820f09f91a9, 'mom'),
        ('kid', ?, 0xe0b8a5e0b8b9e0b881e0b88ae0b8b2e0b8a220f09f91a6, 'kid')
      `, [hashedPassword, hashedPassword, hashedPassword]);
      console.log('✅ สร้างผู้ใช้เริ่มต้นสำเร็จ (รหัสผ่านเริ่มต้นคือ "1234")');
    } else {
      // บังคับแก้ไขชื่อหลักให้มีอีโมจิที่ถูกต้อง เผื่อกรณีที่ข้อมูลค้างเก่าไม่ถูกเคลียร์
      await db.query("UPDATE users SET display_name = 0xe0b884e0b8b8e0b893e0b89ee0b988e0b8ad20f09f91a8 WHERE username = 'dad'");
      await db.query("UPDATE users SET display_name = 0xe0b884e0b8b8e0b893e0b981e0b8a1e0b98820f09f91a9 WHERE username = 'mom'");
      await db.query("UPDATE users SET display_name = 0xe0b8a5e0b8b9e0b881e0b88ae0b8b2e0b8a220f09f91a6 WHERE username = 'kid'");
    }

    // 7. เพิ่มหมวดหมู่เริ่มต้นหากยังไม่มี
    const [categories] = await db.query('SELECT COUNT(*) as count FROM categories');
    if (categories[0].count === 0) {
      console.log('🌱 กำลังใส่ข้อมูลหมวดหมู่เริ่มต้น...');
      await db.query(`
        INSERT INTO categories (name, type, icon, color, sort_order, parent_category) VALUES
        ('เงินเดือน/รายได้หลัก', 'income', 'fa-wallet', '#A8E6CF', 10, 'รายรับหลัก 💼'),
        ('ธุรกิจส่วนตัว/ขายของ', 'income', 'fa-store', '#DED2F9', 20, 'รายรับหลัก 💼'),
        ('เงินปันผล/ดอกเบี้ย', 'income', 'fa-chart-line', '#FFD3B6', 30, 'รายรับอื่นๆ 💸'),
        ('รายได้เสริมอื่นๆ', 'income', 'fa-hand-holding-usd', '#FFAAA6', 40, 'รายรับอื่นๆ 💸'),
        ('ค่าบ้าน', 'expense', 'fa-home', '#FFAAA6', 10, 'ที่อยู่อาศัย & สาธารณูปโภค 🏠'),
        ('ค่าเดินทาง', 'expense', 'fa-bus', '#FFD3B6', 20, 'การเดินทาง & ยานพาหนะ 🚗'),
        ('น้ำมันรถ', 'expense', 'fa-gas-pump', '#FFD3B6', 25, 'การเดินทาง & ยานพาหนะ 🚗'),
        ('ชาร์จไฟรถ EV ⚡', 'expense', 'fa-bolt', '#7BE495', 30, 'การเดินทาง & ยานพาหนะ 🚗'),
        ('ค่าอาหารและเครื่องดื่ม', 'expense', 'fa-utensils', '#FF8B94', 40, 'อาหาร & เครื่องดื่ม 🍔'),
        ('ค่าน้ำประปา', 'expense', 'fa-droplet', '#90E0EF', 50, 'ที่อยู่อาศัย & สาธารณูปโภค 🏠'),
        ('ค่าไฟฟ้า', 'expense', 'fa-lightbulb', '#FAD02C', 60, 'ที่อยู่อาศัย & สาธารณูปโภค 🏠'),
        ('อินเทอร์เน็ตมือถือ', 'expense', 'fa-mobile-screen-button', '#A2D2FF', 70, 'ที่อยู่อาศัย & สาธารณูปโภค 🏠'),
        ('อินเทอร์เน็ตบ้าน', 'expense', 'fa-house-signal', '#A2D2FF', 75, 'ที่อยู่อาศัย & สาธารณูปโภค 🏠'),
        ('ของใช้ในบ้าน', 'expense', 'fa-shopping-basket', '#FFE5B4', 80, 'ของใช้ & ครอบครัว 🏠'),
        ('ให้ครอบครัว', 'expense', 'fa-people-roof', '#FFC6FF', 90, 'ของใช้ & ครอบครัว 🏠'),
        ('เงินออม / กองทุน 💰', 'expense', 'fa-piggy-bank', '#FFB5B5', 100, 'การเงิน การออม & ประกัน 💰'),
        ('ประกัน / ประกันสังคม 🛡️', 'expense', 'fa-shield-halved', '#A2D2FF', 120, 'การเงิน การออม & ประกัน 💰'),
        ('ชำระบัตรเครดิต/สินเชื่อ 💳', 'expense', 'fa-credit-card', '#FFB5B5', 130, 'การเงิน การออม & ประกัน 💰'),
        ('ค่าใช้จ่ายดูแลสุขภาพ', 'expense', 'fa-heartbeat', '#FF8B94', 140, 'สุขภาพ & การศึกษา 🏥'),
        ('การศึกษา/เล่าเรียน', 'expense', 'fa-graduation-cap', '#A8E6CF', 150, 'สุขภาพ & การศึกษา 🏥'),
        ('ความบันเทิง', 'expense', 'fa-gamepad', '#DED2F9', 160, 'บันเทิง ภาษี & อื่นๆ ⚙️'),
        ('ช้อปปิ้ง', 'expense', 'fa-bag-shopping', '#DED2F9', 165, 'บันเทิง ภาษี & อื่นๆ ⚙️'),
        ('ภาษี 📝', 'expense', 'fa-file-invoice-dollar', '#FFAAA6', 170, 'บันเทิง ภาษี & อื่นๆ ⚙️'),
        ('รายจ่ายอื่นๆ ⚙️', 'expense', 'fa-ellipsis-h', '#C3B1E1', 180, 'บันเทิง ภาษี & อื่นๆ ⚙️')
      `);
      console.log('✅ สร้างหมวดหมู่เริ่มต้นสำเร็จ');
    } else {
      // บังคับแก้ไขชื่อหมวดหมู่และหมวดหมู่หลักที่มีอีโมจิให้ถูกต้อง เผื่อกรณีข้อมูลเก่าเพี้ยน
      await db.query("UPDATE categories SET name = 0xe0b88ae0b8b2e0b8a3e0b98ce0b888e0b984e0b89fe0b8a3e0b89620455620e29aa1 WHERE name LIKE 'ชาร์จไฟรถ EV%'");
      await db.query("UPDATE categories SET name = 0xe0b980e0b887e0b8b4e0b899e0b8ade0b8ade0b8a1202f20e0b881e0b8ade0b887e0b897e0b8b8e0b89920f09f92b0 WHERE name LIKE 'เงินออม / กองทุน%'");
      await db.query("UPDATE categories SET name = 0xe0b89be0b8a3e0b8b0e0b881e0b8b1e0b899202f20e0b89be0b8a3e0b8b0e0b881e0b8b1e0b899e0b8aae0b8b1e0b887e0b884e0b8a120f09f9ba1efb88f WHERE name LIKE 'ประกัน / ประกันสังคม%'");
      await db.query("UPDATE categories SET name = 0xe0b88ae0b8b3e0b8a3e0b8b0e0b89ae0b8b1e0b895e0b8a3e0b980e0b884e0b8a3e0b894e0b8b4e0b8952fe0b8aae0b8b4e0b899e0b980e0b88ae0b8b7e0b988e0b8ad20f09f92b3 WHERE name LIKE 'ชำระบัตรเครดิต/สินเชื่อ%'");
      await db.query("UPDATE categories SET name = 0xe0b8a0e0b8b2e0b8a9e0b8b520f09f939d WHERE name LIKE 'ภาษี%'");
      await db.query("UPDATE categories SET name = 0xe0b8a3e0b8b2e0b888e0b988e0b8b2e0b8a2e0b8ade0b8b7e0b988e0b899e0b98620e29a99efb88f WHERE name LIKE 'รายจ่ายอื่นๆ%'");

      await db.query("UPDATE categories SET parent_category = 0xe0b8a3e0b8b2e0b8a3e0b8b1e0b89ae0b8abe0b8a5e0b8b1e0b88120f09f92bc WHERE parent_category LIKE 'รายรับหลัก%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b8a3e0b8b2e0b8a3e0b8b1e0b89ae0b8ade0b8b7e0b988e0b899e0b98620f09f92b8 WHERE parent_category LIKE 'รายรับอื่นๆ%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b897e0b8b5e0b988e0b8ade0b8a2e0b8b9e0b988e0b8ade0b8b2e0b8a8e0b8b1e0b8a2202620e0b8aae0b8b2e0b898e0b8b2e0b8a3e0b893e0b8b9e0b89be0b982e0b8a0e0b88420f09f8fa0 WHERE parent_category LIKE 'ที่อยู่อาศัย%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b881e0b8b2e0b8a3e0b980e0b894e0b8b4e0b899e0b897e0b8b2e0b887202620e0b8a2e0b8b2e0b899e0b89ee0b8b2e0b8abe0b899e0b8b020f09f9a97 WHERE parent_category LIKE 'การเดินทาง%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b8ade0b8b2e0b8abe0b8a3202620e0b980e0b884e0b8a3e0b8b7e0b988e0b8ade0b887e0b894e0b8b7e0b988e0b8a120f09f8d94 WHERE parent_category LIKE 'อาหาร%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b882e0b8ade0b887e0b983e0b88ae0b989202620e0b884e0b8a3e0b8ade0b89ae0b884e0b8a3e0b8b1e0b8a720f09f8fa0 WHERE parent_category LIKE 'ของใช้%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b881e0b8b2e0b8a3e0b980e0b887e0b8b4e0b89920e0b881e0b8b2e0b8a3e0b8ade0b8ade0b8a1202620e0b89be0b8a3e0b8b0e0b881e0b8b1e0b89920f09f92b0 WHERE parent_category LIKE 'การเงิน%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b8aae0b8b8e0b882e0b8a0e0b8b2e0b89e202620e0b881e0b8b2e0b8a3e0b8a8e0b8b6e0b881e0b8a9e0b8b220f09f8fa5 WHERE parent_category LIKE 'สุขภาพ%'");
      await db.query("UPDATE categories SET parent_category = 0xe0b89ae0b8b1e0b899e0b980e0b897e0b8b4e0b88720e0b8a0e0b8b2e0b8a9e0b8b5202620e0b8ade0b8b7e0b988e0b899e0b98620e29a99efb88f WHERE parent_category LIKE 'บันเทิง%'");
    }

  } catch (error) {
    console.error('❌ ข้อผิดพลาดในการตั้งค่าฐานข้อมูล:', error.message);
    console.error('👉 โปรดตรวจสอบว่าคุณได้เปิด Apache และ MySQL ใน XAMPP Control Panel แล้ว และสร้างฐานข้อมูลชื่อ "family_expense" แล้วหรือยัง');
  }
}

// เรียกตัวช่วยตั้งค่าฐานข้อมูล
initializeDatabase();

// นำเข้า API Routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const evRoutes = require('./routes/ev');

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/ev', evRoutes);

// เส้นทางสำหรับ Debug ฐานข้อมูล (ชั่วคราว)
app.get('/api/db-debug', async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, username, display_name, avatar FROM users');
    const [connectionCharset] = await db.query("SHOW VARIABLES LIKE 'character_set_connection'");
    const [clientCharset] = await db.query("SHOW VARIABLES LIKE 'character_set_client'");
    const [databaseCharset] = await db.query("SHOW VARIABLES LIKE 'character_set_database'");
    const [serverCharset] = await db.query("SHOW VARIABLES LIKE 'character_set_server'");
    
    res.json({
      success: true,
      users: users,
      charsets: {
        connection: connectionCharset[0]?.Value,
        client: clientCharset[0]?.Value,
        database: databaseCharset[0]?.Value,
        server: serverCharset[0]?.Value
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// เสิร์ฟหน้า login.html และ index.html ตามสิทธิ์การใช้งาน
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  if (!req.session.userId) {
    const redirectPath = req.originalUrl.startsWith('/exapp') ? '/exapp/login' : '/login';
    return res.redirect(redirectPath);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// เริ่มต้น Server
app.listen(PORT, () => {
  console.log(`🚀 แอปพลิเคชันรายรับรายจ่ายน่ารักรันแล้วที่ http://localhost:${PORT}`);
});
