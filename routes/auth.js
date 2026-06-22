const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// 1. เข้าสู่ระบบ (Login)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'ไม่พบชื่อผู้ใช้นี้ในบ้านของเรา' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้องจ้า' });
    }

    // เซ็ตข้อมูลลงเซสชัน
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.display_name;
    req.session.avatar = user.avatar;

    res.json({
      success: true,
      message: 'ยินดีต้อนรับเข้าสู่ระบบบ้านของเรา!',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + error.message });
  }
});

// 2. ดึงข้อมูลผู้ใช้งานปัจจุบัน (Get current user)
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'ไม่ได้ล็อกอินจ้า' });
  }

  res.json({
    success: true,
    user: {
      id: req.session.userId,
      username: req.session.username,
      displayName: req.session.displayName,
      avatar: req.session.avatar
    }
  });
});

// 3. ดึงรายชื่อสมาชิกในบ้านทั้งหมด (Get all family members)
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, display_name, avatar FROM users');
    res.json({ success: true, users: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ดึงข้อมูลสมาชิกไม่สำเร็จ' });
  }
});

// 4. ออกจากระบบ (Logout)
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'ไม่สามารถออกจากระบบได้' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'ออกจากระบบเรียบร้อยแล้ว บ๊ายบาย!' });
  });
});

module.exports = router;
