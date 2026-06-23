const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const crypto = require('crypto');

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

// 5. LINE Login - ทริกเกอร์เข้าสู่ระบบด้วย LINE
router.get('/line', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.lineState = state;
  
  const channelId = process.env.LINE_CHANNEL_ID;
  const callbackUrl = process.env.LINE_CALLBACK_URL;
  
  if (!channelId || !callbackUrl) {
    return res.status(500).send('กรุณาตั้งค่า LINE_CHANNEL_ID และ LINE_CALLBACK_URL ในไฟล์ .env');
  }
  
  const lineUrl = `https://access.line.me/oauth2/v2.1/authorize?` + 
    `response_type=code` +
    `&client_id=${channelId}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
    `&state=${state}` +
    `&scope=profile%20openid`;
    
  res.redirect(lineUrl);
});

// 6. LINE Login Callback - รับ code จาก LINE
router.get('/line/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  if (error) {
    return res.status(400).send(`LINE login error: ${error_description || error}`);
  }
  
  // ตรวจสอบความถูกต้องของ state (ผ่อนปรนการเทียบค่าตรงๆ บน iOS Safari/LINE Browser ที่อาจทำ Cookie Session สูญหายระหว่าง Redirect)
  if (!state) {
    return res.status(400).send('โทเค็นความปลอดภัย (state) ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาลองใหม่อีกครั้ง');
  }
  if (req.session) {
    delete req.session.lineState;
  }
  
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_CALLBACK_URL;
  
  try {
    // แลกเปลี่ยน Auth Code เป็น Access Token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret
      })
    });
    
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
    }
    
    const accessToken = tokenData.access_token;
    
    // ดึงโปรไฟล์ผู้ใช้จาก LINE
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    const profileData = await profileResponse.json();
    if (!profileResponse.ok) {
      throw new Error(profileData.message || 'Failed to fetch LINE profile');
    }
    
    const lineId = profileData.userId;
    const lineDisplayName = profileData.displayName;
    const lineAvatar = profileData.pictureUrl;
    
    // 6.1 ถ้าล็อกอินอยู่แล้ว ให้ผูกบัญชี LINE กับยูสเซอร์ปัจจุบัน
    if (req.session.userId) {
      await db.query('UPDATE users SET line_id = ? WHERE id = ?', [lineId, req.session.userId]);
      return res.redirect(req.originalUrl.startsWith('/exapp') ? '/exapp/' : '/');
    }
    
    // 6.2 ตรวจสอบว่า lineId นี้มีในระบบหรือยัง
    const [rows] = await db.query('SELECT * FROM users WHERE line_id = ?', [lineId]);
    
    if (rows.length > 0) {
      const user = rows[0];
      
      // อัปเดตรูปอวตารจาก LINE ให้ทันสมัย
      if (lineAvatar && user.avatar !== lineAvatar) {
        await db.query('UPDATE users SET avatar = ? WHERE id = ?', [lineAvatar, user.id]);
        user.avatar = lineAvatar;
      }
      
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.displayName = user.display_name;
      req.session.avatar = user.avatar;
      
      return res.redirect(req.originalUrl.startsWith('/exapp') ? '/exapp/' : '/');
    } else {
      // 6.3 บัญชี LINE นี้ยังไม่เคยผูกกับใคร ให้จำไว้ชั่วคราวแล้วไปหน้าผูกบัญชี
      req.session.tempLineData = {
        lineId: lineId,
        displayName: lineDisplayName,
        avatar: lineAvatar
      };
      
      const redirectBase = req.originalUrl.startsWith('/exapp') ? '/exapp' : '';
      return res.redirect(`${redirectBase}/login?line_unlinked=true`);
    }
    
  } catch (err) {
    console.error('LINE callback error:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการล็อกอินด้วย LINE: ' + err.message);
  }
});

// 7. LINE Login Temp - ดึงข้อมูลโปรไฟล์ LINE ชั่วคราวสำหรับการผูกบัญชี
router.get('/line/temp', (req, res) => {
  if (!req.session.tempLineData) {
    return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล LINE สำหรับการผูกบัญชี' });
  }
  res.json({ success: true, lineData: req.session.tempLineData });
});

// 8. LINE Login Link - ผูกบัญชี LINE กับครอบครัว
router.post('/line/link', async (req, res) => {
  const { username, password } = req.body;
  const tempLineData = req.session.tempLineData;
  
  if (!tempLineData) {
    return res.status(400).json({ success: false, message: 'ไม่พบข้อมูล LINE ที่กำลังผูกบัญชี กรุณาล็อกอินด้วย LINE อีกครั้ง' });
  }
  
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
    
    // บันทึก line_id และรูปโปรไฟล์
    const avatarToSave = tempLineData.avatar || user.avatar;
    await db.query('UPDATE users SET line_id = ?, avatar = ? WHERE id = ?', [
      tempLineData.lineId,
      avatarToSave,
      user.id
    ]);
    
    // เคลียร์ข้อมูลชั่วคราว
    delete req.session.tempLineData;
    
    // ตั้งเซสชันเพื่อล็อกอินเข้าสู่ระบบ
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.display_name;
    req.session.avatar = avatarToSave;
    
    res.json({
      success: true,
      message: 'ผูกบัญชี LINE และเข้าสู่ระบบสำเร็จ!',
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: avatarToSave
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + error.message });
  }
});

// 9. Change Password - เปลี่ยนรหัสผ่านของผู้ใช้เอง
router.post('/change-password', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนเปลี่ยนรหัสผ่าน' });
  }
  
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' });
  }
  
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้ในระบบ' });
    }
    
    const user = rows[0];
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านเดิมไม่ถูกต้องจ้า' });
    }
    
    // เข้ารหัสผ่านใหม่
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.userId]);
    
    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จแล้วจ้า! 🌸' });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + error.message });
  }
});

module.exports = router;
