// src/routes/loans.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const loans = await db.getLoans(req.query.employee_id ? { employee_id: req.query.employee_id } : {});
    res.json({ success: true, count: loans.length, data: loans });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { employee_id, amount, interest_rate, repay_months, loan_date } = req.body;
    if (!employee_id || !amount) return res.status(400).json({ success: false, message: 'employee_id aur amount zaroori hain.' });
    const loan = await db.createLoan({
      employee_id, amount: parseFloat(amount),
      interest_rate: parseFloat(interest_rate) || 0,
      repay_months: parseInt(repay_months) || 12,
      loan_date: loan_date || new Date().toISOString().split('T')[0]
    });
    res.status(201).json({ success: true, message: 'Loan application submitted!', data: loan });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id/approve', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    if (db.isMySQL()) {
      await db.query('UPDATE grand_loan SET status=? WHERE id=?', ['approved', req.params.id]);
    } else {
      const l = db.store.loans.find(l => l.loan_id == req.params.id);
      if (l) l.status = 'approved';
    }
    res.json({ success: true, message: '✅ Loan approved!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
