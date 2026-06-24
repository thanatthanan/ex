const express = require('express');
const router = express.Router();
const db = require('../config/database');
const https = require('https');

// Middleware ตรวจสอบการเข้าสู่ระบบ
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

// ฟังก์ชันสร้างรายงานสรุปรายจ่ายประจำวัน
async function generateDailySummaryReport() {
  // 1. ดึงรายการของวันที่ทำรายการปัจจุบัน (ตามเขตเวลาประเทศไทย)
  const [rows] = await db.query(`
    SELECT t.amount, t.type, c.name as category_name, u.display_name
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    WHERE t.transaction_date = DATE(NOW())
  `);

  // 2. ดึงยอดค้างชำระบัตรเครดิตสะสมรวม
  const [creditRows] = await db.query(`
    SELECT SUM(amount) as total_unpaid
    FROM transactions
    WHERE payment_method = 'credit' AND credit_status = 'unpaid'
  `);
  
  const totalUnpaidCredit = creditRows[0].total_unpaid ? parseFloat(creditRows[0].total_unpaid) : 0;
  const todayStr = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  if (rows.length === 0) {
    return `📊 สรุปการเงินประจำวัน\n📅 วันที่: ${todayStr}\n\n🌸 วันนี้ยังไม่มีรายการเงินบันทึกเข้ามาเลยจ้า บ้านเราประหยัดสุดๆ!`;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const categories = {};
  const users = {};

  rows.forEach(r => {
    const amt = parseFloat(r.amount);
    if (r.type === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      // จัดกลุ่มรายจ่ายตามหมวดหมู่
      categories[r.category_name] = (categories[r.category_name] || 0) + amt;
      // จัดกลุ่มรายจ่ายตามสมาชิกในบ้าน
      users[r.display_name] = (users[r.display_name] || 0) + amt;
    }
  });

  const net = totalIncome - totalExpense;

  let msg = `📊 สรุปการเงินประจำวัน\n📅 วันที่: ${todayStr}\n\n`;
  msg += `💰 ภาพรวมวันนี้:\n`;
  msg += `  - รายรับรวม: ${totalIncome.toLocaleString('th-TH')} บาท 💰\n`;
  msg += `  - รายจ่ายรวม: ${totalExpense.toLocaleString('th-TH')} บาท 💸\n`;
  msg += `  - ยอดสุทธิวันนี้: ${net >= 0 ? '+' : ''}${net.toLocaleString('th-TH')} บาท\n\n`;

  if (Object.keys(categories).length > 0) {
    msg += `🛒 รายจ่ายแยกตามหมวดหมู่:\n`;
    for (const cat in categories) {
      msg += `  - ${cat}: ${categories[cat].toLocaleString('th-TH')} บาท\n`;
    }
    msg += `\n`;
  }

  if (Object.keys(users).length > 0) {
    msg += `👤 รายจ่ายแยกตามคนบันทึก:\n`;
    for (const user in users) {
      msg += `  - ${user}: ${users[user].toLocaleString('th-TH')} บาท\n`;
    }
    msg += `\n`;
  }

  msg += `💳 บัตรเครดิตค้างชำระสะสม: ${totalUnpaidCredit.toLocaleString('th-TH')} บาท 💳`;
  
  return msg;
}

// ฟังก์ชันสำหรับส่ง Push Message ไปยัง LINE
function sendPushMessageToLine(token, to, messageText) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      to: to,
      messages: [{ type: 'text', text: messageText }]
    });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(body);
        } else {
          reject(new Error(`LINE API returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

// ฟังก์ชันรวมในการส่งสรุปรายงานประจำวัน
async function sendDailySummaryToLine() {
  const token = process.env.LINE_BOT_ACCESS_TOKEN;

  if (!token) {
    console.warn('⚠️ ไม่สามารถส่งสรุป LINE ได้เนื่องจากขาดการตั้งค่า LINE_BOT_ACCESS_TOKEN ในไฟล์ .env');
    return false;
  }

  // รวบรวมเป้าหมายที่ต้องการส่งข้อความแบบไม่ซ้ำกัน
  const destinations = new Set();

  try {
    // ดึง line_id ทั้งหมดของสมาชิกที่มีการเชื่อมต่อไว้
    const [rows] = await db.query('SELECT line_id FROM users WHERE line_id IS NOT NULL AND line_id != ""');
    rows.forEach(r => {
      if (r.line_id && r.line_id.trim() !== '') {
        destinations.add(r.line_id.trim());
      }
    });
  } catch (error) {
    console.error('⚠️ เกิดข้อผิดพลาดในการดึงข้อมูล line_id จากฐานข้อมูล:', error.message);
  }

  // ถ้ามีคีย์เริ่มต้นใน .env ให้ใส่ไว้เป็นตัวเลือกสำรองหรือส่งคู่ขนานกันด้วย
  if (process.env.LINE_BOT_DESTINATION_ID) {
    destinations.add(process.env.LINE_BOT_DESTINATION_ID.trim());
  }

  if (destinations.size === 0) {
    console.warn('⚠️ ไม่สามารถส่งสรุป LINE ได้เนื่องจากไม่มีข้อมูล LINE User ID หรือ Group ID ในฐานข้อมูลและไฟล์ .env');
    return false;
  }

  try {
    const summaryText = await generateDailySummaryReport();
    let successCount = 0;
    
    // วนลูปส่งหาผู้รับทุกคนทีละคน
    for (const dest of destinations) {
      try {
        await sendPushMessageToLine(token, dest, summaryText);
        console.log(`✅ ส่งสรุปรายวันไปยัง LINE ID: ${dest} เรียบร้อยแล้ว!`);
        successCount++;
      } catch (sendError) {
        console.error(`❌ ข้อผิดพลาดในการส่งรายงานสรุปไปยัง LINE ID: ${dest} ->`, sendError.message);
      }
    }

    return successCount > 0;
  } catch (error) {
    console.error('❌ ข้อผิดพลาดในการส่งรายงานสรุป LINE:', error.message);
    return false;
  }
}

// API Endpoint สำหรับเรียกทดสอบส่งแบบแมนนวลจากหน้าบ้าน
router.post('/send-summary', requireLogin, async (req, res) => {
  const success = await sendDailySummaryToLine();
  if (success) {
    res.json({ success: true, message: 'ส่งรายงานสรุปรายจ่ายประจำวันไปยัง LINE เรียบร้อยแล้ว!' });
  } else {
    res.status(500).json({ success: false, message: 'ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า LINE Token หรือ Destination ID ในไฟล์ .env' });
  }
});

module.exports = {
  router,
  sendDailySummaryToLine,
  generateDailySummaryReport
};
