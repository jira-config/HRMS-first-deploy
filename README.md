# 👔 HRMS — Human Resource Management System
### Node.js + MySQL | Based on `software_hrmsdb22.sql`

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start server
node src/server.js

# 3. Browser mein kholein
# http://localhost:3000
```

---

## 🔑 Login Credentials

| Field    | Value              |
|----------|--------------------|
| Email    | admin@hrms.com     |
| Password | admin123           |

---

## 💾 Database Setup (MySQL ke liye)

```sql
-- phpMyAdmin ya MySQL Workbench mein:
CREATE DATABASE software_hrmsdb22;
USE software_hrmsdb22;
-- software_hrmsdb22.sql file import karein
```

**.env file update karein:**
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=software_hrmsdb22
```

> **Note:** MySQL na ho toh bhi kaam karta hai — In-Memory mode mein auto-start hota hai.

---

## 📦 Modules

| Module          | Features                                      |
|-----------------|-----------------------------------------------|
| 👥 Employees    | Add, Edit, Deactivate, Search, Filter by dept |
| 🏢 Departments  | Create, Delete, Employee count                |
| 📅 Attendance   | Check-in/out, Monthly view, Summary           |
| 🏖 Leave        | Apply, Approve/Reject, Leave types            |
| 💰 Payroll      | Salary setup, Generate, Salary Slip           |
| 🏦 Loans        | Apply, Approve, Interest calculation          |
| 🎯 Recruitment  | Job openings, Candidate management            |
| 📢 Notice Board | Post, View, Delete notices                    |

---

## 🌐 API Endpoints

```
POST  /api/auth/login
POST  /api/auth/logout
GET   /api/auth/me

GET   /api/employees
POST  /api/employees
GET   /api/employees/:id
PUT   /api/employees/:id
DELETE /api/employees/:id

GET   /api/departments
POST  /api/departments
PUT   /api/departments/:id
DELETE /api/departments/:id

GET   /api/attendance
POST  /api/attendance/checkin
POST  /api/attendance/checkout
GET   /api/attendance/summary/:employee_id

GET   /api/leave
POST  /api/leave
PUT   /api/leave/:id/approve
PUT   /api/leave/:id/reject
GET   /api/leave/types

GET   /api/payroll/setup/:employee_id
POST  /api/payroll/setup
GET   /api/payroll/payments
POST  /api/payroll/generate
POST  /api/payroll/pay/:employee_id
GET   /api/payroll/slip/:employee_id/:period

GET   /api/loans
POST  /api/loans
PUT   /api/loans/:id/approve

GET   /api/notices
POST  /api/notices
DELETE /api/notices/:id

GET   /api/recruitment/jobs
POST  /api/recruitment/jobs
GET   /api/recruitment/candidates
POST  /api/recruitment/candidates

GET   /api/dashboard
GET   /api/health
```

---

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MySQL (mysql2) with in-memory fallback
- **Auth:** Token-based sessions
- **Frontend:** Vanilla HTML/CSS/JS SPA

---

## 📁 Project Structure

```
hrms-nodejs/
├── .env
├── package.json
├── public/
│   └── index.html        ← Complete SPA frontend
└── src/
    ├── server.js          ← Main Express server
    ├── middleware/
    │   └── auth.js        ← Token auth
    ├── utils/
    │   └── db.js          ← MySQL + in-memory store
    └── routes/
        ├── auth.js
        ├── employees.js
        ├── departments.js
        ├── attendance.js
        ├── leave.js
        ├── payroll.js
        ├── loans.js
        ├── notices.js
        └── recruitment.js
```

---

**Version:** 1.0.0 | Based on `software_hrmsdb22` schema
