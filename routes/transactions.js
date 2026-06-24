const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Middleware ตรวจสอบการเข้าสู่ระบบ
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

// 1. ดึงรายการธุรกรรมทั้งหมด (รองรับการกรองตามวันที่ เดือน และประเภท พร้อม Pagination)
router.get('/', requireLogin, async (req, res) => {
  const { date, month, year, type, user_id, credit_status } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50; // default 50 รายการต่อหน้า
  const offset = (page - 1) * limit;
  
  let baseQuery = `
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    JOIN users u ON t.user_id = u.id
    LEFT JOIN ev_logs e ON t.id = e.transaction_id
    WHERE 1=1
  `;
  const params = [];

  // กรองตามวันที่ หรือปี/เดือน ปัจจุบันหากส่งมา
  if (date) {
    baseQuery += ` AND DATE(t.transaction_date) = ? `;
    params.push(date);
  } else if (month && year) {
    baseQuery += ` AND MONTH(t.transaction_date) = ? AND YEAR(t.transaction_date) = ? `;
    params.push(month, year);
  }
  
  if (type) {
    baseQuery += ` AND t.type = ? `;
    params.push(type);
  }

  if (credit_status) {
    baseQuery += ` AND t.credit_status = ? `;
    params.push(credit_status);
  }

  // บังคับกรองรายบุคคลเสมอ ป้องกันข้อมูลปนกัน (หากไม่ระบุ ให้ดึงเฉพาะของตนเอง)
  const targetUserId = user_id || req.session.userId;
  baseQuery += ` AND t.user_id = ? `;
  params.push(targetUserId);

  try {
    // 1. หาจำนวนรายการทั้งหมดที่ตรงตามเงื่อนไข (Total Count)
    const countQuery = `SELECT COUNT(*) as totalCount ${baseQuery}`;
    const [countResult] = await db.query(countQuery, params);
    const totalCount = countResult[0].totalCount;
    const totalPages = Math.ceil(totalCount / limit);

    // 2. ดึงข้อมูลรายการด้วย LIMIT และ OFFSET
    let selectQuery = `
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, u.display_name, u.avatar,
             e.station_name, e.station_branch, e.station_cabinet, e.charger_power, e.energy_delivered, e.start_battery, e.end_battery, e.odometer
      ${baseQuery}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `;
    
    // โคลนพารามิเตอร์แล้วเพิ่ม limit, offset สำหรับ query ข้อมูลจริง
    const queryParams = [...params, limit, offset];
    const [rows] = await db.query(selectQuery, queryParams);

    res.json({ 
      success: true, 
      transactions: rows,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงรายการเงิน' });
  }
});

// 2. ดึงหมวดหมู่ทั้งหมด
router.get('/categories', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY type DESC, sort_order ASC, id ASC');
    res.json({ success: true, categories: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ดึงข้อมูลหมวดหมู่ไม่สำเร็จ' });
  }
});

// 3. เพิ่มรายการธุรกรรม (รองรับธุรกรรมทั่วไป และธุรกรรม EV Charging)
router.post('/', requireLogin, async (req, res) => {
  const { amount, type, category_id, transaction_date, description, is_ev_charging, ev_details, payment_method, credit_card_name, meal_type, recipient } = req.body;
  const user_id = req.session.userId;

  if (!amount || !type || !category_id || !transaction_date) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
  }

  // เริ่มทำการบันทึกแบบ Transaction เพื่อความปลอดภัยของข้อมูล
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const targetPaymentMethod = payment_method || 'cash';
    const targetCreditStatus = targetPaymentMethod === 'credit' ? 'unpaid' : 'none';
    const targetCreditCardName = targetPaymentMethod === 'credit' ? (credit_card_name || null) : null;

    // ก. บันทึกลงตาราง transactions
    const [tResult] = await connection.query(
      `INSERT INTO transactions (user_id, amount, type, category_id, transaction_date, description, payment_method, credit_status, credit_card_name, meal_type, recipient) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, amount, type, category_id, transaction_date, description || null, targetPaymentMethod, targetCreditStatus, targetCreditCardName, meal_type || null, recipient || null]
    );
    const transactionId = tResult.insertId;

    if (is_ev_charging === true || is_ev_charging === 'true') {
      const { station_name, station_branch, station_cabinet, charger_power, energy_delivered, start_battery, end_battery, odometer } = ev_details || {};
      
      await connection.query(
        `INSERT INTO ev_logs (transaction_id, station_name, station_branch, station_cabinet, charger_power, energy_delivered, start_battery, end_battery, odometer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          station_name || null,
          station_branch || null,
          station_cabinet || null,
          charger_power ? parseInt(charger_power) : null,
          energy_delivered ? parseFloat(energy_delivered) : null,
          start_battery ? parseInt(start_battery) : null,
          end_battery ? parseInt(end_battery) : null,
          odometer ? parseInt(odometer) : null
        ]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'บันทึกรายการสำเร็จแล้วจ้า! 🎉' });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'บันทึกรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  } finally {
    connection.release();
  }
});

// 4. ลบรายการธุรกรรม (ตาราง ev_logs จะโดนลบอัตโนมัติเนื่องจากติด ON DELETE CASCADE บน Foreign Key)
router.delete('/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const user_id = req.session.userId;
  try {
    const [result] = await db.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, user_id]);
    if (result.affectedRows === 0) {
      return res.status(403).json({ success: false, message: 'ไม่พบรายการ หรือคุณไม่มีสิทธิ์ลบรายการนี้' });
    }
    res.json({ success: true, message: 'ลบรายการออกเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบรายการ' });
  }
});

// 5. แก้ไขรายการธุรกรรม (รองรับธุรกรรมทั่วไป และธุรกรรม EV Charging)
router.put('/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { amount, type, category_id, transaction_date, description, is_ev_charging, ev_details, payment_method, credit_status, credit_card_name, meal_type, recipient } = req.body;
  const user_id = req.session.userId;

  if (!amount || !type || !category_id || !transaction_date) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const targetCreditCardName = (payment_method === 'credit') ? (credit_card_name || null) : null;

    // ก. อัปเดตตาราง transactions (จำกัดสิทธิ์เฉพาะเจ้าของรายการ)
    await connection.query(
      `UPDATE transactions 
       SET amount = ?, type = ?, category_id = ?, transaction_date = ?, description = ?, payment_method = ?, credit_status = ?, credit_card_name = ?, meal_type = ?, recipient = ? 
       WHERE id = ? AND user_id = ?`,
      [amount, type, category_id, transaction_date, description || null, payment_method || 'cash', credit_status || 'none', targetCreditCardName, meal_type || null, recipient || null, id, user_id]
    );

    // ข. จัดการตาราง ev_logs
    const [existingEV] = await connection.query('SELECT id FROM ev_logs WHERE transaction_id = ?', [id]);
    
    if (is_ev_charging === true || is_ev_charging === 'true') {
      const { station_name, station_branch, station_cabinet, charger_power, energy_delivered, start_battery, end_battery, odometer } = ev_details || {};
      
      if (existingEV.length > 0) {
        // อัปเดตข้อมูลเดิม
        await connection.query(
          `UPDATE ev_logs 
           SET station_name = ?, station_branch = ?, station_cabinet = ?, charger_power = ?, energy_delivered = ?, start_battery = ?, end_battery = ?, odometer = ? 
           WHERE transaction_id = ?`,
          [
            station_name || null,
            station_branch || null,
            station_cabinet || null,
            charger_power ? parseInt(charger_power) : null,
            energy_delivered ? parseFloat(energy_delivered) : null,
            start_battery ? parseInt(start_battery) : null,
            end_battery ? parseInt(end_battery) : null,
            odometer ? parseInt(odometer) : null,
            id
          ]
        );
      } else {
        // เพิ่มข้อมูลใหม่ในกรณีที่เปลี่ยนจากหมวดหมู่ธรรมดามาเป็น EV
        await connection.query(
          `INSERT INTO ev_logs (transaction_id, station_name, station_branch, station_cabinet, charger_power, energy_delivered, start_battery, end_battery, odometer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            station_name || null,
            station_branch || null,
            station_cabinet || null,
            charger_power ? parseInt(charger_power) : null,
            energy_delivered ? parseFloat(energy_delivered) : null,
            start_battery ? parseInt(start_battery) : null,
            end_battery ? parseInt(end_battery) : null,
            odometer ? parseInt(odometer) : null
          ]
        );
      }
    } else {
      // ถ้าไม่ใช่หมวดหมู่ EV แล้ว ให้ลบข้อมูลใน ev_logs ออก
      if (existingEV.length > 0) {
        await connection.query('DELETE FROM ev_logs WHERE transaction_id = ?', [id]);
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'แก้ไขรายการสำเร็จเรียบร้อยแล้ว' });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'แก้ไขรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  } finally {
    connection.release();
  }
});

// 6. ชำระยอดหนี้บัตรเครดิตที่เลือก และบันทึกประวัติเป็นรายการเงินสดรอบบิลใหม่
router.post('/pay-credit', requireLogin, async (req, res) => {
  const { transaction_ids, payment_date } = req.body;
  const user_id = req.session.userId;

  if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0 || !payment_date) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุรายการและวันที่ชำระเงิน' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // ก. ดึงรายการที่จะจ่ายเงิน เพื่อยืนยันตัวตนเจ้าของและคำนวณยอดเงินรวม
    const [rows] = await connection.query(
      `SELECT id, amount, description FROM transactions 
       WHERE id IN (?) AND user_id = ? AND payment_method = 'credit' AND credit_status = 'unpaid'`,
      [transaction_ids, user_id]
    );

    if (rows.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'ไม่พบรายการค้างชำระบัตรเครดิตที่เลือก' });
    }

    let totalAmount = 0;
    const descriptions = [];
    rows.forEach(r => {
      totalAmount += parseFloat(r.amount);
      descriptions.push(r.description || 'รูดบัตรเครดิต');
    });

    // ข. ค้นหาหรือเพิ่มหมวดหมู่ "ชำระบัตรเครดิต/สินเชื่อ 💳" เพื่อใช้อ้างอิง
    let categoryId = null;
    const [catRows] = await connection.query("SELECT id FROM categories WHERE name = 'ชำระบัตรเครดิต/สินเชื่อ 💳'");
    if (catRows.length > 0) {
      categoryId = catRows[0].id;
    } else {
      const [insertCat] = await connection.query(
        "INSERT INTO categories (name, type, icon, color) VALUES ('ชำระบัตรเครดิต/สินเชื่อ 💳', 'expense', 'fa-credit-card', '#FFB5B5')"
      );
      categoryId = insertCat.insertId;
    }

    // ค. อัปเดตรายการเดิมในรอบบิลที่เลือกให้เปลี่ยนสถานะเป็น 'paid' (ชำระแล้ว)
    await connection.query(
      `UPDATE transactions SET credit_status = 'paid' WHERE id IN (?) AND user_id = ?`,
      [transaction_ids, user_id]
    );

    // ง. บันทึกรายการหักเงินสดใหม่ (Cash Expense) เพื่อมาหักยอดเงินในบัญชีจริงของเดือนนี้
    const payDescription = `ชำระบิลบัตรเครดิต (${rows.length} รายการ: ${descriptions.join(', ')})`;
    await connection.query(
      `INSERT INTO transactions (user_id, amount, type, category_id, transaction_date, description, payment_method, credit_status) 
       VALUES (?, ?, 'expense', ?, ?, ?, 'cash', 'none')`,
      [user_id, totalAmount, categoryId, payment_date, payDescription]
    );

    await connection.commit();
    res.json({ success: true, message: 'ชำระยอดบัตรเครดิตสำเร็จ หักยอดเงินสดแล้ว!' });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการชำระบิลบัตรเครดิต' });
  } finally {
    connection.release();
  }
});

module.exports = router;
