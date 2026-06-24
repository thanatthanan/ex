require('dotenv').config();
const https = require('https');

// ดึงข้อมูลการเชื่อมต่อ LINE จาก Environment Variables
const token = process.env.LINE_BOT_ACCESS_TOKEN;
const destination = process.env.LINE_BOT_DESTINATION_ID;

console.log('--- เริ่มการทดสอบส่งข้อความ LINE ---');
console.log('LINE_BOT_DESTINATION_ID:', destination);
console.log('LINE_BOT_ACCESS_TOKEN (ความยาว):', token ? token.length : 0);

if (!token || !destination) {
  console.error('❌ ไม่พบ LINE_BOT_ACCESS_TOKEN หรือ LINE_BOT_DESTINATION_ID ใน Environment Variables ของเครื่องนี้!');
  process.exit(1);
}

const data = JSON.stringify({
  to: destination,
  messages: [{ type: 'text', text: 'สวัสดีค่ะ! 🌸 นี่คือข้อความทดสอบจากระบบสรุปรายจ่ายประจำวัน สมุดบัญชีบ้านเรา บอทส่งข้อความได้เรียบร้อยแล้วค่ะ!' }]
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
    console.log('LINE API Status Code:', res.statusCode);
    console.log('LINE API Response Body:', body);
    if (res.statusCode === 200) {
      console.log('✅ ส่งข้อความทดสอบเข้า LINE สำเร็จแล้ว!');
    } else {
      console.error('❌ ส่งข้อความไม่สำเร็จ!');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ เกิดข้อผิดพลาดทางเครือข่าย:', e.message);
});

req.write(data);
req.end();
