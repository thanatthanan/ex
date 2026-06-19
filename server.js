const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

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
    // 1. ตรวจสอบการเชื่อมต่อ
    await db.query('SELECT 1');
    console.log('✅ เชื่อมต่อ MySQL สำเร็จ!');

    // 2. สร้างตารางผู้ใช้
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`username\` VARCHAR(50) NOT NULL UNIQUE,
        \`password\` VARCHAR(255) NOT NULL,
        \`display_name\` VARCHAR(100) NOT NULL,
        \`avatar\` VARCHAR(50) DEFAULT 'default',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

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

    // 6. เพิ่มข้อมูลผู้ใช้เริ่มต้น (สำหรับใช้ในครอบครัว 3 คน: dad, mom, kid รหัสผ่าน: 1234)
    const [users] = await db.query('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      console.log('🌱 กำลังสร้างผู้ใช้งานเริ่มต้นสำหรับครอบครัว...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('1234', salt);

      await db.query(`
        INSERT INTO users (username, password, display_name, avatar) VALUES
        ('dad', ?, 'คุณพ่อ 👨', 'dad'),
        ('mom', ?, 'คุณแม่ 👩', 'mom'),
        ('kid', ?, 'ลูกชาย 👦', 'kid')
      `, [hashedPassword, hashedPassword, hashedPassword]);
      console.log('✅ สร้างผู้ใช้เริ่มต้นสำเร็จ (รหัสผ่านเริ่มต้นคือ "1234")');
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

// เสิร์ฟหน้า login.html และ index.html ตามสิทธิ์การใช้งาน
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// เริ่มต้น Server
app.listen(PORT, () => {
  console.log(`🚀 แอปพลิเคชันรายรับรายจ่ายน่ารักรันแล้วที่ http://localhost:${PORT}`);
});
