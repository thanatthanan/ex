const express = require('express');
const router = express.Router();
const db = require('../config/database');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

// Middleware ตรวจสอบการเข้าสู่ระบบ
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

// ฟังก์ชันสำหรับดาวน์โหลดรูปภาพจาก LINE API
function downloadLineImage(token, messageId, savePath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-data.line.me',
      port: 443,
      path: `/v2/bot/message/${messageId}/content`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const fileStream = fs.createWriteStream(savePath);

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`LINE Content API returned status ${res.statusCode}`));
      }
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(savePath);
      });
    });

    req.on('error', (err) => {
      fs.unlink(savePath, () => {}); // ลบไฟล์ที่โหลดไม่เสร็จ
      reject(err);
    });
    req.end();
  });
}

// ฟังก์ชันแกะข้อมูลยอดเงินจากภาพสลิปฝั่ง Server โดยใช้การจัดคะแนน (Scoring Algorithm)
async function processSlipOCR(imagePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'tha+eng');
    const normalizedText = text.replace(/\u0E4D\u0E32/g, '\u0E33').replace(/,/g, '');
    const lines = normalizedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    let possibleAmounts = [];
    const decimalRegex = /(\d+\.\d{2})/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      decimalRegex.lastIndex = 0;
      
      while ((match = decimalRegex.exec(line)) !== null) {
        const val = parseFloat(match[1]);
        if (isNaN(val)) continue;

        let score = 0;
        
        // 1. ค้นหาคีย์เวิร์ดบอกยอดเงินในบรรทัดเดียวกัน
        if (/(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|โอนเงิน|ยอดชำระ|ค่าชาร์จ|amount|net|total|บาท|thb|usd|฿|โอน|จ่าย)/i.test(line)) {
          score += 10;
        }
        
        // 2. ตรวจสอบคีย์เวิร์ดจากบรรทัดก่อนหน้า (สลิปบางธนาคารยอดเงินจะอยู่อีกบรรทัดถัดจากคำอธิบาย)
        if (i > 0) {
          const prevLine = lines[i - 1];
          if (/(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|โอนเงิน|ยอดชำระ|ค่าชาร์จ|amount|net|total|โอน|จ่าย|านวนเงิน|นวนเงิน|เงิน)/i.test(prevLine)) {
            score += 8;
          }
        }

        // 3. หากเป็นค่าธรรมเนียม ให้ลดคะแนน (ไม่ใช่ยอดเงินหลักของการโอน)
        if (/(?:ค่าธรรมเนียม|fee|ธรรมเนียม)/i.test(line)) {
          score -= 5;
        }
        if (i > 0 && /(?:ค่าธรรมเนียม|fee|ธรรมเนียม)/i.test(lines[i - 1])) {
          score -= 5;
        }

        // 4. ลดคะแนนหากเป็นข้อมูลวันที่/เวลา (ป้องกันการจำเวลา เช่น 15:47 หรือ ปี 69 เป็นเศษทศนิยม)
        if (line.includes(':') || line.includes('/') || /\b(202\d|256\d)\b/.test(line)) {
          score -= 8;
        }
        if ((line.match(/\./g) || []).length > 1) {
          score -= 6;
        }

        if (val > 1) {
          score += 1;
        }
        
        possibleAmounts.push({ val, score, line });
      }
    }

    if (possibleAmounts.length === 0) {
      return null;
    }

    // เรียงลำดับคะแนนจากมากไปน้อย หากคะแนนเท่ากันให้เลือกยอดเงินที่สูงกว่า (ยอดโอนหลักมักจะมากที่สุด)
    possibleAmounts.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.val - a.val;
    });

    console.log('LINE OCR parsed amounts with scores:', possibleAmounts);
    return possibleAmounts[0].val;
  } catch (err) {
    console.error('OCR Error:', err);
    return null;
  }
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

// Helper สำหรับทำความสะอาดข้อความในการหาหมวดหมู่
function cleanText(txt) {
  if (!txt) return '';
  return txt.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[^\w\u0E00-\u0E7F]/g, '').trim().toLowerCase();
}

// ฟังก์ชันวิเคราะห์ข้อความแชทเพื่อบันทึกรายการเงิน
async function parseMessage(text) {
  const parts = text.trim().split(/\s+/);
  
  // ค้นหาจำนวนเงิน (ค่าที่เป็นตัวเลขบวกตัวแรก)
  let amount = null;
  let amountIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    const val = parseFloat(parts[i]);
    if (!isNaN(val) && isFinite(parts[i]) && val > 0) {
      amount = val;
      amountIndex = i;
      break;
    }
  }
  
  if (amount === null) {
    return null; // ไม่ใช่ข้อความสำหรับระบุยอดเงิน
  }
  
  // นำจำนวนเงินออกจากอาร์เรย์เพื่อไม่ให้กวนการหาคำอื่น
  parts.splice(amountIndex, 1);
  
  // ดึงหมวดหมู่ทั้งหมดจากฐานข้อมูล
  const [categories] = await db.query('SELECT * FROM categories');
  
  let matchedCategory = null;
  let categoryIndex = -1;
  
  // ค้นหาคำที่ตรงกับหมวดหมู่ในข้อความที่เหลือ
  for (let i = 0; i < parts.length; i++) {
    const partClean = cleanText(parts[i]);
    if (!partClean) continue;
    
    const found = categories.find(cat => {
      const catClean = cleanText(cat.name);
      return catClean.includes(partClean) || partClean.includes(catClean);
    });
    
    if (found) {
      matchedCategory = found;
      categoryIndex = i;
      break;
    }
  }
  
  // ลบหมวดหมู่ออกจากอาร์เรย์หากค้นพบ เพื่อใช้ส่วนที่เหลือเป็นรายละเอียด (description)
  if (matchedCategory) {
    parts.splice(categoryIndex, 1);
  } else {
    // หากไม่พบหมวดหมู่เลย ให้กำหนดค่าเริ่มต้นเป็น "รายจ่ายอื่นๆ" (หรือหมวดหมู่ประเภทรายจ่ายตัวแรก)
    matchedCategory = categories.find(cat => cat.name.includes('อื่นๆ') && cat.type === 'expense') || 
                      categories.find(cat => cat.type === 'expense') || 
                      categories[0];
  }
  
  const description = parts.join(' ').trim() || null;
  
  return {
    amount,
    category: matchedCategory,
    description
  };
}

// LINE Webhook Endpoint (raw body ถูกดักจับจาก server.js ก่อน express.json() แล้ว)
router.post('/webhook', async (req, res) => {
  // ✅ LINE กำหนดว่า webhook ต้องตอบ 200 เสมอ จึง res.send('OK') ก่อนแล้วค่อย process
  res.status(200).send('OK');

  const token = process.env.LINE_BOT_ACCESS_TOKEN;
  // LINE Bot (Messaging API) ใช้ Channel Secret ของ Messaging API channel
  // ไม่ใช่ LINE_CHANNEL_SECRET ซึ่งเป็นของ LINE Login channel
  const channelSecret = process.env.LINE_BOT_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET;

  const rawBody = req.body; // Buffer จาก express.raw
  const signature = req.headers['x-line-signature'];

  // --- Verify LINE Signature (ถ้ามี secret ตั้งค่าไว้) ---
  if (channelSecret && signature) {
    const expectedSig = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBody)
      .digest('base64');

    if (expectedSig !== signature) {
      console.warn('⚠️ LINE Webhook: Signature ไม่ตรง! ข้ามการ process event');
      console.warn(`   → ตรวจสอบ LINE_BOT_CHANNEL_SECRET ใน .env`);
      console.warn(`   → Received : ${signature ? signature.substring(0, 20) + '...' : 'none'}`);
      console.warn(`   → Expected : ${expectedSig.substring(0, 20)}...`);
      return; // ตอบ 200 ไปแล้ว แต่ไม่ process
    }
    console.log('✅ LINE Webhook: Signature ถูกต้อง');
  } else if (!signature) {
    console.warn('⚠️ LINE Webhook: ไม่มี X-Line-Signature (อาจเป็น test request)');
  }

  let events;
  try {
    const parsed = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString()) : rawBody;
    events = parsed.events;
  } catch (e) {
    console.error('❌ LINE Webhook: parse body ล้มเหลว', e.message);
    return;
  }

  if (!events || !Array.isArray(events)) {
    return;
  }


  for (const event of events) {
    if (event.type === 'message') {
      const replyToken = event.replyToken;
      const lineUserId = event.source.userId;

      try {
        // 1. ตรวจสอบว่ามีผู้ใช้งานที่ผูก line_id นี้ไว้หรือไม่
        const [users] = await db.query('SELECT id, display_name FROM users WHERE line_id = ?', [lineUserId]);
        
        if (users.length === 0) {
          await sendReplyMessageToLine(token, replyToken, 
            `สวัสดีค่ะ! 🌸 บัญชี LINE ของคุณยังไม่ได้เชื่อมต่อกับระบบ "สมุดบัญชีบ้านเรา"\n\n` +
            `กรุณาเข้าสู่ระบบผ่านเว็บไซต์และทำการ "ผูกบัญชี LINE" ก่อนเริ่มส่งรายการเข้ามานะคะ!`
          );
          continue;
        }

        const user = users[0];

        // --- กรณีส่งข้อความตัวอักษร ---
        if (event.message.type === 'text') {
          const messageText = event.message.text.trim();

          // วิเคราะห์ข้อมูลเงินจากข้อความ
          const parsed = await parseMessage(messageText);

          if (!parsed) {
            // หากส่งข้อความทั่วไปที่ไม่มีตัวเลขเงิน ไม่ต้องทำรายการบันทึก แต่อาจตอบคู่มือวิธีพิมพ์
            await sendReplyMessageToLine(token, replyToken,
              `พิมพ์บันทึกรายจ่ายได้ง่ายๆ เช่น:\n` +
              `• "อาหาร 80 ข้าวกะเพรา"\n` +
              `• "เดินทาง 45 รถไฟฟ้า"\n` +
              `• "รายรับอื่นๆ 15000 เงินเดือน"`
            );
            continue;
          }

          const { amount, category, description } = parsed;
          const transactionDate = new Date().toISOString().slice(0, 10); // วันนี้ YYYY-MM-DD

          // บันทึกข้อมูลลงฐานข้อมูล
          await db.query(
            `INSERT INTO transactions (user_id, amount, type, category_id, transaction_date, description, payment_method, credit_status) 
             VALUES (?, ?, ?, ?, ?, ?, 'cash', 'none')`,
            [user.id, amount, category.type, category.id, transactionDate, description]
          );

          // ส่งข้อความยืนยันความสำเร็จ
          const typeLabel = category.type === 'income' ? 'รายรับ 💰' : 'รายจ่าย 💸';
          let replyMsg = `✅ บันทึกสำเร็จแล้วค่ะ!\n`;
          replyMsg += `👤 ผู้บันทึก: ${user.display_name}\n`;
          replyMsg += `🏷️ หมวดหมู่: ${category.name}\n`;
          replyMsg += `💵 ยอดเงิน: ${amount.toLocaleString('th-TH')} บาท (${typeLabel})\n`;
          if (description) {
            replyMsg += `📝 รายละเอียด: ${description}`;
          }
          
          await sendReplyMessageToLine(token, replyToken, replyMsg);
        }
        
        // --- กรณีส่งรูปภาพสลิป ---
        else if (event.message.type === 'image') {
          const messageId = event.message.id;
          const fileName = `slip_${Date.now()}_${messageId}.jpg`;
          const uploadDir = path.join(__dirname, '../public/uploads/slips');
          
          // สร้างโฟลเดอร์สำหรับเก็บสลิปถ้ายังไม่มี
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          const savePath = path.join(uploadDir, fileName);
          const relativePath = `/uploads/slips/${fileName}`; // พาธที่จะเก็บลงฐานข้อมูล

          try {
            // ทำการดาวน์โหลดและวิเคราะห์รูปภาพ
            await downloadLineImage(token, messageId, savePath);
            const amount = await processSlipOCR(savePath);

            const transactionDate = new Date().toISOString().slice(0, 10); // วันนี้ YYYY-MM-DD

            // ดึงหมวดหมู่สำหรับรายจ่ายอื่นๆ มาเป็นหมวดหมู่เริ่มต้น
            const [categories] = await db.query("SELECT id FROM categories WHERE name LIKE '%รายจ่ายอื่นๆ%' AND type = 'expense' LIMIT 1");
            const categoryId = categories.length > 0 ? categories[0].id : 1;

            if (amount && amount > 0) {
              await db.query(
                `INSERT INTO transactions (user_id, amount, type, category_id, transaction_date, description, payment_method, credit_status, slip_path) 
                 VALUES (?, ?, 'expense', ?, ?, 'บันทึกสลิปจาก LINE OA (สแกนอัตโนมัติ)', 'cash', 'none', ?)`,
                [user.id, amount, categoryId, transactionDate, relativePath]
              );

              let replyMsg = `✅ สแกนและบันทึกสลิปสำเร็จแล้วค่ะ!\n`;
              replyMsg += `👤 ผู้บันทึก: ${user.display_name}\n`;
              replyMsg += `💵 ยอดเงิน: ${amount.toLocaleString('th-TH')} บาท\n`;
              replyMsg += `📝 รายละเอียด: บันทึกสลิปจาก LINE OA (สแกนอัตโนมัติ)\n`;
              replyMsg += `📸 รูปภาพสลิปถูกเก็บเข้าระบบแล้ว`;
              await sendReplyMessageToLine(token, replyToken, replyMsg);
            } else {
              // บันทึกภาพไว้ก่อนแต่เซ็ตยอดเงินเป็น 0
              await db.query(
                `INSERT INTO transactions (user_id, amount, type, category_id, transaction_date, description, payment_method, credit_status, slip_path) 
                 VALUES (?, 0.00, 'expense', ?, ?, 'สลิปจาก LINE OA (ไม่พบยอดเงิน)', 'cash', 'none', ?)`,
                [user.id, categoryId, transactionDate, relativePath]
              );

              let replyMsg = `⚠️ บันทึกรูปภาพสลิปเรียบร้อยแล้วค่ะ!\n`;
              replyMsg += `👤 ผู้บันทึก: ${user.display_name}\n`;
              replyMsg += `❌ ระบบอ่านยอดเงินไม่สำเร็จ ขอแนะนำให้ตรวจทานยอดเงินและแก้ไขในระบบนะจ๊ะ`;
              await sendReplyMessageToLine(token, replyToken, replyMsg);
            }
          } catch (downloadErr) {
            console.error('Download or OCR failed:', downloadErr);
            await sendReplyMessageToLine(token, replyToken, `❌ เกิดข้อผิดพลาดในการรับภาพสลิป กรุณาลองใหม่อีกครั้งนะคะ`);
          }
        }
      } catch (err) {
        console.error('Webhook event error:', err);
        try {
          await sendReplyMessageToLine(token, event.replyToken, `❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้งค่ะ`);
        } catch (replyErr) {
          console.error('Failed to send error reply:', replyErr);
        }
      }
    }
  }
});

// ฟังก์ชันส่ง Reply Message กลับไปยัง LINE
function sendReplyMessageToLine(token, replyToken, messageText) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: messageText }]
    });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/message/reply',
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

module.exports = {
  router,
  sendDailySummaryToLine,
  generateDailySummaryReport
};
