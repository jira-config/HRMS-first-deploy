// src/routes/auth.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email aur Password dono zaroori hain.' });

    const passwordHash = db.md5(password);
    let user;

    if (db.isMySQL()) {
      const rows = await db.query('SELECT * FROM user WHERE email=? AND password=? AND status=1', [email, passwordHash]);
      user = rows?.[0];
    } else {
      user = db.store.users.find(u => u.email === email && u.password === passwordHash && u.status === 1);
    }

    if (!user)
      return res.status(401).json({ success: false, message: 'Email ya Password galat hai.' });

    const token = db.genToken();
    db.storeSession(token, user.id);

    // Update last login
    if (db.isMySQL()) {
      await db.query('UPDATE user SET last_login=?, ip_address=? WHERE id=?', [new Date(), req.ip, user.id]);
    }

    const { password: _, ...safeUser } = user;
    res.json({
      success: true,
      message: `Welcome, ${user.firstname}!`,
      token,
      user: safeUser,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  db.removeSession(req.token);
  res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { password, ...safeUser } = req.user;
  res.json({ success: true, user: safeUser });
});

// POST /api/auth/register (admin only - create new user)
router.post('/register', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin)
      return res.status(403).json({ success: false, message: 'Admin only.' });

    const { firstname, lastname, email, password, is_admin = 0 } = req.body;
    if (!firstname || !email || !password)
      return res.status(400).json({ success: false, message: 'Required fields missing.' });

    const newUser = {
      id: db.store.users.length + 1,
      firstname, lastname, email,
      password: db.md5(password),
      is_admin: parseInt(is_admin),
      status: 1, image: '',
      last_login: null, ip_address: ''
    };

    if (db.isMySQL()) {
      await db.query('INSERT INTO user (firstname,lastname,email,password,is_admin,status) VALUES (?,?,?,?,?,1)',
        [firstname, lastname || '', email, db.md5(password), parseInt(is_admin)]);
    } else {
      db.store.users.push(newUser);
    }

    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ success: true, message: 'User created!', user: safeUser });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
