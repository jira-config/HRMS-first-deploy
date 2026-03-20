// src/routes/departments.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const depts = await db.getDepartments();
    res.json({ success: true, data: depts });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { department_name, parent_id = 0 } = req.body;
    if (!department_name) return res.status(400).json({ success: false, message: 'Department name zaroori hai.' });
    const dept = await db.createDept(department_name, parent_id);
    res.status(201).json({ success: true, message: 'Department add kiya!', data: dept });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    await db.updateDept(req.params.id, req.body.department_name);
    res.json({ success: true, message: 'Department updated!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteDept(req.params.id);
    res.json({ success: true, message: 'Department deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
