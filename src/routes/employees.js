// src/routes/employees.js
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const db      = require('../utils/db');
const { requireAuth } = require('../middleware/auth');
const { getUploader }  = require('../middleware/upload');

const upload = getUploader('employees');

// GET /api/employees
router.get('/', requireAuth, async (req, res) => {
  try {
    const employees = await db.getEmployees(req.query);
    res.json({ success: true, count: employees.length, data: employees });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/employees/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const emp = await db.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee nahi mila.' });
    res.json({ success: true, data: emp });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/employees  (with optional photo)
router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const body = req.body;
    const { first_name, last_name, email, phone, dept_id, position_id,
            gender, joining_date, basic_salary, address } = body;

    if (!first_name || !email || !dept_id)
      return res.status(400).json({ success: false, message: 'Name, email aur department zaroori hai.' });

    const employee_id = db.genEmpId();
    const image = req.file ? '/uploads/employees/' + req.file.filename : '';

    const emp = await db.createEmployee({
      employee_id, first_name, last_name: last_name || '',
      email, phone: phone || '', dept_id, position_id: position_id || null,
      gender: gender || 'Male',
      joining_date: joining_date || new Date().toISOString().split('T')[0],
      basic_salary: parseFloat(basic_salary) || 0,
      address: address || '', image
    });

    // Auto-create salary setup if salary given
    if (basic_salary && parseFloat(basic_salary) > 0) {
      await db.createSalaryPayment && null; // skip payment
      if (!db.isMySQL()) {
        db.store.salary_setup.push({
          e_s_s_id: db.store.salary_setup.length + 1,
          employee_id, sal_type: 'earning',
          salary_type_id: 'Basic',
          amount: String(basic_salary),
          gross_salary: parseFloat(basic_salary)
        });
      } else {
        await db.query(
          'INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)',
          [employee_id, 'earning', 'Basic', basic_salary, basic_salary, new Date()]
        );
      }
    }

    res.status(201).json({ success: true, message: `Employee ${employee_id} add kiya gaya!`, data: emp });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/employees/:id  (with optional new photo)
router.put('/:id', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const emp = await db.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee nahi mila.' });

    const updateData = { ...req.body };

    // New photo uploaded — delete old one
    if (req.file) {
      if (emp.image) {
        const oldPath = path.join(__dirname, '../../public', emp.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updateData.image = '/uploads/employees/' + req.file.filename;
    }

    const updated = await db.updateEmployee(req.params.id, updateData);
    res.json({ success: true, message: 'Employee updated!', data: updated });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/employees/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'Employee deactivated.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
