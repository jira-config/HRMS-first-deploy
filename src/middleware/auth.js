// src/middleware/auth.js
const db = require('../utils/db');

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  // Also check cookie
  const cookieToken = req.headers['cookie']?.match(/hrms_token=([^;]+)/)?.[1];
  const finalToken = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ success: false, message: 'Login required.' });
  }

  const session = db.getSession(finalToken);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
  }

  const user = db.store.users.find(u => u.id === session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: 'User not found.' });
  }

  req.user = user;
  req.token = finalToken;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
