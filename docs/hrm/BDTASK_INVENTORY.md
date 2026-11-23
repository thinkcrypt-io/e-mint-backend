# bdtask HRM — feature inventory (inspected 2026-11-23)

Source: https://hrm.bdtask-demoserver.com (admin login). Every sidebar page was fetched
in the logged-in session; tables, forms, select options and sub-pages recorded below.
Target: the **MINT HRM** project (`mint-2-mint-hrm`, MCP connector `3d389b7b`).

Pages that returned HTTP 500 on the demo itself: Project management → Projects,
Project → Reports, Reward → Management points, Attendance → Missing attendance.
Their shape is inferred from neighbouring pages.

## Dashboard
Cards: Total employees, Today presents, Today absents, Today leave.
Charts: Daily attendance by department (leave/present/absent %).
Lists: Award list (image, name, department, award, date), Leave requests,
Candidate selection, Notices. Profile: name, contact, photo, signature; change password.

## 1. Attendance
- Attendance form: employee*, date-time* (single check-in/out punch) + bulk import (.xlsx)
- Monthly attendance: employee*, year*, month*, in time*, out time* (fills a whole month)
- Missing attendance (500 on demo) — employees with no punch on a day

## 2. Award
Award list: award name*, description, gift item*, date*, employee*, awarded by*

## 3. Department
- Department: name, status (active/inactive)
- Sub department (division): name*, department*, status

## 4. Employee
- Position: name*, details*, status
- Employee (big form, sections):
  - Basic info: first*, middle, last*, email*, phone*, country, city, zip, alternate phone,
    national id, iqama no, passport no, driving licence no, attendance time (shift)*
  - Salary & bank: account no, bank name, TIN, branch address, BBAN, basic salary*,
    transport allowance*, gross salary*
  - Benefit: medical, transportation, family, other
  - Employment: department*, sub department, position*, duty type (Full time/Part time/
    Contractual/Other), contract start*/end*, joining*, hire*, rehire, termination date,
    card no, monthly work hours*, work permit y/n, pay frequency* (Yearly/Monthly/Biweekly/
    Weekly), pay frequency text, hourly rate, hourly rate 2, employee grade, termination
    reason, work in city, employee type* (Intern/Contractual/Full time/Remote),
    voluntary termination y/n
  - Personal: date of birth*, gender* (Male/Female/Transgender), marital status (Single/
    Married/Divorced/Widowed/Other), no. of kids, SOS*, religion, ethnic group, photo
  - Emergency contact: person, relationship, contact, home phone, work phone, alt contact,
    alt home phone, alt work phone
  - Medical: blood group, health condition, disabled y/n, disability description
  - Others: home email, home phone, cell phone
  - Documents (rows): title*, file*, expiry date*
  - Supervisor setup: is supervisor y/n
  - User setup: login email + password
- Employee list columns: employee id, name, email, mobile, DOB, designation, joining date, status
- Inactive employees list
- Employee performance review:
  employee*, review period (months)*, supervisor position*;
  Assessment A (P0/NI3/G6/VG9/E12 each, score + comments): demonstrated knowledge,
  timeliness, impact, overall achievement, beyond duty → total A;
  Assessment B (P2/NI4/G6/VG9/E10): interpersonal, attendance, communication,
  contributing → total B; total score = A + B; employee comments*;
  improvement plan rows (area, expected outcome, responsible person, start, end);
  goals rows (goal, completion date)

## 5. Leave
- Weekly holiday: which weekdays are off
- Holiday: name*, from*, to*, total days
- Leave types (in leave form): Annual, Earned, Medical, Recreational, Half day…
- Leave application: employee*, leave type*, start*, end*, days, hard copy file, reason;
  approval: approved date, approved start/end, approved days, manager comments, status

## 6. Loan
employee*, permitted by*, loan no, details, amount*, approved date*, repayment from*,
interest %*, installment period*, repayment amount*, installment*, installments cleared, status

## 7. Notice board
notice type*, description*, date*, attachment*, notice by*

## 8. Payroll
- Salary advance: employee*, amount*, release amount, salary month*, status
- Salary generate: salary month → sheet (name, generated date/by, status, approved date/by);
  salary chart per employee: basic, total benefit, transport, gross, state income tax,
  social security NPF, employer contribution, loan deduction, salary advance,
  total deductions, net salary; salary approval voucher (debit/credit)
- Manage employee salary: employee, month, total salary (payslip)

## 9. Procurement
- Request: requesting person*, department*, expected start*/end*, reason*;
  items (description, unit, qty); quote status
- Quotation: company, PIN, expected delivery date, delivery place, date (+ items)
- Bid analysis: SBA no*, location*, date*, quotation*, attachment*;
  rows (company, description, reason of choosing, remarks, unit, qty, price, total);
  committee signatures (member, signature, date)
- Purchase order: quotation*, location*, vendor*, address*, notes*; items (desc, unit, qty,
  price, total); authoriser name/title/signature/date
- Goods received: purchase order*, vendor*, date*; items; received by name/title/signature
- Vendors: name*, mobile*, email*, address*, country*, city*, zip*, previous balance*
- Committees: name*, signature
- Units: unit*

## 10. Project management
- Clients: client name, company, email, country (+ address)
- Projects (500 on demo): name, client, lead, approximate tasks, duration/start/end
- Sprints: name, duration, project, start date, status
- Tasks: summary, sprint, project, lead, team member, status, priority, date, created by
- Reports; Team member search (employee → their project tasks)

## 11. Recruitment
- Candidate: first*, last, email, phone*, alt phone, SSN, present/permanent address,
  country, city, zip, picture; education rows (degree, university, CGPA, comments);
  experience rows (company, period, duties, supervisor)
- Shortlist: candidate*, position*, shortlist date*, interview date*
- Interview: candidate*, position*, date*, interviewer*, viva*, written*, MCQ*, total*,
  recommendation, selection (Selected/Deselected), details
- Selection: candidate*, position*, selection terms*, employee id

## 12. Reports
Attendance (daily present), Leave, Employee, Payroll (ICF contribution, SS/NPF/ICF,
GRA ret 5, state income tax, salary confirmation form, NPF3 soc-sec tax), Ad-hoc
(field/operator/value builder).

## 13. Reward points
- Point settings: general point*, attendance point*, collaborative start/end,
  attendance window start/end
- Point categories: name*
- Management points (500): employee, category, points, reason, date
- Collaborative points: employee*, reason*, point*, date
- Attendance points: employee, in time, points, date
- Employee points: attendance + collaborative + management = total, by date

## 14. Setup rules (salary rules)
type* (Time/Basic/Allowance/Deduction/Tax), name*, amount*, start/end time (Time type),
is percent y/n, effect on (basic/gross), status

## 15. Settings
Company title, phone, address, website, currency, decimals, state income tax,
soc-sec NPF %, fixed date, email, tax no, footer, negative symbol, LTR/RTL,
employer contribution %, ICF amount, logos, login image, favicon

## 16. Message
New (to employee, subject, message), Inbox, Sent (status read/unread)

---

## Build status (MINT HRM, mint-2-mint-hrm)
| # | Module | Status |
|---|---|---|
| 1 | Organisation & Employees — SubDepartment, Shift, Employee (EMP-) | built + 10 demo records each, 2026-11-23 |
| 2 | Attendance & Leave — Attendance (ATT-), WeeklyHoliday (single), Holiday, LeaveType, LeaveApplication (LV-) | built + 10 demo records each (WeeklyHoliday: 1, single), 2026-11-23 |
| 3 | Payroll — SalaryRule, SalaryAdvance (ADV-), Loan (LN-), SalarySheet (SAL-), Payslip (PS-) | built + 10 demo records each, 2026-11-23 |
| 4 | Performance & Engagement — PerformanceReview (PR-), Award, Notice, Message | built + 10 demo records each, 2026-11-23 |
| 5 | Recruitment — Candidate (CAN-), Shortlist (SL-), Interview (INT-), Selection (SEL-) | built + 10 demo records each, 2026-11-23 |
| 6 | Procurement — Unit, Vendor, Committee, PurchaseRequest (REQ-), Quotation (QT-), BidAnalysis (BA-), PurchaseOrder (PO-), GoodsReceived (GRN-) | built + 10 demo records each, 2026-11-23 |
| 7 | Projects — Client, Project (PRJ-, route client-projects), Sprint, Task (TSK-) | built + 10 demo records each, 2026-11-24 |
| 8 | Reward points — PointSettings (single), PointCategory, ManagementPoint, CollaborativePoint, AttendancePoint | built + 10 demo records each (settings: 1), 2026-11-24 |
| — | Dashboard (10 widgets), 17 saved reports, CompanySettings (single), 5 panel roles | done 2026-11-24; panel logins wait for the user's passwords |

Decisions: one Full name field (not first/middle/last); Passport no = password kind
(platform rule); employee logins via panel users, not a password field.

Demo data: 10 records each in departments, positions, shifts, sub-departments, employees,
holidays, leave-types, attendances (ATT-00001…10), leave-applications (LV-0001…10).

Connector fixes found while seeding (backend, not deployed — Heroku deploy is manual):
- create_records now runs autofill (fillFrom) before formulas, so Attendance → Department fills.
  The 10 seeded attendances were backfilled directly in the project collection.
- Links are matched and shown by the linked model's display field (Employee → Full name) in
  create_records, query_records and run_report (records.helpers refNaming).

Module 3 notes: payslips copy basic / total benefit / transport from the employee (editable
autofill) and Department (read-only autofill); salary rules are reference only, not applied
automatically. Demo: 10 monthly sheets Feb–Nov 2026; 10 November payslips with tax 5% of gross,
NPF 5.5% of basic, the active loan's installment and the November advance. Payslip departments
were backfilled directly, as the live connector has no autofill until the backend is deployed.

Module 4 notes: review scores are numbers capped at 12 (A) / 10 (B) with bdtask's scale in the
help text; Total A + Total B = Total score out of 100. No text Rating (formulas can't return text).
One comments box per assessment, not per item. Notices got a Title. Messages are one model with
Inbox / Sent messages tabs on each employee. Supervisor position (read-only autofill from the
reviewer) was backfilled directly for the 10 demo reviews.

Module 5 notes: candidates have one Full name; SSN is password kind (masked, like passport no).
Interview total = viva + written + MCQ. Selection links to the Employee record instead of a typed
employee ID; demo CAN-0008 is Mithila Chowdhury, whose SEL-0008 links to her employee record.
Recruitment tabs live on the candidate page only (switched off on Employee and Position).

Module 6 notes: item-row Unit is text (row fields can't link), so Units is a reference list. Quotations
and orders link a Vendor instead of a typed company name; committees list member employees. Line total =
quantity × price, grand total = sum(items.total) — verified on saved records. Department on requests,
vendor on orders/receipts and vendor address on orders are editable autofills; demo data passed them
explicitly (live connector has no autofill yet). Demo: 10 requests (8 ordered, 1 pending, 1 rejected),
10 quotations (8 chosen, 2 not chosen), a bid analysis per quotation, 10 POs (6 received, sent, authorised,
draft, cancelled) and 10 receipts incl. partial ones (GRN-0001+0002 = PO-0001, 0004+0005 = PO-0003,
0007+0008 = PO-0005; GRN-0010 is half of PO-0007's brochures).

Module 7 notes: /projects is a reserved project address, so Projects live at /client-projects. Projects
got team members and a status; duration = daysBetween(start, end). Sprint end date = addDays(start,
duration). Task lead is an editable autofill from the project's lead (demo data passed it explicitly).
Employee pages get Tasks (assigned) and Projects led tabs, replacing bdtask's team member search.
Project reports (500 on the bdtask demo) are left for the reports step.

Module 8 notes: point settings is a single record; attendance window times are text (HH:MM), as the
platform has no time kind. Management and collaborative points got a Given by employee. bdtask's
Employee points (attendance + collaborative + management) can't be one formula across three models, so
it is three saved summary reports grouped by employee. Points are entered by hand; nothing awards
attendance points automatically from check-in times.

Dashboard: Total employees (active), Today presents / absents / on leave (attendances, date = today),
attendance by department and by status (30 days), latest awards, leave requests, candidate selections
and notices.

Reports (17, categories Attendance, Leave, Employees, Payroll, Reward points, Projects, Procurement):
daily attendance, attendance by department, leave list, leave days by type, employee list, employees by
department, salary confirmation, state income tax, NPF + employer contribution, payroll by department,
the three points summaries, tasks by team member / by project, purchase orders by vendor. bdtask's ICF
contribution and GRA reports have no source fields (no ICF on payslips), so they are not built; Ad-hoc
is the panel's own report builder. Linked-part columns (employee.fullName) come back empty through the
live connector's run_report until the backend (refNaming) is deployed.

Settings: CompanySettings single record holds bdtask's settings page (title, contacts, currency,
decimals, negative symbol, LTR/RTL, fixed date, tax / NPF / employer % / ICF, footer, logos). The payroll
rates there are reference values; payslips don't read them automatically.

Staff logins: panel roles HR manager, Payroll officer, Procurement officer, Project manager, Employee.
No panel users yet: save_panel_user needs a password from the user. Records have no per-record owner, so
the Employee role sees all leave applications / messages, not only their own.
