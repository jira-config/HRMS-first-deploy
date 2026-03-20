// src/routes/payroll.js
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/payroll/setup/:employee_id
router.get('/setup/:employee_id', requireAuth, async (req, res) => {
  try {
    const setup = await db.getSalarySetup(req.params.employee_id);
    res.json({ success: true, data: setup });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/payroll/setup — set employee salary
router.post('/setup', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { employee_id, sal_type, salary_type_id, amount, gross_salary } = req.body;
    if (!employee_id || !amount) return res.status(400).json({ success: false, message: 'employee_id aur amount zaroori hain.' });

    if (db.isMySQL()) {
      await db.query(
        'INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)',
        [employee_id, sal_type || 'earning', salary_type_id || 'Basic', amount, gross_salary || amount, new Date()]
      );
    } else {
      const existing = db.store.salary_setup.find(s => s.employee_id === employee_id);
      if (existing) {
        existing.amount = amount;
        existing.gross_salary = parseFloat(gross_salary || amount);
      } else {
        db.store.salary_setup.push({
          e_s_s_id: db.store.salary_setup.length + 1,
          employee_id, sal_type: sal_type || 'earning',
          salary_type_id: salary_type_id || 'Basic',
          amount, gross_salary: parseFloat(gross_salary || amount)
        });
      }
    }
    res.json({ success: true, message: 'Salary setup saved!' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/payroll/payments
router.get('/payments', requireAuth, async (req, res) => {
  try {
    const { employee_id, period } = req.query;
    const payments = await db.getSalaryPayments({ employee_id, period });
    res.json({ success: true, count: payments.length, data: payments });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/payroll/generate — generate salary for a period
router.post('/generate', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { working_period, payment_date } = req.body;
    if (!working_period) return res.status(400).json({ success: false, message: 'working_period zaroori hai (e.g. 2024-03).' });

    const employees = await db.getEmployees({ status: 'active' });
    const generated = [];

    for (const emp of employees) {
      const setup = await db.getSalarySetup(emp.employee_id);
      const gross = setup.reduce((sum, s) => sum + parseFloat(s.gross_salary || 0), 0);
      if (gross > 0) {
        const rec = await db.createSalaryPayment({
          employee_id: emp.employee_id,
          total_salary: gross,
          working_period,
          payment_date: payment_date || new Date().toISOString().split('T')[0],
          paid_by: req.user.firstname
        });
        generated.push({ ...rec, employee_name: `${emp.first_name} ${emp.last_name}`, gross });
      }
    }

    res.json({
      success: true,
      message: `✅ Salary generated for ${generated.length} employees!`,
      period: working_period,
      total_amount: generated.reduce((s, p) => s + (p.gross || 0), 0),
      data: generated
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/payroll/pay/:employee_id — pay single employee
router.post('/pay/:employee_id', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ success: false, message: 'Admin only.' });
    const { working_period, payment_date, total_salary } = req.body;
    const rec = await db.createSalaryPayment({
      employee_id: req.params.employee_id,
      total_salary, working_period,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      paid_by: req.user.firstname
    });
    res.json({ success: true, message: '✅ Salary paid!', data: rec });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/payroll/slip/:employee_id/:period — salary slip
router.get('/slip/:employee_id/:period', requireAuth, async (req, res) => {
  try {
    const { employee_id, period } = req.params;
    const emp     = await db.getEmployeeById(employee_id);
    const setup   = await db.getSalarySetup(employee_id);
    const payment = (await db.getSalaryPayments({ employee_id, period }))[0];
    const attendance = await db.getAttendance({ employee_id, month: period });

    if (!emp) return res.status(404).json({ success: false, message: 'Employee nahi mila.' });

    const gross    = setup.reduce((s, x) => s + parseFloat(x.gross_salary || 0), 0);
    const tax      = gross > 50000 ? gross * 0.1 : 0;
    const net      = gross - tax;
    const present  = attendance.filter(a => a.sign_in).length;

    res.json({
      success: true,
      slip: {
        employee_id, period,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        department: emp.department_name || '',
        position: emp.position_name || '',
        joining_date: emp.joining_date,
        gross_salary: gross,
        deductions: { tax },
        net_salary: net,
        days_present: present,
        payment_date: payment?.payment_date || 'Pending',
        paid_by: payment?.paid_by || '',
        earnings: setup
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
