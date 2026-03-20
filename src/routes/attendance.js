// src/routes/attendance.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/attendance
router.get('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, date, month } = req.query;
    const records = await db.getAttendance({ employee_id, date, month });
    res.json({ success: true, count: records.length, data: records });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/attendance/checkin
router.post('/checkin', requireAuth, async (req, res) => {
  try {
    const { employee_id } = req.body;
    if (!employee_id) return res.status(400).json({ success: false, message: 'employee_id zaroori hai.' });
    const today = new Date().toISOString().split('T')[0];
    const time  = new Date().toTimeString().split(' ')[0];
    const rec = await db.markAttendance({ employee_id, date: today, sign_in: time, sign_out: null });
    res.json({ success: true, message: `✅ Check-in recorded at ${time}`, data: rec });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/attendance/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { employee_id } = req.body;
    if (!employee_id) return res.status(400).json({ success: false, message: 'employee_id zaroori hai.' });
    const today = new Date().toISOString().split('T')[0];
    const time  = new Date().toTimeString().split(' ')[0];
    const rec = await db.markAttendance({ employee_id, date: today, sign_out: time });
    res.json({ success: true, message: `✅ Check-out recorded at ${time}`, data: rec });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/attendance (manual entry)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, date, sign_in, sign_out } = req.body;
    if (!employee_id || !date) return res.status(400).json({ success: false, message: 'employee_id aur date zaroori hain.' });
    const rec = await db.markAttendance({ employee_id, date, sign_in, sign_out });
    res.status(201).json({ success: true, message: 'Attendance marked!', data: rec });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/attendance/summary/:employee_id
router.get('/summary/:employee_id', requireAuth, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const records = await db.getAttendance({ employee_id: req.params.employee_id, month });
    const present = records.filter(r => r.sign_in).length;
    const daysInMonth = new Date(month.split('-')[0], month.split('-')[1], 0).getDate();
    res.json({
      success: true,
      data: {
        employee_id: req.params.employee_id,
        month, present,
        absent: daysInMonth - present,
        total_days: daysInMonth,
        records
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
