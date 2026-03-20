// src/routes/recruitment.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/recruitment/jobs
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    if (db.isMySQL()) {
      const jobs = await db.query('SELECT * FROM job_advertisement ORDER BY id DESC');
      return res.json({ success: true, data: jobs });
    }
    res.json({ success: true, data: db.store.recruitment.filter(r => r.type === 'job') });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/jobs', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { title, department, description, last_date, vacancies } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Job title zaroori hai.' });
    if (db.isMySQL()) {
      await db.query('INSERT INTO job_advertisement (title,department,description,last_date,vacancies) VALUES (?,?,?,?,?)',
        [title, department, description || '', last_date || '', vacancies || 1]);
    } else {
      db.store.recruitment.push({ type: 'job', id: db.newId('recruitment'), title, department, description, last_date, vacancies, created_at: new Date() });
    }
    res.status(201).json({ success: true, message: 'Job posted!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/recruitment/candidates
router.get('/candidates', requireAuth, async (req, res) => {
  try {
    if (db.isMySQL()) {
      const rows = await db.query('SELECT * FROM candidate_basic_info ORDER BY can_id DESC');
      return res.json({ success: true, data: rows });
    }
    res.json({ success: true, data: db.store.recruitment.filter(r => r.type === 'candidate') });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/candidates', requireAuth, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, present_address } = req.body;
    if (!first_name || !email) return res.status(400).json({ success: false, message: 'Name aur email zaroori hain.' });
    const can_id = Date.now() + 'L';
    if (db.isMySQL()) {
      await db.query('INSERT INTO candidate_basic_info (can_id,first_name,last_name,email,phone,present_address) VALUES (?,?,?,?,?,?)',
        [can_id, first_name, last_name || '', email, phone || '', present_address || '']);
    } else {
      db.store.recruitment.push({ type: 'candidate', can_id, first_name, last_name, email, phone, present_address, created_at: new Date() });
    }
    res.status(201).json({ success: true, message: 'Candidate added!', can_id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
