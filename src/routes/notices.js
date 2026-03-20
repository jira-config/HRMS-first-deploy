// src/routes/notices.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const notices = await db.getNotices();
    res.json({ success: true, data: notices });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title zaroori hai.' });
    const notice = await db.createNotice({ title, description: description || '', created_by: req.user.id });
    res.status(201).json({ success: true, message: 'Notice posted!', data: notice });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    if (db.isMySQL()) {
      await db.query('DELETE FROM notice_board WHERE id=?', [req.params.id]);
    } else {
      const i = db.store.notices.findIndex(n => n.id == req.params.id);
      if (i > -1) db.store.notices.splice(i, 1);
    }
    res.json({ success: true, message: 'Notice deleted.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
