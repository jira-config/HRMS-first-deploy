// src/routes/allRoutes.js — Unified router (pure Node.js, no express)
const db = require('../utils/db');

module.exports = async function router(req, res, json, db, requireAuth, pathname, method) {
  const B = req.body || {};

  // ── HEALTH ──────────────────────────────────────────────────
  if (pathname === '/api/health') {
    return json(res, 200, { success:true, status:'OK', app:'HRMS', version:'1.0.0', db: db.isMySQL()?'MySQL':'In-Memory' });
  }

  // ── AUTH ─────────────────────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { email, password } = B;
    if (!email || !password) return json(res, 400, { success:false, message:'Email aur password zaroori hain.' });
    const hash = db.md5(password);
    let user;
    if (db.isMySQL()) {
      const rows = await db.query('SELECT * FROM user WHERE email=? AND password=? AND status=1', [email, hash]);
      user = rows?.[0];
    } else {
      user = db.store.users.find(u => u.email === email && u.password === hash && u.status === 1);
    }
    if (!user) return json(res, 401, { success:false, message:'Email ya password galat hai.' });
    const token = db.genToken();
    db.storeSession(token, user.id);
    const { password:_, ...safe } = user;
    return json(res, 200, { success:true, message:`Welcome, ${user.firstname}!`, token, user:safe });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const auth = req.headers['authorization']||'';
    db.removeSession(auth.replace('Bearer ','').trim());
    return json(res, 200, { success:true, message:'Logged out.' });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { password:_, ...safe } = user;
    return json(res, 200, { success:true, user:safe });
  }

  // ── DASHBOARD ────────────────────────────────────────────────
  if (pathname === '/api/dashboard' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const stats   = await db.getStats();
    const notices = (await db.getNotices()).slice(0, 5);
    return json(res, 200, { success:true, data:{ stats, notices } });
  }

  // ── DEPARTMENTS ──────────────────────────────────────────────
  if (pathname === '/api/departments' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const depts = await db.getDepartments();
    return json(res, 200, { success:true, data:depts });
  }
  if (pathname === '/api/departments' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { department_name, parent_id=0 } = B;
    if (!department_name) return json(res, 400, { success:false, message:'Department name zaroori hai.' });
    const dept = await db.createDept(department_name, parent_id);
    return json(res, 201, { success:true, message:'Department add kiya!', data:dept });
  }
  const deptPut = pathname.match(/^\/api\/departments\/(\d+)$/);
  if (deptPut && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    await db.updateDept(deptPut[1], B.department_name);
    return json(res, 200, { success:true, message:'Updated!' });
  }
  const deptDel = pathname.match(/^\/api\/departments\/(\d+)$/);
  if (deptDel && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    await db.deleteDept(deptDel[1]);
    return json(res, 200, { success:true, message:'Deleted.' });
  }

  // ── EMPLOYEES ────────────────────────────────────────────────
  if (pathname === '/api/employees' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const emps = await db.getEmployees(req.query);
    return json(res, 200, { success:true, count:emps.length, data:emps });
  }

  if (pathname === '/api/employees' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { first_name, last_name, email, phone, dept_id, gender, joining_date, basic_salary, address, position_name } = B;
    if (!first_name || !email || !dept_id) return json(res, 400, { success:false, message:'Name, email, department zaroori hain.' });
    const employee_id = db.genEmpId();
    const image = req._saveUpload ? (req._saveUpload() || '') : '';
    const emp = await db.createEmployee({ employee_id, first_name, last_name:last_name||'', email, phone:phone||'', dept_id, position_name:position_name||'', gender:gender||'Male', joining_date:joining_date||new Date().toISOString().split('T')[0], basic_salary:parseFloat(basic_salary)||0, address:address||'', image });
    // Auto salary setup
    if (basic_salary && parseFloat(basic_salary)>0) {
      if (!db.isMySQL()) {
        db.store.salary_setup.push({ e_s_s_id:db.store.salary_setup.length+1, employee_id, sal_type:'earning', salary_type_id:'Basic', amount:String(basic_salary), gross_salary:parseFloat(basic_salary) });
      } else {
        await db.query('INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)', [employee_id,'earning','Basic',basic_salary,basic_salary,new Date()]);
      }
    }
    return json(res, 201, { success:true, message:`Employee ${employee_id} add kiya gaya!`, data:emp });
  }

  const empMatch = pathname.match(/^\/api\/employees\/([A-Z0-9]+)$/);
  if (empMatch && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const emp = await db.getEmployeeById(empMatch[1]);
    if (!emp) return json(res, 404, { success:false, message:'Employee nahi mila.' });
    return json(res, 200, { success:true, data:emp });
  }
  if (empMatch && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    const emp = await db.getEmployeeById(empMatch[1]);
    if (!emp) return json(res, 404, { success:false, message:'Employee nahi mila.' });
    const updateData = { ...B };
    if (req._saveUpload) {
      const img = req._saveUpload();
      if (img) updateData.image = img;
    }
    const updated = await db.updateEmployee(empMatch[1], updateData);
    return json(res, 200, { success:true, message:'Employee updated!', data:updated });
  }
  if (empMatch && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    await db.deleteEmployee(empMatch[1]);
    return json(res, 200, { success:true, message:'Deactivated.' });
  }

  // ── ATTENDANCE ───────────────────────────────────────────────
  if (pathname === '/api/attendance' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const recs = await db.getAttendance(req.query);
    return json(res, 200, { success:true, count:recs.length, data:recs });
  }
  if (pathname === '/api/attendance/checkin' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, date } = B;
    if (!employee_id) return json(res, 400, { success:false, message:'employee_id zaroori hai.' });
    const d = date || new Date().toISOString().split('T')[0];
    const t = new Date().toTimeString().split(' ')[0];
    const rec = await db.markAttendance({ employee_id, date:d, sign_in:t, sign_out:null });
    return json(res, 200, { success:true, message:`✅ Check-in at ${t}`, data:rec });
  }
  if (pathname === '/api/attendance/checkout' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, date } = B;
    if (!employee_id) return json(res, 400, { success:false, message:'employee_id zaroori hai.' });
    const d = date || new Date().toISOString().split('T')[0];
    const t = new Date().toTimeString().split(' ')[0];
    const rec = await db.markAttendance({ employee_id, date:d, sign_out:t });
    return json(res, 200, { success:true, message:`✅ Check-out at ${t}`, data:rec });
  }
  if (pathname === '/api/attendance' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, date, sign_in, sign_out } = B;
    if (!employee_id || !date) return json(res, 400, { success:false, message:'employee_id aur date zaroori hain.' });
    const rec = await db.markAttendance({ employee_id, date, sign_in, sign_out });
    return json(res, 201, { success:true, message:'Attendance marked!', data:rec });
  }

  // ── LEAVE ─────────────────────────────────────────────────────
  if (pathname === '/api/leave/types' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { success:true, data: await db.getLeaveTypes() });
  }
  if (pathname === '/api/leave' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const apps = await db.getLeaveApplications(req.query);
    return json(res, 200, { success:true, count:apps.length, data:apps });
  }
  if (pathname === '/api/leave' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, leave_type_id, start_date, end_date, reason } = B;
    if (!employee_id || !leave_type_id || !start_date || !end_date) return json(res, 400, { success:false, message:'Saari fields zaroori hain.' });
    const days = Math.ceil((new Date(end_date)-new Date(start_date))/(1000*60*60*24))+1;
    const types = await db.getLeaveTypes();
    const lt = types.find(t=>t.id==leave_type_id);
    const rec = await db.applyLeave({ employee_id, leave_type_id, start_date, end_date, days, reason:reason||'', leave_type:lt?.leave_type||'' });
    return json(res, 201, { success:true, message:'Leave application submitted!', data:rec });
  }
  const leaveApprove = pathname.match(/^\/api\/leave\/(\d+)\/(approve|reject)$/);
  if (leaveApprove && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return json(res, 403, { success:false, message:'Admin only.' });
    const [,id, action] = leaveApprove;
    if (action === 'approve') {
      await db.approveLeave(id, user.firstname);
      return json(res, 200, { success:true, message:'✅ Leave approved!' });
    } else {
      if (db.isMySQL()) await db.query('UPDATE leave_apply SET approved_by=? WHERE leave_appl_id=?',['REJECTED',id]);
      else { const l=db.store.leave_applications.find(l=>l.leave_appl_id==id); if(l){l.status='rejected';l.approved_by='REJECTED';} }
      return json(res, 200, { success:true, message:'Leave rejected.' });
    }
  }

  // ── PAYROLL ──────────────────────────────────────────────────
  if (pathname.match(/^\/api\/payroll\/setup\/(.+)$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const empId = pathname.split('/').pop();
    return json(res, 200, { success:true, data: await db.getSalarySetup(empId) });
  }
  if (pathname === '/api/payroll/setup' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, amount, gross_salary, sal_type, salary_type_id } = B;
    if (!employee_id || !amount) return json(res, 400, { success:false, message:'employee_id aur amount zaroori hain.' });
    if (db.isMySQL()) {
      await db.query('INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)', [employee_id, sal_type||'earning', salary_type_id||'Basic', amount, gross_salary||amount, new Date()]);
    } else {
      const ex = db.store.salary_setup.find(s=>s.employee_id===employee_id);
      if (ex) { ex.amount=amount; ex.gross_salary=parseFloat(gross_salary||amount); }
      else db.store.salary_setup.push({ e_s_s_id:db.store.salary_setup.length+1, employee_id, sal_type:sal_type||'earning', salary_type_id:salary_type_id||'Basic', amount, gross_salary:parseFloat(gross_salary||amount) });
    }
    return json(res, 200, { success:true, message:'Salary setup saved!' });
  }
  if (pathname === '/api/payroll/payments' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { success:true, data: await db.getSalaryPayments(req.query) });
  }
  if (pathname === '/api/payroll/generate' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return json(res, 403, { success:false, message:'Admin only.' });
    const { working_period, payment_date } = B;
    if (!working_period) return json(res, 400, { success:false, message:'working_period zaroori hai.' });
    const employees = await db.getEmployees({ status:'active' });
    const generated = [];
    for (const emp of employees) {
      const setup = await db.getSalarySetup(emp.employee_id);
      const gross = setup.reduce((s,x)=>s+parseFloat(x.gross_salary||0),0);
      if (gross > 0) {
        const rec = await db.createSalaryPayment({ employee_id:emp.employee_id, total_salary:gross, working_period, payment_date:payment_date||new Date().toISOString().split('T')[0], paid_by:user.firstname });
        generated.push({ ...rec, gross });
      }
    }
    return json(res, 200, { success:true, message:`✅ Salary generated for ${generated.length} employees!`, total_amount:generated.reduce((s,p)=>s+(p.gross||0),0), data:generated });
  }
  const slipMatch = pathname.match(/^\/api\/payroll\/slip\/([^/]+)\/([^/]+)$/);
  if (slipMatch && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const [,employee_id, period] = slipMatch;
    const emp     = await db.getEmployeeById(employee_id);
    const setup   = await db.getSalarySetup(employee_id);
    const payment = (await db.getSalaryPayments({ employee_id, period }))[0];
    const attendance = await db.getAttendance({ employee_id, month:period });
    if (!emp) return json(res, 404, { success:false, message:'Employee nahi mila.' });
    const gross   = setup.reduce((s,x)=>s+parseFloat(x.gross_salary||0),0);
    const tax     = gross > 50000 ? gross*0.1 : 0;
    const net     = gross - tax;
    const present = attendance.filter(a=>a.sign_in).length;
    return json(res, 200, { success:true, slip:{ employee_id, period, employee_name:`${emp.first_name} ${emp.last_name||''}`, department:emp.department_name||'', position:emp.position_name||'', joining_date:emp.joining_date, gross_salary:gross, deductions:{tax}, net_salary:net, days_present:present, payment_date:payment?.payment_date||'Pending', paid_by:payment?.paid_by||'', earnings:setup } });
  }

  // ── LOANS ────────────────────────────────────────────────────
  if (pathname === '/api/loans' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { success:true, data: await db.getLoans(req.query.employee_id?{employee_id:req.query.employee_id}:{}) });
  }
  if (pathname === '/api/loans' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { employee_id, amount, interest_rate, repay_months, loan_date } = B;
    if (!employee_id || !amount) return json(res, 400, { success:false, message:'employee_id aur amount zaroori hain.' });
    const loan = await db.createLoan({ employee_id, amount:parseFloat(amount), interest_rate:parseFloat(interest_rate)||0, repay_months:parseInt(repay_months)||12, loan_date:loan_date||new Date().toISOString().split('T')[0] });
    return json(res, 201, { success:true, message:'Loan application submitted!', data:loan });
  }
  const loanApprove = pathname.match(/^\/api\/loans\/(\d+)\/approve$/);
  if (loanApprove && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return json(res, 403, { success:false, message:'Admin only.' });
    if (db.isMySQL()) await db.query('UPDATE grand_loan SET status=? WHERE id=?',['approved',loanApprove[1]]);
    else { const l=db.store.loans.find(l=>l.loan_id==loanApprove[1]); if(l) l.status='approved'; }
    return json(res, 200, { success:true, message:'✅ Loan approved!' });
  }

  // ── NOTICES ──────────────────────────────────────────────────
  if (pathname === '/api/notices' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return json(res, 200, { success:true, data: await db.getNotices() });
  }
  if (pathname === '/api/notices' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return json(res, 403, { success:false, message:'Admin only.' });
    const { title, description } = B;
    if (!title) return json(res, 400, { success:false, message:'Title zaroori hai.' });
    const notice = await db.createNotice({ title, description:description||'', created_by:user.id });
    return json(res, 201, { success:true, message:'Notice posted!', data:notice });
  }
  const noticeDel = pathname.match(/^\/api\/notices\/(\d+)$/);
  if (noticeDel && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    if (db.isMySQL()) await db.query('DELETE FROM notice_board WHERE id=?',[noticeDel[1]]);
    else { const i=db.store.notices.findIndex(n=>n.id==noticeDel[1]); if(i>-1)db.store.notices.splice(i,1); }
    return json(res, 200, { success:true, message:'Deleted.' });
  }

  // ── RECRUITMENT ──────────────────────────────────────────────
  if (pathname === '/api/recruitment/jobs' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    if (db.isMySQL()) return json(res, 200, { success:true, data: await db.query('SELECT * FROM job_advertisement ORDER BY id DESC') });
    return json(res, 200, { success:true, data: db.store.recruitment.filter(r=>r.type==='job') });
  }
  if (pathname === '/api/recruitment/jobs' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { title, department, description, last_date, vacancies } = B;
    if (!title) return json(res, 400, { success:false, message:'Title zaroori hai.' });
    if (db.isMySQL()) await db.query('INSERT INTO job_advertisement (title,department,description,last_date,vacancies) VALUES (?,?,?,?,?)',[title,department,description||'',last_date||'',vacancies||1]);
    else db.store.recruitment.push({ type:'job', id:db.newId('recruitment'), title, department, description, last_date, vacancies, created_at:new Date() });
    return json(res, 201, { success:true, message:'Job posted!' });
  }
  if (pathname === '/api/recruitment/candidates' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    if (db.isMySQL()) return json(res, 200, { success:true, data: await db.query('SELECT * FROM candidate_basic_info') });
    return json(res, 200, { success:true, data: db.store.recruitment.filter(r=>r.type==='candidate') });
  }
  if (pathname === '/api/recruitment/candidates' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const { first_name, last_name, email, phone, present_address } = B;
    if (!first_name||!email) return json(res, 400, { success:false, message:'Name aur email zaroori hain.' });
    const can_id = Date.now() + 'L';
    if (db.isMySQL()) await db.query('INSERT INTO candidate_basic_info (can_id,first_name,last_name,email,phone,present_address) VALUES (?,?,?,?,?,?)',[can_id,first_name,last_name||'',email,phone||'',present_address||'']);
    else db.store.recruitment.push({ type:'candidate', can_id, first_name, last_name, email, phone, present_address, created_at:new Date() });
    return json(res, 201, { success:true, message:'Candidate added!', can_id });
  }

  // 404
  json(res, 404, { success:false, message:'Route not found: ' + method + ' ' + pathname });
};
