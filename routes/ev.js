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

// ดึงสถิติการชาร์จ EV และข้อมูลประวัติทั้งหมด
router.get('/stats', requireLogin, async (req, res) => {
  try {
    // 1. ดึงบันทึกประวัติ EV ทั้งหมดที่เรียงตามเลขไมล์จากมากไปน้อย
    const [logs] = await db.query(`
      SELECT e.*, t.amount, t.transaction_date, t.description, t.payment_method, t.credit_status, u.display_name
      FROM ev_logs e
      JOIN transactions t ON e.transaction_id = t.id
      JOIN users u ON t.user_id = u.id
      ORDER BY e.odometer DESC, t.transaction_date DESC
    `);

    // 2. คำนวณภาพรวมสถิติ
    let totalCost = 0;
    let totalKWh = 0;
    let totalCharges = logs.length;
    let avgPower = 0;
    let powerSum = 0;
    let powerCount = 0;

    logs.forEach(log => {
      totalCost += parseFloat(log.amount);
      if (log.energy_delivered) {
        totalKWh += parseFloat(log.energy_delivered);
      }
      if (log.charger_power) {
        powerSum += log.charger_power;
        powerCount++;
      }
    });

    if (powerCount > 0) {
      avgPower = Math.round(powerSum / powerCount);
    }

    const costPerKWh = totalKWh > 0 ? (totalCost / totalKWh).toFixed(2) : 0;

    // 3. คำนวณระยะทางและอัตราประหยัด (ต้องมีประวัติอย่างน้อย 2 รายการขึ้นไปเพื่อวัดระยะห่าง odometer)
    let totalDistance = 0;
    let costPerKm = 0;
    let kmPerKWh = 0;

    // กรองเอาตัวที่มี odometer เท่านั้นและเรียงลำดับใหม่จากน้อยไปมากเพื่อการคำนวณระยะทาง
    const sortedOdoLogs = [...logs]
      .filter(l => l.odometer !== null)
      .sort((a, b) => a.odometer - b.odometer);

    if (sortedOdoLogs.length >= 2) {
      const minOdo = sortedOdoLogs[0].odometer;
      const maxOdo = sortedOdoLogs[sortedOdoLogs.length - 1].odometer;
      totalDistance = maxOdo - minOdo;

      // ค่าใช้จ่ายทั้งหมดในการชาร์จ (ไม่นับครั้งแรกสุดเพื่อหาค่าใช้จ่ายที่แท้จริงในช่วงระยะไมล์นี้)
      // หรือเพื่อความง่าย: รวมค่าใช้จ่ายทั้งหมดของรายการตั้งแต่วินาทีแรกจนถึงปัจจุบัน ยกเว้นครั้งแรกสุดที่เป็นจุดเริ่มต้นวัดไมล์
      let costInInterval = 0;
      let energyInInterval = 0;
      for (let i = 1; i < sortedOdoLogs.length; i++) {
        costInInterval += parseFloat(sortedOdoLogs[i].amount);
        energyInInterval += parseFloat(sortedOdoLogs[i].energy_delivered || 0);
      }

      if (totalDistance > 0) {
        costPerKm = (costInInterval / totalDistance).toFixed(2);
        if (energyInInterval > 0) {
          kmPerKWh = (totalDistance / energyInInterval).toFixed(2);
        }
      }
    }

    res.json({
      success: true,
      stats: {
        totalCost: totalCost.toFixed(2),
        totalKWh: totalKWh.toFixed(2),
        totalCharges,
        avgPower,
        costPerKWh,
        totalDistance,
        costPerKm,
        kmPerKWh
      },
      logs
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงสถิติ EV' });
  }
});

module.exports = router;
