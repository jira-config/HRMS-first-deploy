// src/utils/db.js
// MySQL connection with in-memory fallback for development

const crypto = require('crypto');

// ── In-Memory Store (used when MySQL not available) ──────────
const store = {
  users: [
    {
      id: 1, firstname: 'Admin', lastname: 'User', email: 'admin@hrms.com',
      password: crypto.createHash('md5').update('admin123').digest('hex'),
      is_admin: 1, status: 1, image: '',
      last_login: new Date(), ip_address: '127.0.0.1'
    }
  ],
  departments: [
    { dept_id: 1, department_name: 'Human Resources', parent_id: 0 },
    { dept_id: 2, department_name: 'Information Technology', parent_id: 0 },
    { dept_id: 3, department_name: 'Finance', parent_id: 0 },
    { dept_id: 4, department_name: 'Operations', parent_id: 0 },
    { dept_id: 5, department_name: 'Marketing', parent_id: 0 },
  ],
  positions: [
    { position_id: 1, position_name: 'Manager', dept_id: 1 },
    { position_id: 2, position_name: 'Senior Developer', dept_id: 2 },
    { position_id: 3, position_name: 'Junior Developer', dept_id: 2 },
    { position_id: 4, position_name: 'Accountant', dept_id: 3 },
    { position_id: 5, position_name: 'HR Executive', dept_id: 1 },
  ],
  employees: [
    {
      employee_id: 'EMP001', first_name: 'Rajesh', last_name: 'Kumar',
      email: 'rajesh@company.com', phone: '9876543210',
      dept_id: 2, position_id: 2, gender: 'Male',
      joining_date: '2022-01-15', basic_salary: 55000,
      status: 'active', address: 'Delhi', image: ''
    },
    {
      employee_id: 'EMP002', first_name: 'Priya', last_name: 'Sharma',
      email: 'priya@company.com', phone: '9876543211',
      dept_id: 1, position_id: 5, gender: 'Female',
      joining_date: '2021-06-01', basic_salary: 40000,
      status: 'active', address: 'Mumbai', image: ''
    },
    {
      employee_id: 'EMP003', first_name: 'Amit', last_name: 'Singh',
      email: 'amit@company.com', phone: '9876543212',
      dept_id: 3, position_id: 4, gender: 'Male',
      joining_date: '2023-03-10', basic_salary: 45000,
      status: 'active', address: 'Bangalore', image: ''
    },
    {
      employee_id: 'EMP004', first_name: 'Sunita', last_name: 'Devi',
      email: 'sunita@company.com', phone: '9876543213',
      dept_id: 4, position_id: 1, gender: 'Female',
      joining_date: '2020-08-20', basic_salary: 65000,
      status: 'active', address: 'Chennai', image: ''
    },
  ],
  leave_types: [
    { id: 1, leave_type: 'Casual Leave', total_days: 12 },
    { id: 2, leave_type: 'Sick Leave', total_days: 10 },
    { id: 3, leave_type: 'Earned Leave', total_days: 15 },
    { id: 4, leave_type: 'Maternity Leave', total_days: 90 },
  ],
  leave_applications: [],
  attendance: [],
  salary_setup: [
    { e_s_s_id: 1, employee_id: 'EMP001', sal_type: 'earning', salary_type_id: 'Basic', amount: '55000', gross_salary: 55000 },
    { e_s_s_id: 2, employee_id: 'EMP002', sal_type: 'earning', salary_type_id: 'Basic', amount: '40000', gross_salary: 40000 },
    { e_s_s_id: 3, employee_id: 'EMP003', sal_type: 'earning', salary_type_id: 'Basic', amount: '45000', gross_salary: 45000 },
    { e_s_s_id: 4, employee_id: 'EMP004', sal_type: 'earning', salary_type_id: 'Basic', amount: '65000', gross_salary: 65000 },
  ],
  salary_payments: [],
  loans: [],
  notices: [
    { id: 1, title: 'Welcome to HRMS', description: 'New HR Management System is now live.', date: new Date(), created_by: 1 },
    { id: 2, title: 'Holiday Notice', description: 'Office will remain closed on 15th August.', date: new Date(), created_by: 1 },
  ],
  awards: [],
  recruitment: [],
  sessions: {},
};

let idCounters = {
  leave: 100, attendance: 100, salary_payment: 100,
  loan: 100, notice: 10, award: 10, recruitment: 100,
};

function newId(type) { return ++idCounters[type]; }
function genEmpId() {
  const num = store.employees.length + 1;
  return 'EMP' + String(num).padStart(3, '0');
}

// ── MySQL Connection (optional) ───────────────────────────────
let mysqlPool = null;
let usingMySQL = false;

async function initMySQL() {
  try {
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'software_hrmsdb22',
      waitForConnections: true,
      connectionLimit: 10,
    });
    await mysqlPool.query('SELECT 1');
    usingMySQL = true;
    console.log('  ✅ MySQL connected: ' + process.env.DB_NAME);
  } catch (e) {
    console.log('  ⚠️  MySQL not available — using in-memory store');
    usingMySQL = false;
  }
}

async function query(sql, params = []) {
  if (usingMySQL && mysqlPool) {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows;
  }
  return null; // signal to use in-memory
}

// ── DB API ────────────────────────────────────────────────────
module.exports = {
  initMySQL,
  isMySQL: () => usingMySQL,
  query,
  store,
  newId,
  genEmpId,

  // Auth
  md5: (str) => crypto.createHash('md5').update(str).digest('hex'),
  sha256: (str) => crypto.createHash('sha256').update(str).digest('hex'),
  storeSession: (token, userId) => { store.sessions[token] = { userId, at: Date.now() }; },
  getSession: (token) => store.sessions[token],
  removeSession: (token) => { delete store.sessions[token]; },
  genToken: () => crypto.randomBytes(32).toString('hex'),

  // Departments
  getDepartments: async () => {
    const rows = await query('SELECT * FROM department ORDER BY department_name');
    return rows || store.departments;
  },
  getDeptById: async (id) => {
    const rows = await query('SELECT * FROM department WHERE dept_id=?', [id]);
    return rows ? rows[0] : store.departments.find(d => d.dept_id == id);
  },
  createDept: async (name, parent_id = 0) => {
    if (usingMySQL) {
      const r = await query('INSERT INTO department (department_name, parent_id) VALUES (?,?)', [name, parent_id]);
      return { dept_id: r.insertId, department_name: name, parent_id };
    }
    const dept = { dept_id: store.departments.length + 1, department_name: name, parent_id };
    store.departments.push(dept);
    return dept;
  },
  updateDept: async (id, name) => {
    if (usingMySQL) return query('UPDATE department SET department_name=? WHERE dept_id=?', [name, id]);
    const d = store.departments.find(d => d.dept_id == id);
    if (d) d.department_name = name;
    return d;
  },
  deleteDept: async (id) => {
    if (usingMySQL) return query('DELETE FROM department WHERE dept_id=?', [id]);
    const i = store.departments.findIndex(d => d.dept_id == id);
    if (i > -1) store.departments.splice(i, 1);
  },

  // Positions
  getPositions: async () => {
    const rows = await query('SELECT * FROM position ORDER BY position_name');
    return rows || store.positions;
  },
  createPosition: async (name, dept_id) => {
    if (usingMySQL) {
      const r = await query('INSERT INTO position (position_name, dept_id) VALUES (?,?)', [name, dept_id]);
      return { position_id: r.insertId, position_name: name, dept_id };
    }
    const p = { position_id: store.positions.length + 1, position_name: name, dept_id };
    store.positions.push(p);
    return p;
  },

  // Employees
  getEmployees: async (filter = {}) => {
    if (usingMySQL) {
      let sql = 'SELECT e.*, d.department_name, p.position_name FROM employee_position e LEFT JOIN department d ON e.dept_id=d.dept_id LEFT JOIN position p ON e.position_id=p.position_id';
      const params = [];
      if (filter.dept_id) { sql += ' WHERE e.dept_id=?'; params.push(filter.dept_id); }
      sql += ' ORDER BY e.first_name';
      return query(sql, params);
    }
    let list = [...store.employees];
    if (filter.dept_id) list = list.filter(e => e.dept_id == filter.dept_id);
    return list.map(e => ({
      ...e,
      department_name: store.departments.find(d => d.dept_id == e.dept_id)?.department_name || '',
      position_name: store.positions.find(p => p.position_id == e.position_id)?.position_name || '',
    }));
  },
  getEmployeeById: async (id) => {
    const rows = await query('SELECT * FROM employee_position WHERE employee_id=?', [id]);
    if (rows) return rows[0];
    return store.employees.find(e => e.employee_id === id);
  },
  createEmployee: async (data) => {
    if (usingMySQL) {
      const r = await query(
        'INSERT INTO employee_position (employee_id,first_name,last_name,email,phone,dept_id,position_id,gender,joining_date,basic_salary,address,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [data.employee_id, data.first_name, data.last_name, data.email, data.phone, data.dept_id, data.position_id, data.gender, data.joining_date, data.basic_salary, data.address, 'active']
      );
      return data;
    }
    store.employees.push({ ...data, status: 'active', image: '' });
    return data;
  },
  updateEmployee: async (id, data) => {
    if (usingMySQL) {
      return query('UPDATE employee_position SET first_name=?,last_name=?,email=?,phone=?,dept_id=?,position_id=?,basic_salary=? WHERE employee_id=?',
        [data.first_name, data.last_name, data.email, data.phone, data.dept_id, data.position_id, data.basic_salary, id]);
    }
    const e = store.employees.find(e => e.employee_id === id);
    if (e) Object.assign(e, data);
    return e;
  },
  deleteEmployee: async (id) => {
    if (usingMySQL) return query('UPDATE employee_position SET status=? WHERE employee_id=?', ['inactive', id]);
    const e = store.employees.find(e => e.employee_id === id);
    if (e) e.status = 'inactive';
  },

  // Attendance
  getAttendance: async (filter = {}) => {
    if (usingMySQL) {
      let sql = 'SELECT * FROM emp_attendance WHERE 1=1';
      const params = [];
      if (filter.employee_id) { sql += ' AND employee_id=?'; params.push(filter.employee_id); }
      if (filter.date) { sql += ' AND date=?'; params.push(filter.date); }
      if (filter.month) { sql += ' AND date LIKE ?'; params.push(filter.month + '%'); }
      return query(sql + ' ORDER BY date DESC', params);
    }
    let list = [...store.attendance];
    if (filter.employee_id) list = list.filter(a => a.employee_id === filter.employee_id);
    if (filter.date) list = list.filter(a => a.date === filter.date);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },
  markAttendance: async (data) => {
    if (usingMySQL) {
      const exists = await query('SELECT att_id FROM emp_attendance WHERE employee_id=? AND date=?', [data.employee_id, data.date]);
      if (exists && exists.length) {
        return query('UPDATE emp_attendance SET sign_out=? WHERE employee_id=? AND date=?', [data.sign_out, data.employee_id, data.date]);
      }
      return query('INSERT INTO emp_attendance (employee_id,date,sign_in,sign_out) VALUES (?,?,?,?)',
        [data.employee_id, data.date, data.sign_in, data.sign_out || null]);
    }
    const existing = store.attendance.find(a => a.employee_id === data.employee_id && a.date === data.date);
    if (existing) { existing.sign_out = data.sign_out; return existing; }
    const rec = { att_id: newId('attendance'), ...data };
    store.attendance.push(rec);
    return rec;
  },

  // Leave
  getLeaveTypes: async () => {
    const rows = await query('SELECT * FROM leave_type');
    return rows || store.leave_types;
  },
  getLeaveApplications: async (filter = {}) => {
    if (usingMySQL) {
      let sql = 'SELECT la.*, lt.leave_type FROM leave_apply la LEFT JOIN leave_type lt ON la.leave_type_id=lt.id WHERE 1=1';
      const params = [];
      if (filter.employee_id) { sql += ' AND la.employee_id=?'; params.push(filter.employee_id); }
      if (filter.status) { sql += ' AND la.approved_by ' + (filter.status === 'pending' ? 'IS NULL' : 'IS NOT NULL'); }
      return query(sql + ' ORDER BY la.apply_date DESC', params);
    }
    let list = [...store.leave_applications];
    if (filter.employee_id) list = list.filter(l => l.employee_id === filter.employee_id);
    return list;
  },
  applyLeave: async (data) => {
    if (usingMySQL) {
      return query('INSERT INTO leave_apply (employee_id,leave_type_id,apply_strt_date,apply_end_date,apply_day,reason,apply_date,leave_type) VALUES (?,?,?,?,?,?,?,?)',
        [data.employee_id, data.leave_type_id, data.start_date, data.end_date, data.days, data.reason, new Date().toISOString().split('T')[0], data.leave_type]);
    }
    const rec = { leave_appl_id: newId('leave'), ...data, apply_date: new Date().toISOString().split('T')[0], approved_by: '', status: 'pending' };
    store.leave_applications.push(rec);
    return rec;
  },
  approveLeave: async (id, approved_by) => {
    if (usingMySQL) return query('UPDATE leave_apply SET approved_by=?,approve_date=? WHERE leave_appl_id=?', [approved_by, new Date().toISOString().split('T')[0], id]);
    const l = store.leave_applications.find(l => l.leave_appl_id == id);
    if (l) { l.approved_by = approved_by; l.status = 'approved'; }
    return l;
  },

  // Salary
  getSalarySetup: async (employee_id) => {
    const rows = await query('SELECT * FROM employee_salary_setup WHERE employee_id=?', [employee_id]);
    return rows || store.salary_setup.filter(s => s.employee_id === employee_id);
  },
  getSalaryPayments: async (filter = {}) => {
    if (usingMySQL) {
      let sql = 'SELECT * FROM employee_salary_payment WHERE 1=1';
      const params = [];
      if (filter.employee_id) { sql += ' AND employee_id=?'; params.push(filter.employee_id); }
      if (filter.period) { sql += ' AND working_period=?'; params.push(filter.period); }
      return query(sql + ' ORDER BY payment_date DESC', params);
    }
    let list = [...store.salary_payments];
    if (filter.employee_id) list = list.filter(s => s.employee_id === filter.employee_id);
    return list;
  },
  createSalaryPayment: async (data) => {
    if (usingMySQL) {
      return query('INSERT INTO employee_salary_payment (employee_id,total_salary,working_period,payment_date,paid_by) VALUES (?,?,?,?,?)',
        [data.employee_id, data.total_salary, data.working_period, data.payment_date, data.paid_by]);
    }
    const rec = { emp_sal_pay_id: newId('salary_payment'), ...data };
    store.salary_payments.push(rec);
    return rec;
  },

  // Loans
  getLoans: async (filter = {}) => {
    if (usingMySQL) {
      let sql = 'SELECT * FROM grand_loan WHERE 1=1';
      const params = [];
      if (filter.employee_id) { sql += ' AND employee_id=?'; params.push(filter.employee_id); }
      return query(sql, params);
    }
    let list = [...store.loans];
    if (filter.employee_id) list = list.filter(l => l.employee_id === filter.employee_id);
    return list;
  },
  createLoan: async (data) => {
    if (usingMySQL) {
      return query('INSERT INTO grand_loan (employee_id,loan_amount,interest_rate,repay_month,loan_date,status) VALUES (?,?,?,?,?,?)',
        [data.employee_id, data.amount, data.interest_rate, data.repay_months, data.loan_date, 'pending']);
    }
    const rec = { loan_id: newId('loan'), ...data, status: 'pending' };
    store.loans.push(rec);
    return rec;
  },

  // Notices
  getNotices: async () => {
    const rows = await query('SELECT * FROM notice_board ORDER BY date DESC');
    return rows || store.notices;
  },
  createNotice: async (data) => {
    if (usingMySQL) {
      return query('INSERT INTO notice_board (title,description,date,created_by) VALUES (?,?,?,?)',
        [data.title, data.description, new Date(), data.created_by]);
    }
    const rec = { id: newId('notice'), ...data, date: new Date() };
    store.notices.push(rec);
    return rec;
  },

  // Stats
  getStats: async () => {
    const employees = usingMySQL
      ? (await query('SELECT COUNT(*) as cnt FROM employee_position WHERE status="active"') || [{ cnt: 0 }])[0].cnt
      : store.employees.filter(e => e.status === 'active').length;
    const pendingLeaves = usingMySQL
      ? (await query('SELECT COUNT(*) as cnt FROM leave_apply WHERE approved_by=""') || [{ cnt: 0 }])[0].cnt
      : store.leave_applications.filter(l => l.status === 'pending').length;
    const departments = usingMySQL
      ? (await query('SELECT COUNT(*) as cnt FROM department') || [{ cnt: 0 }])[0].cnt
      : store.departments.length;
    const totalSalary = usingMySQL
      ? (await query('SELECT SUM(gross_salary) as total FROM employee_salary_setup') || [{ total: 0 }])[0].total
      : store.salary_setup.reduce((s, x) => s + (x.gross_salary || 0), 0);
    return { employees, pendingLeaves, departments, totalSalary: totalSalary || 0 };
  },
};
