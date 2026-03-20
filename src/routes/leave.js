// src/routes/leave.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/leave/types
router.get('/types', requireAuth, async (req, res) => {
  try {
    const types = await db.getLeaveTypes();
    res.json({ success: true, data: types });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/leave/types
router.post('/types', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { leave_type, total_days } = req.body;
    if (!leave_type) return res.status(400).json({ success: false, message: 'Leave type name zaroori hai.' });
    if (db.isMySQL()) {
      await db.query('INSERT INTO leave_type (leave_type, total_days) VALUES (?,?)', [leave_type, total_days || 0]);
    } else {
      db.store.leave_types.push({ id: db.store.leave_types.length + 1, leave_type, total_days: total_days || 0 });
    }
    res.status(201).json({ success: true, message: 'Leave type added!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/leave
router.get('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, status } = req.query;
    const applications = await db.getLeaveApplications({ employee_id, status });
    res.json({ success: true, count: applications.length, data: applications });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/leave  — apply for leave
router.post('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;
    if (!employee_id || !leave_type_id || !start_date || !end_date)
      return res.status(400).json({ success: false, message: 'Saari fields zaroori hain.' });

    const s = new Date(start_date), e = new Date(end_date);
    const days = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;

    const types = await db.getLeaveTypes();
    const lt = types.find(t => t.id == leave_type_id);

    const rec = await db.applyLeave({
      employee_id, leave_type_id,
      start_date, end_date, days,
      reason: reason || '',
      leave_type: lt?.leave_type || ''
    });
    res.status(201).json({ success: true, message: 'Leave application submitted!', data: rec });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/leave/:id/approve
router.put('/:id/approve', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    await db.approveLeave(req.params.id, req.user.firstname);
    res.json({ success: true, message: '✅ Leave approved!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/leave/:id/reject
router.put('/:id/reject', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    if (db.isMySQL()) {
      await db.query('UPDATE leave_apply SET approved_by=? WHERE leave_appl_id=?', ['REJECTED', req.params.id]);
    } else {
      const l = db.store.leave_applications.find(l => l.leave_appl_id == req.params.id);
      if (l) { l.status = 'rejected'; l.approved_by = 'REJECTED'; }
    }
    res.json({ success: true, message: '❌ Leave rejected.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
