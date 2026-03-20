// HRMS — Pure Node.js HTTP Server (no dependencies needed)
const http   = require('http');
const url    = require('url');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// Load .env
try {
  fs.readFileSync(path.join(__dirname,'../.env'),'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  });
} catch(e){}

const PORT   = process.env.PORT || 3000;
const db     = require('./utils/db');
const PUBLIC = path.join(__dirname,'../public');

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html':'text/html;charset=utf-8',
  '.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.webp':'image/webp',
  '.svg':'image/svg+xml','.ico':'image/x-icon',
};

// ── Response helpers ─────────────────────────────────────────
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(body);
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

// ── Body parser ───────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        const ct  = (req.headers['content-type'] || '').toLowerCase();

        req.body = {};
        req.fileBuffer = null;
        req.fileName   = null;
        req.fileMime   = null;

        if (ct.includes('application/json')) {
          try { req.body = JSON.parse(raw.toString('utf8')) || {}; } catch(e) { req.body = {}; }

        } else if (ct.includes('multipart/form-data')) {
          // Parse multipart manually
          const boundaryMatch = ct.match(/boundary=([^\s;]+)/);
          if (boundaryMatch) {
            const boundary = boundaryMatch[1];
            const delimiter = Buffer.from('\r\n--' + boundary);
            const startDelim = Buffer.from('--' + boundary);

            // Split by boundary
            let searchStart = startDelim.length + 2; // skip first boundary + CRLF
            let remaining = raw;

            // Find all parts
            const parts = [];
            let pos = 0;
            while (pos < raw.length) {
              const idx = raw.indexOf(delimiter, pos);
              if (idx === -1) break;
              if (pos > 0 || raw.slice(0, startDelim.length).equals(startDelim)) {
                const partStart = (pos === 0) ? startDelim.length + 2 : pos + delimiter.length + 2;
                const partEnd   = idx;
                if (partEnd > partStart) parts.push(raw.slice(partStart, partEnd));
              }
              pos = idx + delimiter.length;
            }

            for (const part of parts) {
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd < 0) continue;
              const headerStr = part.slice(0, headerEnd).toString('utf8');
              const bodyBuf   = part.slice(headerEnd + 4);
              // Remove trailing CRLF
              const bodyData  = bodyBuf[bodyBuf.length-2] === 13 && bodyBuf[bodyBuf.length-1] === 10
                ? bodyBuf.slice(0, -2) : bodyBuf;

              const nameMatch = headerStr.match(/name="([^"]+)"/i);
              const fileMatch = headerStr.match(/filename="([^"]*)"/i);
              if (!nameMatch) continue;
              const fieldName = nameMatch[1];

              if (fileMatch && fileMatch[1]) {
                req.fileField  = fieldName;
                req.fileName   = fileMatch[1];
                req.fileBuffer = bodyData;
                const ctLine   = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
                req.fileMime   = ctLine ? ctLine[1].trim() : 'application/octet-stream';
              } else {
                req.body[fieldName] = bodyData.toString('utf8');
              }
            }
          }

        } else if (ct.includes('application/x-www-form-urlencoded')) {
          try { req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8'))); } catch(e) { req.body = {}; }
        }
        resolve();
      } catch(err) {
        req.body = {};
        resolve(); // never reject — always continue
      }
    });
    req.on('error', () => { req.body = {}; resolve(); });
  });
}

// ── Auth helper ──────────────────────────────────────────────
function getUser(req) {
  const auth = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!auth) return null;
  const sess = db.getSession(auth);
  if (!sess) return null;
  return db.store.users.find(u => u.id === sess.userId) || null;
}

function requireAuth(req, res) {
  const user = getUser(req);
  if (!user) { sendJSON(res, 401, { success:false, message:'Login required. Please sign in.' }); return null; }
  return user;
}

// ── File upload saver ─────────────────────────────────────────
function saveUpload(buffer, originalName) {
  if (!buffer || !buffer.length) return '';
  const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
  const allowed = ['.jpg','.jpeg','.png','.gif','.webp'];
  if (!allowed.includes(ext)) return '';
  const dir = path.join(PUBLIC, 'uploads', 'employees');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fname = Date.now() + '-' + Math.floor(Math.random() * 999999) + ext;
  fs.writeFileSync(path.join(dir, fname), buffer);
  return '/uploads/employees/' + fname;
}

// ── Static file server ───────────────────────────────────────
function serveStatic(req, res, pathname) {
  let fp = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  // Security: prevent path traversal
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(fp)) fp = path.join(PUBLIC, 'index.html');
  try {
    const data = fs.readFileSync(fp);
    const ext  = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch(e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ── Main HTTP server ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCORS(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method   = req.method;
  req.query      = parsed.query;

  // Static files — no body parsing needed
  if (!pathname.startsWith('/api')) {
    serveStatic(req, res, pathname);
    return;
  }

  // Parse body for API routes
  await readBody(req);
  const B = req.body || {};

  // ══════════════════════════════════════════════
  // API ROUTES
  // ══════════════════════════════════════════════

  // ── Health ────────────────────────────────────
  if (pathname === '/api/health') {
    return sendJSON(res, 200, { success:true, status:'OK', app:'HRMS', version:'1.0.0', db: db.isMySQL()?'MySQL':'In-Memory' });
  }

  // ── AUTH ──────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const email    = (B.email || '').trim();
      const password = (B.password || '').trim();
      if (!email || !password)
        return sendJSON(res, 400, { success:false, message:'Email aur password zaroori hain.' });

      const hash = db.md5(password);
      let user;
      if (db.isMySQL()) {
        const rows = await db.query('SELECT * FROM user WHERE email=? AND password=? AND status=1', [email, hash]);
        user = rows?.[0];
      } else {
        user = db.store.users.find(u => u.email === email && u.password === hash && u.status === 1);
      }

      if (!user) return sendJSON(res, 401, { success:false, message:'Email ya password galat hai.' });

      const token = db.genToken();
      db.storeSession(token, user.id);
      const { password:_, ...safe } = user;
      return sendJSON(res, 200, { success:true, message:`Welcome, ${user.firstname}!`, token, user:safe });
    } catch(e) {
      return sendJSON(res, 500, { success:false, message:'Server error: ' + e.message });
    }
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const auth = (req.headers['authorization'] || '').replace('Bearer ','').trim();
    db.removeSession(auth);
    return sendJSON(res, 200, { success:true, message:'Logged out.' });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const { password:_, ...safe } = user;
    return sendJSON(res, 200, { success:true, user:safe });
  }

  // ── DASHBOARD ─────────────────────────────────
  if (pathname === '/api/dashboard') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      const stats   = await db.getStats();
      const notices = (await db.getNotices()).slice(0, 5);
      return sendJSON(res, 200, { success:true, data:{ stats, notices } });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── DEPARTMENTS ───────────────────────────────
  if (pathname === '/api/departments') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const depts = await db.getDepartments();
        return sendJSON(res, 200, { success:true, data:depts });
      }
      if (method === 'POST') {
        const name = (B.department_name || '').trim();
        if (!name) return sendJSON(res, 400, { success:false, message:'Department name zaroori hai.' });
        const dept = await db.createDept(name, B.parent_id || 0);
        return sendJSON(res, 201, { success:true, message:'Department add kiya!', data:dept });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const deptId = pathname.match(/^\/api\/departments\/(\d+)$/);
  if (deptId) {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'PUT') {
        await db.updateDept(deptId[1], B.department_name);
        return sendJSON(res, 200, { success:true, message:'Updated!' });
      }
      if (method === 'DELETE') {
        await db.deleteDept(deptId[1]);
        return sendJSON(res, 200, { success:true, message:'Deleted.' });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── EMPLOYEES ─────────────────────────────────
  if (pathname === '/api/employees') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const emps = await db.getEmployees(req.query);
        return sendJSON(res, 200, { success:true, count:emps.length, data:emps });
      }
      if (method === 'POST') {
        const { first_name, last_name='', email, phone='', dept_id,
                gender='Male', joining_date, basic_salary=0, address='', position_name='' } = B;
        if (!first_name || !email || !dept_id)
          return sendJSON(res, 400, { success:false, message:'Name, email aur department zaroori hain.' });

        const employee_id = db.genEmpId();
        const image = (req.fileBuffer && req.fileName) ? saveUpload(req.fileBuffer, req.fileName) : '';
        const emp = await db.createEmployee({
          employee_id, first_name, last_name, email, phone,
          dept_id, position_name, gender,
          joining_date: joining_date || new Date().toISOString().split('T')[0],
          basic_salary: parseFloat(basic_salary) || 0,
          address, image
        });
        // Auto salary setup
        const sal = parseFloat(basic_salary);
        if (sal > 0) {
          if (!db.isMySQL()) {
            db.store.salary_setup.push({ e_s_s_id: Date.now(), employee_id, sal_type:'earning', salary_type_id:'Basic', amount: String(sal), gross_salary: sal });
          } else {
            await db.query('INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)', [employee_id,'earning','Basic',sal,sal,new Date()]);
          }
        }
        return sendJSON(res, 201, { success:true, message:`Employee ${employee_id} add kiya gaya!`, data:emp });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const empId = pathname.match(/^\/api\/employees\/([A-Z0-9]+)$/);
  if (empId) {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const emp = await db.getEmployeeById(empId[1]);
        if (!emp) return sendJSON(res, 404, { success:false, message:'Employee nahi mila.' });
        return sendJSON(res, 200, { success:true, data:emp });
      }
      if (method === 'PUT') {
        const emp = await db.getEmployeeById(empId[1]);
        if (!emp) return sendJSON(res, 404, { success:false, message:'Employee nahi mila.' });
        const updateData = { ...B };
        if (req.fileBuffer && req.fileName) {
          updateData.image = saveUpload(req.fileBuffer, req.fileName);
        }
        const updated = await db.updateEmployee(empId[1], updateData);
        return sendJSON(res, 200, { success:true, message:'Employee updated!', data:updated });
      }
      if (method === 'DELETE') {
        await db.deleteEmployee(empId[1]);
        return sendJSON(res, 200, { success:true, message:'Employee deactivated.' });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── ATTENDANCE ────────────────────────────────
  if (pathname === '/api/attendance') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const recs = await db.getAttendance(req.query);
        return sendJSON(res, 200, { success:true, count:recs.length, data:recs });
      }
      if (method === 'POST') {
        const { employee_id, date, sign_in, sign_out } = B;
        if (!employee_id || !date) return sendJSON(res, 400, { success:false, message:'employee_id aur date zaroori hain.' });
        const rec = await db.markAttendance({ employee_id, date, sign_in, sign_out });
        return sendJSON(res, 201, { success:true, message:'Attendance marked!', data:rec });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  if (pathname === '/api/attendance/checkin' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      const { employee_id, date } = B;
      if (!employee_id) return sendJSON(res, 400, { success:false, message:'employee_id zaroori hai.' });
      const d = date || new Date().toISOString().split('T')[0];
      const t = new Date().toTimeString().slice(0, 8);
      const rec = await db.markAttendance({ employee_id, date:d, sign_in:t, sign_out:null });
      return sendJSON(res, 200, { success:true, message:`Check-in at ${t}`, data:rec });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  if (pathname === '/api/attendance/checkout' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      const { employee_id, date } = B;
      if (!employee_id) return sendJSON(res, 400, { success:false, message:'employee_id zaroori hai.' });
      const d = date || new Date().toISOString().split('T')[0];
      const t = new Date().toTimeString().slice(0, 8);
      const rec = await db.markAttendance({ employee_id, date:d, sign_out:t });
      return sendJSON(res, 200, { success:true, message:`Check-out at ${t}`, data:rec });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── LEAVE ─────────────────────────────────────
  if (pathname === '/api/leave/types') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') return sendJSON(res, 200, { success:true, data: await db.getLeaveTypes() });
      if (method === 'POST') {
        const { leave_type, total_days=0 } = B;
        if (!leave_type) return sendJSON(res, 400, { success:false, message:'Leave type zaroori hai.' });
        if (db.isMySQL()) await db.query('INSERT INTO leave_type (leave_type,total_days) VALUES (?,?)', [leave_type, total_days]);
        else db.store.leave_types.push({ id: db.store.leave_types.length+1, leave_type, total_days });
        return sendJSON(res, 201, { success:true, message:'Leave type added!' });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  if (pathname === '/api/leave') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const apps = await db.getLeaveApplications(req.query);
        return sendJSON(res, 200, { success:true, count:apps.length, data:apps });
      }
      if (method === 'POST') {
        const { employee_id, leave_type_id, start_date, end_date, reason='' } = B;
        if (!employee_id || !leave_type_id || !start_date || !end_date)
          return sendJSON(res, 400, { success:false, message:'Saari fields zaroori hain.' });
        const days = Math.max(1, Math.ceil((new Date(end_date)-new Date(start_date))/(86400000))+1);
        const types = await db.getLeaveTypes();
        const lt = types.find(t => t.id == leave_type_id);
        const rec = await db.applyLeave({ employee_id, leave_type_id, start_date, end_date, days, reason, leave_type: lt?.leave_type||'' });
        return sendJSON(res, 201, { success:true, message:'Leave application submitted!', data:rec });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const leaveAction = pathname.match(/^\/api\/leave\/(\d+)\/(approve|reject)$/);
  if (leaveAction && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return sendJSON(res, 403, { success:false, message:'Admin only.' });
    try {
      const [,id, action] = leaveAction;
      if (action === 'approve') {
        await db.approveLeave(id, user.firstname);
        return sendJSON(res, 200, { success:true, message:'Leave approved!' });
      } else {
        if (db.isMySQL()) await db.query('UPDATE leave_apply SET approved_by=? WHERE leave_appl_id=?', ['REJECTED', id]);
        else { const l=db.store.leave_applications.find(l=>l.leave_appl_id==id); if(l){l.status='rejected';l.approved_by='REJECTED';} }
        return sendJSON(res, 200, { success:true, message:'Leave rejected.' });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── PAYROLL ───────────────────────────────────
  const paySetup = pathname.match(/^\/api\/payroll\/setup\/(.+)$/);
  if (paySetup && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return sendJSON(res, 200, { success:true, data: await db.getSalarySetup(paySetup[1]) });
  }

  if (pathname === '/api/payroll/setup' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      const { employee_id, amount, gross_salary } = B;
      if (!employee_id || !amount) return sendJSON(res, 400, { success:false, message:'employee_id aur amount zaroori hain.' });
      const gs = parseFloat(gross_salary || amount);
      if (!db.isMySQL()) {
        const ex = db.store.salary_setup.find(s => s.employee_id === employee_id);
        if (ex) { ex.amount = String(amount); ex.gross_salary = gs; }
        else db.store.salary_setup.push({ e_s_s_id:Date.now(), employee_id, sal_type:'earning', salary_type_id:'Basic', amount:String(amount), gross_salary:gs });
      } else {
        await db.query('INSERT INTO employee_salary_setup (employee_id,sal_type,salary_type_id,amount,gross_salary,create_date) VALUES (?,?,?,?,?,?)', [employee_id,'earning','Basic',amount,gs,new Date()]);
      }
      return sendJSON(res, 200, { success:true, message:'Salary setup saved!' });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  if (pathname === '/api/payroll/payments' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return sendJSON(res, 200, { success:true, data: await db.getSalaryPayments(req.query) });
  }

  if (pathname === '/api/payroll/generate' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (!user.is_admin) return sendJSON(res, 403, { success:false, message:'Admin only.' });
    try {
      const { working_period, payment_date } = B;
      if (!working_period) return sendJSON(res, 400, { success:false, message:'working_period zaroori hai.' });
      const employees = await db.getEmployees({ status:'active' });
      const generated = [];
      for (const emp of employees) {
        const setup = await db.getSalarySetup(emp.employee_id);
        const gross = setup.reduce((s,x) => s + parseFloat(x.gross_salary||0), 0);
        if (gross > 0) {
          const rec = await db.createSalaryPayment({ employee_id:emp.employee_id, total_salary:gross, working_period, payment_date: payment_date || new Date().toISOString().split('T')[0], paid_by:user.firstname });
          generated.push({ ...rec, gross, name:`${emp.first_name} ${emp.last_name||''}` });
        }
      }
      return sendJSON(res, 200, { success:true, message:`Salary generated for ${generated.length} employees!`, total_amount: generated.reduce((s,p)=>s+(p.gross||0),0), data:generated });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const slipM = pathname.match(/^\/api\/payroll\/slip\/([^/]+)\/([^/]+)$/);
  if (slipM && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      const [,eid, period] = slipM;
      const emp  = await db.getEmployeeById(eid);
      if (!emp)  return sendJSON(res, 404, { success:false, message:'Employee nahi mila.' });
      const setup = await db.getSalarySetup(eid);
      const pays  = await db.getSalaryPayments({ employee_id:eid, period });
      const atts  = await db.getAttendance({ employee_id:eid, month:period });
      const gross = setup.reduce((s,x) => s+parseFloat(x.gross_salary||0), 0);
      const tax   = gross > 50000 ? Math.round(gross * 0.1) : 0;
      return sendJSON(res, 200, { success:true, slip:{
        employee_id:eid, period,
        employee_name:`${emp.first_name} ${emp.last_name||''}`,
        department:emp.department_name||'', position:emp.position_name||'',
        joining_date:emp.joining_date, gross_salary:gross,
        deductions:{tax}, net_salary:gross-tax,
        days_present:atts.filter(a=>a.sign_in).length,
        payment_date:pays[0]?.payment_date||'Pending', paid_by:pays[0]?.paid_by||'',
        earnings:setup
      }});
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── LOANS ─────────────────────────────────────
  if (pathname === '/api/loans') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const loans = await db.getLoans(req.query.employee_id ? { employee_id:req.query.employee_id } : {});
        return sendJSON(res, 200, { success:true, data:loans });
      }
      if (method === 'POST') {
        const { employee_id, amount, interest_rate=0, repay_months=12, loan_date } = B;
        if (!employee_id || !amount) return sendJSON(res, 400, { success:false, message:'employee_id aur amount zaroori hain.' });
        const loan = await db.createLoan({ employee_id, amount:parseFloat(amount), interest_rate:parseFloat(interest_rate), repay_months:parseInt(repay_months), loan_date:loan_date||new Date().toISOString().split('T')[0] });
        return sendJSON(res, 201, { success:true, message:'Loan submitted!', data:loan });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const loanApprove = pathname.match(/^\/api\/loans\/(\d+)\/approve$/);
  if (loanApprove && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (db.isMySQL()) await db.query('UPDATE grand_loan SET status=? WHERE id=?', ['approved', loanApprove[1]]);
      else { const l = db.store.loans.find(l => l.loan_id==loanApprove[1]); if(l) l.status='approved'; }
      return sendJSON(res, 200, { success:true, message:'Loan approved!' });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── NOTICES ───────────────────────────────────
  if (pathname === '/api/notices') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') return sendJSON(res, 200, { success:true, data: await db.getNotices() });
      if (method === 'POST') {
        if (!user.is_admin) return sendJSON(res, 403, { success:false, message:'Admin only.' });
        const { title, description='' } = B;
        if (!title) return sendJSON(res, 400, { success:false, message:'Title zaroori hai.' });
        const n = await db.createNotice({ title, description, created_by:user.id });
        return sendJSON(res, 201, { success:true, message:'Notice posted!', data:n });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  const noticeId = pathname.match(/^\/api\/notices\/(\d+)$/);
  if (noticeId && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (db.isMySQL()) await db.query('DELETE FROM notice_board WHERE id=?', [noticeId[1]]);
      else { const i=db.store.notices.findIndex(n=>n.id==noticeId[1]); if(i>-1) db.store.notices.splice(i,1); }
      return sendJSON(res, 200, { success:true, message:'Deleted.' });
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // ── RECRUITMENT ───────────────────────────────
  if (pathname === '/api/recruitment/jobs') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const data = db.isMySQL() ? await db.query('SELECT * FROM job_advertisement ORDER BY id DESC') : db.store.recruitment.filter(r=>r.type==='job');
        return sendJSON(res, 200, { success:true, data:data||[] });
      }
      if (method === 'POST') {
        const { title, department='', description='', last_date='', vacancies=1 } = B;
        if (!title) return sendJSON(res, 400, { success:false, message:'Title zaroori hai.' });
        if (db.isMySQL()) await db.query('INSERT INTO job_advertisement (title,department,description,last_date,vacancies) VALUES (?,?,?,?,?)', [title,department,description,last_date,vacancies]);
        else db.store.recruitment.push({ type:'job', id:Date.now(), title, department, description, last_date, vacancies, created_at:new Date() });
        return sendJSON(res, 201, { success:true, message:'Job posted!' });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  if (pathname === '/api/recruitment/candidates') {
    const user = requireAuth(req, res); if (!user) return;
    try {
      if (method === 'GET') {
        const data = db.isMySQL() ? await db.query('SELECT * FROM candidate_basic_info') : db.store.recruitment.filter(r=>r.type==='candidate');
        return sendJSON(res, 200, { success:true, data:data||[] });
      }
      if (method === 'POST') {
        const { first_name, last_name='', email, phone='', present_address='' } = B;
        if (!first_name||!email) return sendJSON(res, 400, { success:false, message:'Name aur email zaroori hain.' });
        const can_id = Date.now() + 'L';
        if (db.isMySQL()) await db.query('INSERT INTO candidate_basic_info (can_id,first_name,last_name,email,phone,present_address) VALUES (?,?,?,?,?,?)', [can_id,first_name,last_name,email,phone,present_address]);
        else db.store.recruitment.push({ type:'candidate', can_id, first_name, last_name, email, phone, present_address, created_at:new Date() });
        return sendJSON(res, 201, { success:true, message:'Candidate added!', can_id });
      }
    } catch(e) { return sendJSON(res, 500, { success:false, message:e.message }); }
  }

  // 404
  sendJSON(res, 404, { success:false, message:`Route not found: ${method} ${pathname}` });
});

// ── Start ────────────────────────────────────────────────────
db.initMySQL().then(() => {
  server.listen(PORT, () => {
    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║    HRMS — HR Management System       ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  🌐  http://localhost:${PORT}            ║`);
    console.log(`  ║  💾  DB: ${db.isMySQL()?'MySQL ✅     ':'In-Memory ⚡'}            ║`);
    console.log('  ╚══════════════════════════════════════╝\n');
    console.log('  🔑  Login: admin@hrms.com / admin123\n');
  });
});
