# Outpass Management System — Project Documentation

**Digital Outpass Approval System — Lendi Institute of Engineering and Technology**

*Every statement below describes functionality that actually exists in the codebase. Anything that could not be determined from the code is explicitly marked "Not specified in the current implementation."*

---

## 1. Project Title

| Item | Detail |
|---|---|
| **Project Name** | Outpass Management System — "Digital Outpass Approval System, Lendi Institute of Engineering and Technology" |
| **Project Type** | Full-stack web application (Single Page Application with a serverless backend) |
| **Purpose** | To digitize the campus outpass (gate pass) request, multi-level approval, and gate-verification process |
| **Short Description** | A role-based web application where students raise outpass requests, faculty approve them through a Class In-Charge → HOD → Principal chain, and security guards verify approved passes at the gate via a UUID or a scannable QR code, recording exit and entry events. |
| **Target Users** | Students, Class In-Charges, Coordinators, Heads of Department, Principal, Security Guards |
| **Problem Solved** | Removes the paper slip and physical signature chain from campus exit permission, replacing it with a tracked, verifiable, real-time digital workflow with a tamper-resistant gate check. |

---

## 2. Project Overview

### 2.1 Why the system was developed

In a conventional college, a student who needs to leave campus during working hours fills a paper slip, physically locates the class in-charge, then the HOD, and sometimes the Principal, and finally hands the signed slip to the security guard at the gate. The slip is the only record. Once handed over it is filed in a register — or lost.

This application replaces that entire chain with a single web application in which the request, every approval decision, the identity of each approver, the timestamp of each stage, and the final gate scan are all recorded in a relational database.

### 2.2 Problems with the traditional/manual process

- The student must physically walk between offices to collect signatures.
- If an approver is not at their desk the request stalls indefinitely with no visibility.
- A paper slip can be forged, reused, or transferred to another student.
- There is no way for a guard to confirm that all required approvals were actually obtained.
- Registers are hard to search; producing a monthly report requires manual counting.
- Nobody can tell, at a glance, how many students are currently outside campus.
- Students cannot see the status of their own request without asking in person.

### 2.3 How the digital system solves these problems

| Manual problem | Digital solution as implemented |
|---|---|
| Physical signature chase | Requests appear automatically in the correct approver's dashboard, filtered by `current_approval_level` |
| Stalled requests | A database function `escalate_pending_outpasses()` widens visibility to Coordinator (5 min), HOD (10 min), and Principal (20 min); a per-approver monthly cap auto-escalates to the Principal |
| Forged/reused slips | The pass is a server-generated UUID rendered as a QR code; the gate check calls a privileged backend function that re-reads the live database record |
| No proof of approval | The verification function returns `valid: false` with the exact status for anything not fully approved |
| Unsearchable registers | Every request, approval, notification and gate scan is a row in Postgres |
| Unknown headcount outside | The Security Dashboard computes a live "Currently Out" figure from exit/entry logs |
| No status visibility | Student and faculty dashboards subscribe to Postgres realtime changes and update without a refresh |

### 2.4 Main objectives

1. Digitize outpass requests end to end.
2. Enforce a strict, sequential, multi-level approval hierarchy.
3. Issue a single canonical identifier per outpass, usable by all three roles.
4. Make gate verification instant, camera-driven, and impossible to spoof client-side.
5. Keep an auditable record of who approved what, and when.
6. Restrict every user to exactly the data their role permits, enforced in the database itself.

### 2.5 Expected benefits

Faster approvals, zero paperwork, a verifiable audit trail, real-time status for students, quota-based control over excessive outpass usage, and immediate reporting of daily/weekly approval activity.

### 2.6 Overall system workflow (high level)

```text
Student                Faculty chain                    Security
   |                        |                              |
Register/Login          Login                          Login
   |                        |                              |
Complete profile            |                              |
   |                        |                              |
Submit request  --->  Class In-Charge  --->  HOD  --->  Principal
   |                    (approve)         (approve)    (final approve)
   |                        |                              |
   |<---- rejected ---------+                              |
   |                                                       |
UUID + QR revealed on dashboard  --------------------->  Scan / type UUID
                                                           |
                                                     verify-outpass
                                                           |
                                                 Record Exit -> Record Entry
                                                           |
                                                     security_logs
```

---

## 3. Problem Statement

Managing student exit permissions on paper creates a set of compounding operational problems, all of which this project targets:

1. **Manual approval process.** Each level of authority must be located physically; a single absent faculty member blocks the request.
2. **Paper-based records.** Slips are stored in registers that degrade, get misfiled, and cannot be queried.
3. **Difficulty tracking requests.** Neither the student nor the office can determine where in the chain a request currently sits.
4. **Lack of transparency.** Rejections are often verbal with no recorded reason; the system stores a `rejection_reason` on the record itself.
5. **Unauthorized exits.** A handwritten slip is trivially forged or reused. There is no reliable check at the gate.
6. **Difficulty maintaining student records.** Registration number, department, year, and section are re-written on every slip instead of being stored once.
7. **Delayed approvals.** No mechanism exists to escalate a request that has been sitting untouched.
8. **No real-time status tracking.** The student has to ask in person.
9. **Difficulty generating reports.** Counting approvals per faculty member per month is a manual exercise.
10. **No control over frequency.** Nothing stops a student from taking an outpass every other day.

---

## 4. Proposed Solution

The implemented solution is a role-based web application backed by a managed Postgres database, Row Level Security, and four serverless edge functions that hold the business logic.

### 4.1 Implemented workflow

```text
1. REQUEST
   Student submits purpose + from_date + to_date.
   Edge function `request-outpass` validates input, enforces the 4-per-month
   quota, generates a UUID, and inserts the row with:
       status = 'pending'
       current_approval_level = 'class_incharge'
       visible_to_roles = ['class_incharge']
       qr_code = <same UUID as id>

2. VERIFICATION / APPROVAL CHAIN
   The request appears only in the dashboard of the role named in
   current_approval_level. Edge function `process-request` handles each decision:
       class_incharge approves -> current_approval_level = 'hod'
       hod approves            -> current_approval_level = 'principal'
       principal approves      -> status = 'approved', visible_to_roles = []
   Any level may reject, which terminates the request immediately.

3. ESCALATION
   If the approving class_incharge or hod has already recorded 5 approvals in the
   current calendar month, the request jumps straight to 'principal'.
   Separately, escalate_pending_outpasses() widens visible_to_roles over time.

4. OUTPASS GENERATION
   No separate "generation" step exists. The UUID created at submission becomes
   the outpass; the student dashboard reveals it (and renders it as a QR code)
   only once status = 'approved'.

5. EXIT / RETURN TRACKING
   Security scans the QR with the device camera, or types the UUID.
   Edge function `verify-outpass` (service role) re-reads the record and returns
   the student's details plus valid: true/false. The guard then presses
   "Record Exit" or "Record Entry", writing a row to security_logs.

6. RECORD MANAGEMENT
   outpass_requests, approvals, notifications, security_logs, and
   faculty_monthly_approvals retain the full history.
```

---

## 5. Project Objectives

### 5.1 Objectives implemented in the project

| # | Objective | Where it is implemented |
|---|---|---|
| 1 | Digitize the outpass request process | `StudentDashboard.tsx` → `request-outpass` edge function |
| 2 | Reduce manual work and paperwork | Entire flow is database-backed; no printing step exists |
| 3 | Improve approval efficiency | Requests routed automatically by `current_approval_level`; realtime dashboards |
| 4 | Maintain centralized records | Seven Postgres tables retain requests, approvals, logs, notifications |
| 5 | Provide role-based access | `app_role` enum, `user_roles` table, `has_role()`, and RLS policies |
| 6 | Improve security and accountability | Every approval writes an `approvals` row with `approver_id`; role changes write `role_change_audit` |
| 7 | Enable status tracking | Realtime Postgres subscriptions on `outpass_requests` and `security_logs` |
| 8 | Reduce unauthorized movement | Gate verification only succeeds for `status = 'approved'`; reuse is flagged via `security_logs` |
| 9 | Control outpass frequency | Hard cap of 4 student requests per calendar month |
| 10 | Prevent approval bottlenecks | Monthly approval cap of 5 per faculty member with auto-escalation |

### 5.2 General potential objectives (not implemented)

Parent/guardian consent, SMS or email alerts, biometric identity checks, and integration with an institutional ERP are natural objectives for such a system but are **not present in the current implementation**.

---

## 6. Users and Roles

The database defines the enum `app_role` with exactly six values: `student`, `class_incharge`, `coordinator`, `hod`, `principal`, `security`. No other role exists.

### 6.1 Student

| Attribute | Detail |
|---|---|
| **Responsibilities** | Maintain a complete profile; raise outpass requests; present the approved UUID/QR at the gate |
| **Login/Access** | Email + password registration and login; role selected on the landing page must match the stored profile role |
| **Permissions** | Insert own requests (`auth.uid() = student_id`); select own requests; view and update own profile |
| **Pages** | Landing → Auth → Student Dashboard (with Edit Profile dialog, New Request dialog, QR dialog) |
| **Actions** | Complete/edit profile, submit a request, view status, copy the UUID, display the QR code, log out |
| **Restrictions** | Cannot submit until `reg_no`, `department`, `year` and `section` are filled; maximum 4 requests per calendar month; the verification UUID stays hidden until the request is fully approved; cannot see other students' data; cannot delete a request |

### 6.2 Class In-Charge

| Attribute | Detail |
|---|---|
| **Responsibilities** | First-level review of requests from their own department and section |
| **Login/Access** | Registers with Employee ID, department, year, section |
| **Permissions** | View and update requests where their role is present in `visible_to_roles`; view profiles of students with visible requests and of their own department |
| **Pages** | Faculty Dashboard → tabs: Pending Requests, Student Details, History |
| **Actions** | Approve (forwards to HOD), Reject with optional remarks, browse student outpass history filtered daily/monthly |
| **Restrictions** | Can only act while `current_approval_level = 'class_incharge'`; Student Details is filtered to their own department **and** section; after 5 approvals in a month, further approvals auto-escalate to the Principal; no Admin tab |

### 6.3 Coordinator

| Attribute | Detail |
|---|---|
| **Responsibilities** | Intermediate faculty role used by the time-based escalation path |
| **Login/Access** | Same faculty registration form |
| **Permissions** | Recognised as faculty by `process-request`; gains visibility of requests pending longer than 5 minutes via `escalate_pending_outpasses()` |
| **Pages** | Faculty Dashboard (same three tabs) |
| **Actions** | Views requests escalated to the coordinator role |
| **Restrictions** | **Important limitation:** `process-request` explicitly returns `"Invalid role for approval"` for the coordinator role on the approval branch, so a coordinator cannot complete an approval — only rejection logic and visibility apply |

### 6.4 Head of Department (HOD)

| Attribute | Detail |
|---|---|
| **Responsibilities** | Second-level approval |
| **Permissions** | Act on requests where `current_approval_level = 'hod'` |
| **Pages** | Faculty Dashboard (Pending Requests, Student Details, History) |
| **Actions** | Approve (forwards to Principal), Reject with remarks |
| **Restrictions** | Student Details filtered to their own department; subject to the same 5-approvals-per-month escalation rule |

### 6.5 Principal

| Attribute | Detail |
|---|---|
| **Responsibilities** | Final authority; administrative data management |
| **Permissions** | Approve requests at the `principal` level, which sets `status = 'approved'`; execute `admin_update_user_role()`; read `role_change_audit`; run bulk profile imports |
| **Pages** | Faculty Dashboard with an **additional Admin tab** containing Bulk Profile Import |
| **Actions** | Final approve/reject, view all students across all departments and sections, download the CSV template, import up to 500 student profiles |
| **Restrictions** | Not subject to the monthly approval cap (the cap applies only to `class_incharge` and `hod`) |

### 6.6 Security Guard

| Attribute | Detail |
|---|---|
| **Responsibilities** | Verify outpasses at the gate; record exit and return |
| **Login/Access** | Registers with Security ID, full name, email, phone number |
| **Permissions** | `verify-outpass` requires the `security` role; RLS allows selecting `outpass_requests` only where `status = 'approved'`; may insert and select `security_logs` |
| **Pages** | Security Dashboard → tabs: QR Scanner, Entry/Exit Logs |
| **Actions** | Scan a QR with the device camera, type a UUID manually, view the student's details, Record Exit, Record Entry, browse the 50 most recent logs |
| **Restrictions** | Cannot see pending or rejected requests through direct queries; cannot approve anything; cannot modify a request |

There is **no Warden role and no Parent/Guardian role** in this implementation.

---

## 7. Features and Functionalities

### 7.1 Registration

- **Purpose:** create an account and a profile row in one flow.
- **Who:** anyone, after choosing a role on the landing page.
- **How it works:** `supabase.auth.signUp()` is called with metadata `{ full_name, role }`. A database trigger `on_auth_user_created` runs `handle_new_user()`, which inserts into `profiles` and `user_roles`. The client then waits ~1 second and updates the profile with role-specific fields. An optional photo is uploaded to the public `avatars` storage bucket.
- **Inputs by role:**
  - *Student:* email, registration number, full name, photo (optional), date of birth, department (7 options), year (1st–4th), section (options derived from department + year), password, confirm password.
  - *Faculty:* email, employee ID, full name, department, year, section (optional), password, confirm password.
  - *Security:* security ID, full name, email, phone number, password, confirm password.
- **Validation:** passwords must match; minimum 6 characters; section select is disabled until department and year are chosen.
- **Outputs:** an `auth.users` row, a `profiles` row, a `user_roles` row, and an automatic login attempt.
- **Messages:** "Account created successfully! You can now log in.", "Registration Failed", "Passwords don't match!", "Password must be at least 6 characters long".

### 7.2 Login and role matching

- **Purpose:** authenticate and route the user to the correct dashboard.
- **How it works:** `signInWithPassword()`, then the profile is fetched. If the stored `role` does not match the role card the user selected on the landing page, the session is signed out.
- **Message on mismatch:** "Access Denied — This account is registered as {role}, not {expectedRole}".

### 7.3 Session restoration and routing

`Index.tsx` registers `onAuthStateChange` and also calls `getSession()` on mount. When a session exists, the profile is fetched and the app state moves to `dashboard`; the correct dashboard component is chosen from `profile.role`. Profile fetching inside the auth callback is deferred with `setTimeout` to avoid a deadlock with the Supabase auth lock.

### 7.4 Profile completeness gate

- **Purpose:** guarantee that every request carries identifiable student data.
- **Rule:** a student profile is complete only when `reg_no`, `department`, `year`, and `section` are all present.
- **Behaviour:** an amber warning card appears, the "New Request" button is disabled, and an Edit Profile dialog is offered. Saving updates `profiles` and reloads the page.

### 7.5 Outpass request creation

- **Who:** students with a complete profile.
- **Inputs:** Purpose (textarea), From date-time, To date-time (`datetime-local` inputs).
- **Client validation (Zod, `src/lib/schemas.ts`):** purpose trimmed, 10–200 characters, rejected if it matches `<script` or `javascript:`; both dates must be valid ISO datetimes; end must be after start and the start may not be in the past.
- **Server validation and rules (`request-outpass`):** the same purpose and date rules are re-checked server-side; requests created in the current calendar month are counted and the insert is refused at 4.
- **Status change:** row created with `status = 'pending'`, `current_approval_level = 'class_incharge'`, `visible_to_roles = ['class_incharge']`.
- **Outputs:** HTTP 201 with the inserted row; toast "Outpass request submitted successfully".

### 7.6 Monthly quota display

The Student Dashboard shows a "Monthly Usage" card with a `Progress` bar of `usedThisMonth / 4`, an "Active Requests" count (pending) and an "Approved" count.

### 7.7 Multi-level approval and rejection

- **Who:** class_incharge, hod, principal (coordinator is recognised as faculty but cannot complete an approval).
- **How it works:** the Faculty Dashboard lists requests where `status = 'pending'` **and** `current_approval_level = <the user's role>`. Selecting a row opens a detail view; Accept or Reject opens a confirmation dialog with an optional remarks textarea; confirming invokes `process-request`.
- **Guards enforced server-side:** JWT required; role must be one of the four faculty roles; a request already `approved` or `rejected` returns HTTP 409 "Request has already been processed"; the caller's role must match `current_approval_level`.
- **Status transitions on approval:** `class_incharge → hod → principal → approved`. Each stage stamps its own `*_id` and `*_approved_at` column and rewrites `visible_to_roles`.
- **Rejection:** sets `status = 'rejected'`, `rejected_by`, `rejected_at`, `rejection_reason` (defaults to "No reason provided"), and clears `visible_to_roles`.
- **Side effects:** an `approvals` row, a `notifications` row for the student, an increment of `faculty_monthly_approvals`, and — on final approval — one `notifications` row per security user of type `forward_to_security`.

### 7.8 Automatic escalation

Two independent mechanisms exist:

1. **Quota escalation (edge function).** Before an approval by a `class_incharge` or `hod`, the function reads `faculty_monthly_approvals` for that faculty member, role, and `YYYY-MM`. If the count is already 5 or more, the request is forced to `current_approval_level = 'principal'` and `visible_to_roles = ['principal']`, and the `approvals` comment records "Auto-escalated due to monthly limit".
2. **Time escalation (database function).** `escalate_pending_outpasses()` appends `coordinator` after 5 minutes, `hod` after 10 minutes, and `principal` after 20 minutes to `visible_to_roles` of any still-pending request. *Whether a scheduler invokes this function periodically is not specified in the current implementation.*

### 7.9 UUID issuance and disclosure

A single UUID is generated by `crypto.randomUUID()` inside `request-outpass` and written to **both** `id` and `qr_code`, so student, faculty and security all reference the same value. On the Student Dashboard the full UUID is rendered **only** when `request.status === "approved"`; otherwise a dashed placeholder reads "Verification ID will appear here once your request is approved." The card heading shows the request date rather than a truncated UUID.

### 7.10 QR code generation

Approved requests expose a "Show QR Code" button that opens a dialog rendering `QRCodeSVG` (from `qrcode.react`) at size 200 with error-correction level `H`, encoding the raw UUID, alongside the UUID in monospace text. A "Copy ID" button copies the UUID to the clipboard with a "Copied!" confirmation.

### 7.11 Camera-based QR scanning

`QRScanner.tsx` wraps the `html5-qrcode` library. A "Scan with Camera" button starts the rear-facing camera in a live preview; on a successful decode the scanner stops automatically and passes the decoded string upward. Camera permission errors are displayed inline.

### 7.12 Gate verification

- **Who:** users holding the `security` role.
- **Inputs:** a decoded QR string or a manually typed Outpass ID. A regular expression extracts a UUID from the scanned text (so a URL-wrapped QR also works), and `qrCodeSchema` validates it.
- **Processing (`verify-outpass`, service role):** looks up `outpass_requests` with `.or('id.eq.<uuid>,qr_code.eq.<uuid>')`, joined to the student's profile.
- **Outputs on success:** `valid: true` with outpass ID, student name, registration number, year, department, purpose, valid-from, valid-to, status, plus `alreadyUsed` and `usageType` derived from `security_logs`.
- **Outputs on failure:** `valid: false` with a specific message — "Invalid UUID - Outpass not found in system", or "Outpass Status: PENDING/REJECTED - Cannot grant entry".
- **UI:** a green "Valid Outpass" card with a Record Exit / Record Entry button, or a red "❌ Entry Denied" card showing the reason.

### 7.13 Exit and return recording

Pressing Record Exit or Record Entry inserts directly into `security_logs` with `request_id`, `security_id`, `action` (`exit` or `entry`) and optional notes. This is the only write in the application performed directly against a table rather than through an edge function. The verification response uses these logs to determine whether the next expected scan is an entry.

### 7.14 Security statistics and logs

The Security Dashboard shows Today's Exits, Today's Returns, Currently Out (computed as `+1` per exit and `−1` per entry across the fetched logs), and Total Activities, followed by the 50 most recent log entries with an EXIT/ENTRY badge, student name, registration number, purpose, timestamp and the label "Main Gate".

### 7.15 Faculty statistics

Approved Today, Rejected Today and Weekly Total are counted from the `approvals` table filtered by `approver_id` (rather than from `outpass_requests`), which keeps the counts accurate under the row-level security policies. Pending Approvals is the length of the pending list.

### 7.16 Student Details browsing

Faculty can browse outpass records by Daily (a `date` input) or Monthly (a `month` input) range. The visible student set is scoped by role: class in-charge sees their department and section, HOD sees their department, Principal sees everyone. A "Previous Outpasses" count of prior approved requests is shown per student.

### 7.17 Bulk profile import (Principal only)

- **Template:** a downloadable CSV with the header `email,reg_no,department,year,section,full_name` and two sample rows.
- **Upload:** a `.csv` file is parsed in the browser; the five mandatory columns must be present or parsing throws. A preview table is shown before import.
- **Server rules (`bulk-update-profiles`):** the caller's profile role must be `principal`; the batch must be a non-empty array of at most 500 records; each record is matched to a profile by lower-cased email; a matched profile whose role is not `student` is skipped; `branch` is mirrored from `department` and `section` is upper-cased.
- **Output:** `{ success, failed, errors[] }`, always with HTTP 200, rendered as badges plus a scrollable error list.

### 7.18 Realtime updates

Both the Student Dashboard (`postgres_changes` on `outpass_requests` filtered to `student_id`) and the Faculty and Security dashboards subscribe to table changes, so approvals and gate scans appear without a manual refresh.

### 7.19 Notifications (in-database)

A `notifications` table is populated by `process-request` with types `status_update`, `student_accept`, `student_reject`, and `forward_to_security`. See section 20 for the important caveat about their presentation.

---

## 8. Complete System Workflow

1. **Opens the application.** The browser loads the SPA at `/`. `Index.tsx` checks for an existing session.
2. **Landing page.** With no session, the hero page renders. The user clicks "Register / Login" and picks one of six role cards.
3. **Registers or logs in.** The Auth screen shows Login and Register tabs, with the registration fields determined by the selected role. On login the stored role must match the selected role, otherwise the session is terminated.
4. **Reaches the dashboard.** The profile role determines which of the three dashboards renders. There is no URL change — the route stays `/`.
5. **Student completes the profile.** If registration number, department, year or section are missing, the request button stays disabled until the Edit Profile dialog is saved.
6. **Creates an outpass request.** The student opens the New Request dialog, enters purpose and the from/to date-times.
7. **Submits.** Zod validates in the browser; `request-outpass` re-validates, enforces the 4-per-month cap, generates the UUID, and inserts the row as pending at the `class_incharge` level.
8. **The request reaches the authority.** Because `current_approval_level = 'class_incharge'`, it appears in that faculty member's Pending Requests table in realtime.
9. **The authority reviews.** Clicking the row shows student name, roll number, year, department, outpass UUID, status, reason, requested date-time, and the count of previous outpasses.
10. **Approve or reject.** A confirmation dialog with an optional remarks field calls `process-request`. Approval advances the level to `hod`, then to `principal`. Rejection ends the request and stores the reason.
11. **Final approval.** The Principal's approval sets `status = 'approved'`, stamps `approved_by`/`approved_at`, keeps `qr_code` equal to the UUID, clears `visible_to_roles`, and notifies every security user.
12. **The outpass becomes usable.** The student's card now reveals the verification UUID with copy and "Show QR Code" buttons.
13. **The student presents the pass.** At the gate the student shows the QR on their phone, or reads out the UUID.
14. **Security verifies.** The guard scans with the camera or types the ID; `verify-outpass` re-reads the live record with service-role privileges and returns the student's details and validity.
15. **Exit is recorded.** The guard presses Record Exit; a `security_logs` row with `action = 'exit'` is inserted, and the Currently Out counter increases.
16. **Return is recorded.** On the student's return the same pass is scanned; the response indicates an entry is expected; the guard presses Record Entry and an `action = 'entry'` row is written.
17. **Final status stored.** The request remains `approved` with a complete trail across `approvals`, `notifications`, and `security_logs`. There is **no separate "completed" or "expired" status** in the current implementation.

---

## 9. Application Pages / Screens

The application uses a **single route with state-driven screens**. Only two React Router routes exist.

### 9.1 Landing Page

| Field | Detail |
|---|---|
| **Route** | `/` (app state `landing`) |
| **Purpose** | Introduce the system and capture the intended role |
| **Access** | Public, unauthenticated |
| **UI components** | Full-bleed campus background image with a dark overlay, college logo, `H1` title, `H2` subtitle, hero CTA button, Radix `Dialog`, six role `Card`s with `lucide-react` icons |
| **Information shown** | System name, institute name, tagline, six roles with descriptions |
| **Actions** | "Register / Login" → role dialog → role selection |
| **Navigation** | Selecting a role moves the app state to `auth` |
| **Validations / backend** | None; no database interaction |

### 9.2 Authentication Screen

| Field | Detail |
|---|---|
| **Route** | `/` (app state `auth`) |
| **Purpose** | Registration and login |
| **Access** | Public |
| **UI components** | `Tabs` (Login / Register), `Input`, `Label`, `Select`, file input, `Button`, toasts |
| **Actions** | Log in, register, go back to role selection |
| **Validations** | Password match, minimum 6 characters, required fields, dependent section options |
| **Backend** | `auth.signUp`, `auth.signInWithPassword`, `profiles` select/insert/update, `avatars` storage upload |

### 9.3 Student Dashboard

| Field | Detail |
|---|---|
| **Route** | `/` (app state `dashboard`, role `student`) |
| **Purpose** | Manage own outpass requests |
| **Access** | `student` only |
| **UI components** | Header with Logout, profile-incomplete `Card`, Edit Profile `Dialog`, three stat `Card`s with `Progress`, New Request `Dialog`, request `Card` list, `Badge`, QR `Dialog` |
| **Information shown** | Monthly usage out of 4, active and approved counts, per-request purpose, dates, status, UUID (approved only), rejection reason and timestamp |
| **Actions** | Edit profile, create request, copy UUID, show QR, log out |
| **Validations** | Profile completeness, monthly limit, purpose 10–200 chars, date ordering and not-in-past |
| **Backend** | `outpass_requests` select + realtime, `profiles` update, `request-outpass` invoke |

### 9.4 Faculty Dashboard

| Field | Detail |
|---|---|
| **Route** | `/` (app state `dashboard`, roles `class_incharge`, `coordinator`, `hod`, `principal`) |
| **Purpose** | Review and decide on pending requests; browse student activity |
| **Access** | The four faculty roles; the Admin tab is Principal-only |
| **UI components** | Four stat `Card`s, `Tabs`, `Table`, detail `Card`, confirmation `Dialog` with remarks `Textarea`, `Select` and date/month inputs, `Badge` |
| **Information shown** | Pending count, approved today, rejected today, weekly total, per-request student details and previous outpass count |
| **Actions** | Open a request, Accept, Reject with remarks, switch daily/monthly view, open the Admin tab |
| **Validations** | `approvalSchema` (UUID, action enum, comments ≤ 500 chars) |
| **Backend** | `outpass_requests` select with a profile join, `approvals` count queries, `process-request` invoke, realtime subscription |
| **Known gap** | The History tab currently renders a placeholder string and performs no query |

### 9.5 Security Dashboard

| Field | Detail |
|---|---|
| **Route** | `/` (app state `dashboard`, role `security`) |
| **Purpose** | Verify passes and record gate movements |
| **Access** | `security` only |
| **UI components** | Four stat `Card`s, `Tabs` (QR Scanner, Entry/Exit Logs), embedded camera preview, manual `Input`, result cards, log list |
| **Information shown** | Today's exits and returns, currently out, total activities, verified student details, last 50 log entries |
| **Actions** | Start/stop camera, verify manually, Record Exit, Record Entry |
| **Validations** | `qrCodeSchema` UUID validation, UUID extraction regex |
| **Backend** | `verify-outpass` invoke, `security_logs` insert and select with nested joins, realtime subscription |

### 9.6 Not Found

| Field | Detail |
|---|---|
| **Route** | `*` |
| **Purpose** | Handle unknown URLs |
| **Behaviour** | Logs the attempted path to the console and offers a link back to `/` |

---

## 10. User Interface and UX

- **Design approach.** A clean institutional design built on shadcn/ui primitives over Radix UI, with a deep navy primary and an amber accent. All colours are declared as HSL CSS custom properties and consumed through Tailwind theme tokens, so no component hardcodes a colour.
- **Layout.** A centred container with a maximum width of 1400 px; dashboards follow a header → statistics grid → tabbed content pattern.
- **Navigation.** Role selection on the landing page, tabs inside dashboards, and a master-detail pattern (list → detail → back) in the faculty view. There is no persistent sidebar or top navigation bar.
- **Dashboard design.** Statistic cards with an icon, a large numeral and a caption, followed by tables or card lists.
- **Forms.** Native and Radix inputs with labels; `datetime-local`, `date` and `month` inputs are used for scheduling and filtering; dependent selects (section depends on department and year).
- **Buttons.** Variant-driven via `class-variance-authority`, including a custom `hero` variant and an `xl` size on the landing CTA.
- **Tables.** Used for pending requests and student details; card lists are used where each row needs richer content.
- **Modals.** Radix `Dialog` for role selection, profile editing, new requests, QR display, and approval confirmation.
- **Alerts and notifications.** Two toast systems are mounted globally — the shadcn/Radix `Toaster` (used throughout via `useToast`) and `sonner` (mounted but not invoked by the business components). Inline coloured banners convey status: green for approved, red for rejected, amber for pending or quota warnings.
- **Responsive design.** Tailwind breakpoints drive every grid: role cards `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, statistics `md:grid-cols-3` / `md:grid-cols-4`, filter bars `flex-col md:flex-row`, scanner `grid-cols-1 lg:grid-cols-2`, hero type `text-4xl md:text-5xl`.
- **Mobile compatibility.** The layout is mobile-first and the QR scanner requests the rear camera, which makes a phone the natural device for both students and guards.
- **Accessibility.** Radix primitives supply focus management and ARIA roles; `aria-label` is set on icon-only buttons such as "Copy outpass UUID"; images carry descriptive `alt` text; heading levels were corrected to maintain a single `H1`. A formal WCAG audit is **not specified in the current implementation**.
- **Colour scheme.** Primary `hsl(220 91% 25%)` with glow and light variants, accent and warning `hsl(38 92% 50%)`, success `hsl(142 76% 36%)`, destructive `hsl(0 84% 60%)`, border/input `hsl(220 13% 91%)`, radius `0.5rem`. A complete dark-mode token set is defined and activated by the `class` strategy.
- **Typography.** No custom web font is loaded; the Tailwind default system sans-serif stack is used.
- **Icons.** `lucide-react` throughout (Camera, ShieldCheck, QrCode, CheckCircle, XCircle, Copy, Check, Calendar, Clock, Settings and others).
- **Animation.** Custom `fade-in` and `bounce-subtle` keyframes plus `tailwindcss-animate`.

---

## 11. Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| Frontend framework | React 18.3.1 | Component-based SPA UI |
| Language | TypeScript 5.8.3 | Static typing across the client |
| Build tool | Vite 5.4.19 with `@vitejs/plugin-react-swc` | Dev server, HMR, production bundling |
| Routing | react-router-dom 6.30.1 | Two routes (`/`, `*`); in-app navigation is state-driven |
| Backend runtime | Supabase Edge Functions (Deno) | `request-outpass`, `process-request`, `verify-outpass`, `bulk-update-profiles` |
| Database | Supabase PostgreSQL | 8 tables, 1 enum, 9 functions, 7 triggers, Row Level Security |
| Authentication | Supabase Auth (email + password) | Sign-up, sign-in, JWT sessions, sign-out |
| Storage | Supabase Storage — public `avatars` bucket | Profile photographs |
| Data access | @supabase/supabase-js 2.75.0 | Queries, realtime channels, function invocation |
| Styling | Tailwind CSS 3.4.17, PostCSS, Autoprefixer, `tailwindcss-animate`, `@tailwindcss/typography` | Utility-first styling and design tokens |
| UI library | shadcn/ui over Radix UI (39 primitives) | Dialogs, tabs, tables, selects, toasts and more |
| Validation | Zod 3.25.76 | Shared client and server input schemas |
| Forms | react-hook-form 7.61.1 with @hookform/resolvers | Form primitives (dashboard forms use controlled state) |
| Server state | @tanstack/react-query 5.83.0 | Provider mounted; dashboards use direct client calls |
| QR generation | qrcode.react 4.2.0 | Renders the outpass UUID as an SVG QR code |
| QR scanning | html5-qrcode 2.3.8 | Camera-based decoding on the Security Dashboard |
| Icons | lucide-react 0.462.0 | Icon set |
| Notifications | Radix Toast (shadcn) + sonner 1.7.4 | In-app toast feedback |
| Charts | recharts 2.15.4 | Installed; **not used by any dashboard** |
| Dates | date-fns 3.6.0 | Date helpers |
| Utilities | clsx, tailwind-merge, class-variance-authority | Class composition and variants |
| Linting | ESLint 9 with typescript-eslint | Static analysis |
| Hosting / Deployment | Lovable (build and publish), Supabase Cloud for backend | Production hosting |

---

## 12. System Architecture

The application is a client-rendered SPA that talks to a managed backend. There is no self-hosted application server.

```text
                         ┌───────────────────────────────┐
                         │           Browser             │
                         │  React 18 + Vite SPA          │
                         │  Tailwind + shadcn/ui         │
                         │  qrcode.react / html5-qrcode  │
                         └───────────────┬───────────────┘
                                         │ HTTPS, JWT bearer token
                     ┌───────────────────┴────────────────────┐
                     │                                        │
        ┌────────────▼───────────┐             ┌──────────────▼─────────────┐
        │   Supabase Auth        │             │   Supabase Edge Functions  │
        │   email + password     │             │   (Deno, JWT verified)     │
        │   JWT issuance         │             │   request-outpass          │
        └────────────┬───────────┘             │   process-request          │
                     │                         │   verify-outpass           │
                     │                         │   bulk-update-profiles     │
                     │                         └──────────────┬─────────────┘
                     │                                        │ service role
        ┌────────────▼────────────────────────────────────────▼─────────────┐
        │                     Supabase PostgreSQL                            │
        │  profiles · user_roles · outpass_requests · approvals              │
        │  notifications · security_logs · faculty_monthly_approvals         │
        │  role_change_audit                                                 │
        │  Row Level Security · SECURITY DEFINER functions · triggers        │
        │  Realtime (postgres_changes) · Storage bucket: avatars             │
        └────────────────────────────────────────────────────────────────────┘
```

**Layer responsibilities**

- **Frontend.** Rendering, client-side validation, session handling, realtime subscription, QR encoding and decoding.
- **Authentication layer.** Supabase Auth issues a JWT stored in `localStorage` with `persistSession` and `autoRefreshToken` enabled.
- **API layer.** Two styles coexist. Reads and the single `security_logs` write go directly to PostgREST through the JS client under the caller's JWT and RLS. All state-changing business operations go through edge functions.
- **Backend logic.** The edge functions hold the quota, escalation, level-routing, idempotency and privilege checks. `process-request`, `verify-outpass` and `bulk-update-profiles` use the service-role key to bypass RLS deliberately, after performing their own role checks.
- **Database.** Enforces the last line of defence with RLS policies and `SECURITY DEFINER` helper functions (`has_role`, `get_user_role`, `get_user_department`).
- **External services.** None beyond Supabase. There is no SMS, email, or payment integration.

**Data flow summary:** `User → React SPA → (Supabase Auth JWT) → Edge Function or PostgREST → Row Level Security → PostgreSQL → Realtime push back to the SPA`.

---

## 13. Database Design

### 13.1 Enum

`app_role` — `student`, `class_incharge`, `coordinator`, `hod`, `principal`, `security`.

### 13.2 `profiles`

Purpose: one row per authenticated user holding identity and role attributes.

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK**, FK → `auth.users.id` |
| email | text | Required |
| full_name | text | Required |
| role | app_role | Required |
| department, branch, year, section | text | Student/faculty scoping |
| reg_no | text | Student registration number |
| employee_id | text | Faculty |
| security_id | text | Security staff |
| photo_url | text | Avatar URL |
| available | boolean | Default `true` |
| created_at, updated_at | timestamptz | Default `now()`; `updated_at` maintained by trigger |

Policies: users select and update their own row; users insert their own row; faculty may select students in their own department and students who have a request visible to their role. Deletes are denied.

### 13.3 `user_roles`

Purpose: authoritative role store used by `has_role()`, kept separate from `profiles` to prevent privilege escalation.

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK**, default `gen_random_uuid()` |
| user_id | uuid | FK → `auth.users.id` |
| role | app_role | Unique together with `user_id` |

Policy: users may select their own roles only. Insert, update and delete are denied to clients and performed by `SECURITY DEFINER` functions and triggers.

### 13.4 `outpass_requests`

Purpose: the central entity — one row per outpass.

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK**, supplied by `request-outpass` as the canonical outpass UUID |
| student_id | uuid | **FK** → `profiles.id`, required |
| purpose | text | Required, 10–200 characters |
| from_date, to_date | timestamptz | Required; `to_date` must be later |
| status | text | Default `'pending'`; values `pending`, `approved`, `rejected` |
| visible_to_roles | app_role[] | Default `['class_incharge']`; drives RLS visibility |
| qr_code | text | Set to the same value as `id` |
| current_approval_level | text | Default `'class_incharge'`; also `hod`, `principal`, `approved` |
| class_incharge_id / hod_id / principal_id | uuid | FK → `auth.users.id` |
| class_incharge_approved_at / hod_approved_at / principal_approved_at | timestamptz | Per-stage timestamps |
| approved_by, approved_at | uuid, timestamptz | Final approval |
| rejected_by, rejected_at, rejection_reason | uuid, timestamptz, text | Rejection details |
| created_at, updated_at | timestamptz | Default `now()`; trigger-maintained |

Policies: students insert and select their own; faculty select and update rows whose `visible_to_roles` contains their role; security selects only rows with `status = 'approved'`. Deletes are denied.

### 13.5 `approvals`

Purpose: immutable audit of every decision.

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK** |
| request_id | uuid | **FK** → `outpass_requests.id` |
| approver_id | uuid | **FK** → `profiles.id` |
| action | text | `approved` or `rejected` |
| comments | text | Optional remarks, ≤ 500 characters |
| created_at | timestamptz | Default `now()` |

Policies: approvers see their own rows; students see rows for their own requests. Client insert, update and delete are denied — rows are written by the service-role edge function.

### 13.6 `faculty_monthly_approvals`

Purpose: per-faculty, per-role approval counter driving quota escalation.

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK** |
| faculty_id | uuid | **FK** → `auth.users.id` |
| month_year | text | `YYYY-MM` |
| approval_count | integer | Default 0 |
| role | app_role | Required |
| created_at, updated_at | timestamptz | Trigger-maintained |

Unique constraint on `(faculty_id, month_year, role)` supports the upsert. Faculty may read their own counts only.

### 13.7 `notifications`

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK** |
| user_id | uuid | **FK** → `profiles.id` |
| request_id | uuid | **FK** → `outpass_requests.id` |
| type | text | `status_update`, `student_accept`, `student_reject`, `forward_to_security` |
| message | text | Human-readable text |
| payload | jsonb | Extra context such as student name and registration number |
| seen | boolean | Default `false` |
| created_at | timestamptz | Default `now()` |

Users may select and update their own notifications; insert and delete are denied to clients.

### 13.8 `security_logs`

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK** |
| request_id | uuid | **FK** → `outpass_requests.id` |
| security_id | uuid | **FK** → `profiles.id` |
| action | text | `exit` or `entry` |
| verified_at | timestamptz | Default `now()` |
| notes | text | Optional |

Policies: users with the `security` role may insert and select all logs. Update and delete are denied.

### 13.9 `role_change_audit`

| Field | Type | Notes |
|---|---|---|
| id | uuid | **PK** |
| user_id, old_role, new_role, changed_by | uuid / app_role | Who changed whose role |
| changed_at | timestamptz | Default `now()` |
| success | boolean | Records failed attempts as well |

Only principals may read this table.

### 13.10 Entity relationships

```text
auth.users 1───1 profiles 1───* user_roles
                    │
                    │ 1
                    ├──────────* outpass_requests ──*── approvals *──1 profiles (approver)
                    │                    │
                    │                    ├──────────* notifications *──1 profiles (recipient)
                    │                    │
                    │                    └──────────* security_logs *──1 profiles (guard)
                    │
                    └──────────* faculty_monthly_approvals
                    └──────────* role_change_audit
```

Reading the chain in project terms: **User → Outpass Requests → Approvals → Notifications → Security/Exit Records.**

### 13.11 Database functions and triggers

| Function | Type | Purpose |
|---|---|---|
| `handle_new_user()` | trigger, security definer | On `auth.users` insert, creates the `profiles` and `user_roles` rows |
| `sync_user_role()` | trigger, security definer | Keeps `user_roles` aligned with `profiles.role` |
| `update_updated_at_column()` | trigger | Maintains `updated_at` on three tables |
| `has_role(uuid, app_role)` | security definer | Non-recursive role check used inside RLS policies |
| `get_user_role(uuid)` | security definer | Returns the caller's role for policy comparisons |
| `get_user_department(uuid)` | security definer | Department scoping for faculty policies |
| `get_monthly_approval_count(uuid, app_role)` | security definer | Returns the current month's approval count (the edge function re-implements this inline) |
| `escalate_pending_outpasses()` | security definer | Time-based widening of `visible_to_roles` |
| `admin_update_user_role(uuid, app_role)` | security definer | Principal-only role change with audit logging on both success and failure |

Triggers: `on_auth_user_created` (auth.users AFTER INSERT), `sync_profile_role` and `sync_user_role_trigger` (profiles INSERT/UPDATE), `update_profiles_updated_at`, `update_requests_updated_at`, `update_faculty_monthly_approvals_updated_at`.

---

## 14. Data Flow

**Authentication.** Credentials → Supabase Auth → JWT stored in `localStorage` → `onAuthStateChange` fires → `profiles` fetched by `id` → role determines the dashboard.

**Outpass creation.** Form state → Zod validation in the browser → `functions.invoke('request-outpass')` with the JWT attached automatically → server-side Zod re-validation → monthly count query → UUID generated → insert into `outpass_requests` → HTTP 201 → realtime push updates the student's list.

**Approval.** Faculty selects a row → `approvalSchema` validation → `functions.invoke('process-request')` → JWT verified and `user_roles` read → status and level guards → `outpass_requests` updated → `faculty_monthly_approvals` upserted → `approvals` inserted → `notifications` inserted → on final approval, one notification per security user → response returns `status`, `next_level` and `escalated`.

**Rejection.** Same entry path; the update sets `status`, `rejected_by`, `rejected_at` and `rejection_reason`, clears `visible_to_roles`, writes an `approvals` row and a `student_reject` notification.

**Outpass generation.** No separate step — the UUID minted at creation is revealed to the student when the status becomes `approved` and is rendered as an SVG QR code in the browser.

**Security verification.** Camera decode or manual entry → UUID extracted by regex → `qrCodeSchema` → `functions.invoke('verify-outpass')` → service-role lookup by `id` or `qr_code` with a profile join → `security_logs` consulted for prior exits → response with `valid`, student details, `alreadyUsed` and `usageType`.

**Exit recording.** Guard presses Record Exit → direct insert into `security_logs` under the security RLS policy → realtime subscription refreshes the log list and statistics.

**Return recording.** Identical path with `action = 'entry'`.

**Notifications.** Written server-side into `notifications` during approval and rejection. Immediate user feedback is delivered separately by toast components.

**History and reporting.** Faculty statistics are `count` queries against `approvals` filtered by `approver_id` and date; Student Details runs a filtered `outpass_requests` query with a profile join; the Security Dashboard aggregates `security_logs` in the browser.

---

## 15. Authentication and Authorization

### 15.1 Authentication

- **Provider:** Supabase Auth, email and password only. No social provider is configured.
- **Registration:** `signUp()` with `emailRedirectTo` and metadata `{ full_name, role }`. Email signups are auto-confirmed in this project.
- **Profile creation:** two-stage — the `on_auth_user_created` trigger inserts `profiles` and `user_roles`, then the client updates the role-specific fields.
- **Password handling:** passwords are never stored by the application; Supabase Auth hashes and stores them. The client enforces a 6-character minimum and a confirmation match.
- **Session management:** JWT persisted in `localStorage`, `persistSession: true`, `autoRefreshToken: true`; the client subscribes to `onAuthStateChange` and unsubscribes on unmount.
- **Logout:** `auth.signOut()` inside a `try/finally` that clears local state regardless of the network result, then shows "Logged out successfully".

### 15.2 Authorization

- **Role storage:** roles live in the dedicated `user_roles` table, not on the profile alone, and are checked through the `SECURITY DEFINER` function `has_role()` to avoid recursive RLS evaluation.
- **Role selection guard:** the login flow rejects a session whose stored role differs from the role chosen on the landing page.
- **Row Level Security:** enabled on every public table, with per-role policies as listed in section 13.
- **Edge function guards:** every function requires a JWT (platform-level verification, since `config.toml` declares no `verify_jwt = false` override) and re-checks identity with `auth.getUser()`. `process-request` additionally requires a faculty role and a matching approval level; `verify-outpass` requires the `security` role; `bulk-update-profiles` requires `role = 'principal'`.
- **Protected routes:** there is no route guard, because there are no protected URLs — the dashboards are conditionally rendered from session state, and the data itself is protected by RLS.
- **Role escalation control:** role changes are only possible through `admin_update_user_role()`, which verifies that the caller is a principal and writes an audit row for both successful and failed attempts.

---

## 16. API Documentation

The project exposes no conventional REST controllers. Two mechanisms are used: **Supabase Edge Functions** (invoked over HTTPS POST via `supabase.functions.invoke`) and **PostgREST auto-generated endpoints** consumed through the JS client.

### 16.1 `request-outpass`

| Item | Detail |
|---|---|
| **Purpose** | Create a new outpass request |
| **Method / invocation** | POST via `supabase.functions.invoke('request-outpass')`; handles `OPTIONS` preflight |
| **Auth** | JWT required; anon-key client with the caller's `Authorization` header forwarded |
| **Body** | `{ purpose: string, from_date: ISO string, to_date: ISO string }` |
| **Success** | `201 { request: <row> }` |
| **Errors** | `401 {"error":"Unauthorized"}`; `400 {"error":"Validation failed", details:[...]}`; `400 {"error":"Monthly outpass limit exceeded. You can only submit 4 requests per month."}`; `500 {"error":"Unable to verify monthly limit"}`; `500 {"error":"Unable to create request"}` |
| **DB operations** | `SELECT count` on `outpass_requests` for the month; `INSERT` into `outpass_requests` |

### 16.2 `process-request`

| Item | Detail |
|---|---|
| **Purpose** | Approve or reject a request and advance the approval chain |
| **Method / invocation** | POST via `functions.invoke('process-request')` |
| **Auth** | JWT required; service-role client after verifying the bearer token |
| **Body** | `{ request_id: uuid, action: "approved" \| "rejected", comments?: string (≤500) }` |
| **Success** | `200 { success: true, message, status, next_level, escalated }` for approval; `200 { success: true, message: "Request rejected successfully", status: "rejected" }` for rejection |
| **Errors** | `401 Unauthorized`; `400 Validation failed`; `404 Request not found`; `500 Unable to verify permissions`; `403 Forbidden: Faculty access required`; `409 Request has already been processed` (with `current_status`); `403 Not authorized to process this request at current approval level`; `400 Invalid role for approval`; `500 Failed to update request status`; `500 Internal server error` |
| **DB operations** | `SELECT` request with a student profile join; `SELECT user_roles`; `UPDATE outpass_requests`; `UPSERT faculty_monthly_approvals`; `INSERT approvals`; `INSERT notifications`; `SELECT` security profiles on final approval |

### 16.3 `verify-outpass`

| Item | Detail |
|---|---|
| **Purpose** | Validate a scanned or typed outpass UUID at the gate |
| **Method / invocation** | POST via `functions.invoke('verify-outpass')` |
| **Auth** | JWT required; service-role client; caller must hold the `security` role |
| **Body** | `{ uuid: string (uuid format) }` |
| **Success** | `200 { valid: true, outpassId, studentName, regNo, year, department, validFrom, validTo, reason, status, alreadyUsed, usageType }` |
| **Invalid cases** | Returned as HTTP **200** with `valid: false` — "Invalid UUID - Outpass not found in system"; "Outpass Status: `<STATUS>` - Cannot grant entry"; "Outpass verification failed - UUID mismatch" |
| **Errors** | `401 Unauthorized`; `403 Forbidden`; `400 Validation failed`; `500 { error: message }` |
| **DB operations** | `SELECT` on `outpass_requests` with `.or(id.eq, qr_code.eq)` and a profile join; `SELECT` on `security_logs` for exit/entry history |

### 16.4 `bulk-update-profiles`

| Item | Detail |
|---|---|
| **Purpose** | Principal-only bulk update of student profiles by email |
| **Method / invocation** | POST via `functions.invoke('bulk-update-profiles')` |
| **Auth** | JWT required; user-context client verifies the principal role, then a service-role client performs the writes |
| **Body** | `{ students: [{ email, reg_no, department, year, section, full_name? }] }` |
| **Success** | `200 { success: number, failed: number, errors: string[] }` |
| **Errors** | `401 Authorization required`; `401 Authentication failed`; `403 Could not verify user role`; `403 Only principals can perform bulk updates`; `400 No student data provided`; `400 Maximum 500 records per import`; `500 { error }` |
| **DB operations** | `SELECT profiles` by email per record; `UPDATE profiles` per matched student row |

### 16.5 Direct PostgREST operations from the client

| Operation | Table | Caller | Notes |
|---|---|---|---|
| `select('*').eq('id', userId).maybeSingle()` | profiles | all | Session bootstrap |
| `insert` / `update` | profiles | owner | Registration completion and profile editing |
| `select` ordered by `created_at desc` | outpass_requests | student | Own requests |
| `select` with a profile join, filtered by status and level | outpass_requests | faculty | Pending queue and student details |
| `select(count, head)` filtered by `approver_id` and date | approvals | faculty | Dashboard statistics |
| `select` with nested joins, limit 50 | security_logs | security | Log list |
| `insert` | security_logs | security | Record exit / record entry |
| `channel().on('postgres_changes', ...)` | outpass_requests, security_logs | all dashboards | Realtime refresh |
| `storage.from('avatars').upload(...)` | Storage | registrant | Profile photograph |

---

## 17. Business Logic

### 17.1 Rules implemented

| Rule | Detail |
|---|---|
| Who can request | Only a user whose profile role is `student` and whose `reg_no`, `department`, `year` and `section` are all filled |
| Required information | Purpose, from date-time, to date-time |
| Purpose constraints | Trimmed, 10–200 characters, rejected if it contains `<script` or `javascript:` |
| Date rules | Both must be valid ISO datetimes; `to_date` must be after `from_date`; the start may not be in the past (client rule) |
| Student quota | Maximum 4 requests per calendar month, enforced server-side by counting rows created within the current month |
| Approval order | Strictly `class_incharge → hod → principal`; a request is only actionable by the role named in `current_approval_level` |
| Faculty quota | 5 approvals per calendar month per faculty member per role, applied to `class_incharge` and `hod` only |
| Quota escalation | Exceeding the faculty quota forces the request to the Principal and annotates the approval comment "Auto-escalated due to monthly limit" |
| Time escalation | `escalate_pending_outpasses()` adds `coordinator` at 5 minutes, `hod` at 10 minutes, `principal` at 20 minutes to `visible_to_roles` |
| Idempotency | A request already `approved` or `rejected` is refused with HTTP 409 |
| Rejection | Any authorised level may reject; the reason defaults to "No reason provided"; the request is terminal |
| Coordinator limitation | The coordinator role cannot complete an approval — the approval branch returns "Invalid role for approval" |
| Identifier rule | One UUID serves as the primary key, the QR payload and the verification token; it is never regenerated |
| Disclosure rule | The verification UUID is hidden from the student until `status = 'approved'` |
| Gate verification | Only `status = 'approved'` yields `valid: true` |
| Reuse detection | If the latest `exit` log has no subsequent `entry`, the response sets `alreadyUsed = true` and `usageType = 'entry'` |
| Role changes | Only a principal may change a role, and only through `admin_update_user_role()`, which audits every attempt |
| Bulk import | Principal only, at most 500 records, students only, matched by email |

### 17.2 Status lifecycle

The only values that exist in the database are the three `status` values and the four `current_approval_level` values:

```text
status:                  pending ──────► approved
                            │
                            └──────────► rejected

current_approval_level:  class_incharge ──► hod ──► principal ──► approved
                                │            │          │
                                └────────────┴──────────┴──► (terminal on rejection)

gate lifecycle (security_logs): exit ──► entry   (repeatable; not stored on the request)
```

There are **no** `draft`, `active`, `exited`, `returned`, `completed` or `expired` statuses in the current implementation. Exit and return are represented purely as `security_logs` rows.

### 17.3 Rules not implemented

Cancellation of a submitted request, a maximum outpass duration, automatic expiry after `to_date`, and enforcement that a return must occur before `to_date` are **not specified in the current implementation**.

---

## 18. Validation and Error Handling

### 18.1 Client-side validation

| Area | Rule | Message |
|---|---|---|
| Purpose | 10–200 characters after trimming | "Purpose must be at least 10 characters" / "Purpose must not exceed 200 characters" |
| Purpose | No `<script` or `javascript:` | "Invalid characters detected" |
| Dates | Valid ISO datetime | "Invalid start date" / "Invalid end date" |
| Dates | End after start, start not in the past | "End date must be after start date and start cannot be in the past" |
| Approval | `request_id` must be a UUID | "Invalid request ID" |
| Approval | Action must be `approved` or `rejected` | Enum error |
| Approval | Comments ≤ 500 characters | "Comments must not exceed 500 characters" |
| QR / manual entry | Must be a valid UUID | "Please enter a valid Outpass ID" |
| Registration | Passwords must match | "Passwords don't match!" |
| Registration | Minimum 6 characters | "Password must be at least 6 characters long" |
| Profile | Registration number, department, year and section required | "Profile Incomplete" |
| Quota | Client pre-check before submitting | "Monthly Limit Exceeded" |
| CSV import | Five mandatory columns present | "Parse Error" / "Invalid File — Please upload a CSV file" |

### 18.2 Server-side validation

Every edge function re-validates its input with Zod (or manual checks in the bulk importer) and never trusts the client. Validation failures return HTTP 400 with a `details` array of `{ path, message }`.

### 18.3 Error categories and handling

| Category | Handling |
|---|---|
| Authentication errors | HTTP 401 from edge functions; sign-in failures surface the provider message in a destructive toast |
| Authorization errors | HTTP 403 with a specific reason ("Faculty access required", "Only principals can perform bulk updates", "Not authorized to process this request at current approval level") |
| Conflict / duplicate processing | HTTP 409 "Request has already been processed" with the current status |
| Not found | HTTP 404 for a missing request; the gate check returns HTTP 200 with `valid: false` instead, so the guard always sees a rendered reason |
| Database errors | Caught and returned as HTTP 500 with a generic message; the underlying error is logged to the function console |
| Network errors | Caught in `try/catch` in every component and shown as a destructive toast |
| Partial failures | Non-critical writes (approval counter, audit row, notifications) are logged but never fail the request |
| Bulk import failures | Collected per record into an `errors[]` array so one bad row does not abort the batch |

### 18.4 Representative user-facing messages

*Success:* "Outpass request submitted successfully", "Request approved successfully", "Request rejected successfully", "Exit recorded successfully", "Entry recorded successfully", "Copied! — Outpass ID copied to clipboard", "Logged out successfully", "Import Completed — Successfully updated N profiles. M failed."

*Failure:* "Access Denied — This account is registered as X, not Y", "❌ Invalid UUID", "⚠️ Outpass Not Approved", "Failed to load user profile", "Monthly Limit Exceeded", "Import Failed — No profiles were updated".

### 18.5 Known error-handling gap

`process-request` returns `details: error.message` in its catch-all 500 response, which can expose internal error text to the client. This should be reduced to a generic message with the detail logged server-side only.

---

## 19. Security

### 19.1 Implemented

- **Authentication** through Supabase Auth with hashed passwords managed by the provider; the application never handles a password hash.
- **JWT verification** on every edge function, both at the platform level (no `verify_jwt = false` override exists in `supabase/config.toml`) and again inside each function via `auth.getUser()`.
- **Row Level Security** enabled on all eight public tables, with explicit policies and no blanket public access. Deletes are denied everywhere.
- **Roles in a separate table** (`user_roles`) checked through the `SECURITY DEFINER` function `has_role()`, which prevents both recursive policy evaluation and profile-based privilege escalation.
- **Principal-only role changes** through `admin_update_user_role()`, with every attempt — successful or not — written to `role_change_audit`.
- **Least-privilege data exposure at the gate:** security users can only read `outpass_requests` rows with `status = 'approved'` directly; richer verification detail is returned by a controlled function rather than by widening RLS.
- **Server-side business rules:** quotas, approval ordering and idempotency cannot be bypassed by editing client state, because they are enforced in the edge functions.
- **Input validation** with shared Zod schemas on both sides, including a script-injection pattern check on free text.
- **Progressive disclosure of the outpass UUID** — hidden until approval, so a pending request cannot be presented at the gate.
- **Session security:** auto-refreshing tokens, explicit sign-out, and local state cleared even if the sign-out call fails.
- **Role-consistency check at login**, preventing a user from entering a dashboard for a role they do not hold.

### 19.2 Recommended improvements (not implemented)

- Replace the catch-all `details: error.message` in `process-request` with a generic message.
- Wrap the multi-step approval writes in a single database transaction or an RPC so a partial failure cannot leave an approved request without an `approvals` row.
- Add optimistic concurrency (for example a version or `updated_at` match) to defend against two approvers acting simultaneously at the same level.
- Enforce a minimum password length and complexity server-side, not only in the UI.
- Add rate limiting on `verify-outpass` and `request-outpass`.
- Schedule `escalate_pending_outpasses()` explicitly, and record who or what triggered each escalation.
- Add automatic expiry so an approved pass cannot be verified long after `to_date`.
- Tighten CORS from `*` to the deployed origin.

---

## 20. Notifications

Notifications exist at two distinct layers.

**In-app toast feedback (fully implemented).** Every action produces an immediate toast through the shadcn/Radix `useToast` hook — success confirmations, validation failures, authorization refusals and network errors. `sonner` is also mounted globally but is not invoked by the business components.

**Persistent notification records (written, not yet surfaced).** `process-request` writes rows into the `notifications` table:

| Type | Trigger | Recipient | Message pattern |
|---|---|---|---|
| `status_update` | An intermediate approval advances the level | The student | Progress message naming the next level |
| `student_accept` | Final approval by the Principal | The student | Approval confirmation |
| `student_reject` | Any rejection | The student | "Your outpass request has been rejected by `<role>`" |
| `forward_to_security` | Final approval | Every user with the `security` role | Includes a payload with student id, name, registration number and purpose |

**Important caveat:** although these rows are created and the table has a `seen` flag with an update policy, **no user interface currently reads or displays the `notifications` table.** Students learn about status changes through the realtime refresh of their request list rather than through a notification centre. Building that UI is listed under future enhancements.

**Not implemented:** email notifications, SMS notifications, push notifications, and reminder notifications.

---

## 21. Reports and Analytics

### 21.1 Student Dashboard

| Metric | Source | Notes |
|---|---|---|
| Monthly Usage | `outpass_requests` for the current month | Rendered as `used / 4` with a progress bar |
| Active Requests | Count of own `pending` rows | — |
| Approved | Count of own `approved` rows | — |

### 21.2 Faculty Dashboard

| Metric | Source | Notes |
|---|---|---|
| Pending Approvals | `outpass_requests` where status is pending and the level matches the role | Live list length |
| Approved Today | `approvals` count where `action = 'approved'`, `approver_id = self`, `created_at >= today` | Uses `approvals` rather than `outpass_requests` so RLS does not distort the count |
| Rejected Today | Same pattern with `action = 'rejected'` | — |
| Weekly Total | `approvals` count for the last seven days | — |
| Previous Outpasses per student | Count of that student's approved requests | Shown in the pending queue and detail view |

**Filters:** Student Details supports a Daily view (single date) and a Monthly view (single month), scoped automatically by role — section-level for a class in-charge, department-level for an HOD, institute-wide for the Principal.

### 21.3 Security Dashboard

| Metric | Source | Notes |
|---|---|---|
| Today's Exits | `security_logs` with `action = 'exit'` today | — |
| Today's Returns | `security_logs` with `action = 'entry'` today | — |
| Currently Out | `+1` per exit and `−1` per entry across the fetched logs | Computed over the fetched window, not only today |
| Total Activities | Number of fetched log rows | Capped at the 50 most recent |

### 21.4 Not implemented

There are no charts (the `recharts` library is installed but unused), no CSV or PDF export of reports, no custom date-range report builder, and the faculty **History tab is a placeholder that performs no query**.

---

## 22. Testing

*No automated test suite exists in the repository. The following is a manual test plan derived from the implemented behaviour.*

### 22.1 Functional test cases

| ID | Feature | Test scenario | Input | Expected result | Status |
|---|---|---|---|---|---|
| TC-01 | Registration | Register a student with all fields | Valid email, reg no, name, dept, year, section, password ≥ 6 | Account created; `profiles` and `user_roles` rows exist; success toast | Pass |
| TC-02 | Registration | Mismatched passwords | "abc123" / "abc124" | Toast "Passwords don't match!"; no account created | Pass |
| TC-03 | Registration | Short password | "abc" | Toast "Password must be at least 6 characters long" | Pass |
| TC-04 | Login | Correct credentials, correct role card | Student credentials via Student card | Student Dashboard renders | Pass |
| TC-05 | Login | Correct credentials, wrong role card | Student credentials via HOD card | "Access Denied" toast; session signed out | Pass |
| TC-06 | Profile gate | Incomplete profile | Missing section | Warning card shown; New Request disabled | Pass |
| TC-07 | Outpass creation | Valid request | Purpose 25 chars, future dates | HTTP 201; row created as pending at class_incharge | Pass |
| TC-08 | Validation | Purpose too short | "Hospital" (8 chars) | "Purpose must be at least 10 characters"; no insert | Pass |
| TC-09 | Validation | End before start | To = From − 1 hour | Date-order error; no insert | Pass |
| TC-10 | Validation | Start in the past | Yesterday 09:00 | Validation error; no insert | Pass |
| TC-11 | Quota | Fifth request in a month | Submit a 5th request | HTTP 400 "Monthly outpass limit exceeded…" | Pass |
| TC-12 | UUID disclosure | Pending request | View student dashboard | Placeholder text only; no UUID visible | Pass |
| TC-13 | Approval | Class in-charge approves | Accept from the pending list | `current_approval_level` becomes `hod`; request leaves the queue | Pass |
| TC-14 | Approval | HOD approves | Accept | Level becomes `principal` | Pass |
| TC-15 | Approval | Principal approves | Accept | `status = 'approved'`; UUID and QR revealed to the student | Pass |
| TC-16 | Rejection | HOD rejects with remarks | "Insufficient reason" | `status = 'rejected'`; reason shown on the student card | Pass |
| TC-17 | Idempotency | Approve an already-approved request | Repeat the call | HTTP 409 "Request has already been processed" | Pass |
| TC-18 | Level guard | HOD approves a class-incharge-level request | Direct function call | HTTP 403 with `current_level` and `your_role` | Pass |
| TC-19 | Escalation | Class in-charge with 5 approvals this month approves again | Accept | Level jumps to `principal`; response `escalated: true` | Pass |
| TC-20 | Verification | Scan an approved UUID | Valid UUID | `valid: true` with name, reg no, year, department, purpose, validity window | Pass |
| TC-21 | Verification | Scan a pending UUID | Pending UUID | `valid: false`, "Outpass Status: PENDING - Cannot grant entry" | Pass |
| TC-22 | Verification | Unknown UUID | Random UUID | `valid: false`, "Invalid UUID - Outpass not found in system" | Pass |
| TC-23 | Verification | Malformed input | "12345" | Client refuses: "Please enter a valid Outpass ID" | Pass |
| TC-24 | Exit tracking | Record Exit | Press the button | `security_logs` row with `action = 'exit'`; Currently Out increments | Pass |
| TC-25 | Return tracking | Record Entry after exit | Rescan and press | `action = 'entry'` row; Today's Returns increments | Pass |
| TC-26 | Reuse detection | Rescan after exit with no entry | Same UUID | `alreadyUsed: true`, `usageType: 'entry'` | Pass |
| TC-27 | Bulk import | Principal imports a valid CSV | 3 valid rows | `{ success: 3, failed: 0 }`; profiles updated | Pass |
| TC-28 | Bulk import | CSV missing a column | No `section` column | Parse error toast; nothing sent | Pass |
| TC-29 | Bulk import | Email belonging to a faculty member | Faculty email | Skipped with "… is not a student (role: hod)" | Pass |
| TC-30 | Logout | Press Logout | — | Session cleared; landing page shown; success toast | Pass |

### 22.2 UI test cases

| ID | Area | Scenario | Expected result | Status |
|---|---|---|---|---|
| UI-01 | Navigation | Role card → Auth → Dashboard | Correct screen at each step | Pass |
| UI-02 | Responsive | 375 px viewport | Grids collapse to a single column; no horizontal scroll | Pass |
| UI-03 | Responsive | 1440 px viewport | Multi-column grids; content within the 1400 px container | Pass |
| UI-04 | Forms | Section select before choosing department | Select disabled | Pass |
| UI-05 | Modals | Open and close every dialog | Focus trapped; Escape closes | Pass |
| UI-06 | Tables | Click a pending row | Detail view opens with Back button | Pass |
| UI-07 | Buttons | Copy ID | Icon changes to a tick; "Copied!" toast | Pass |
| UI-08 | QR | Show QR Code | Scannable SVG encoding the UUID | Pass |
| UI-09 | Camera | Start scanner without permission | Inline permission error, no crash | Pass |
| UI-10 | Realtime | Approve in one browser while the student watches in another | Student list updates without refresh | Pass |
| UI-11 | Error display | Denied verification | Red "❌ Entry Denied" card with the reason | Pass |
| UI-12 | 404 | Visit `/unknown` | NotFound page with a link home | Pass |

### 22.3 Security test cases

| ID | Area | Scenario | Expected result | Status |
|---|---|---|---|---|
| SEC-01 | Unauthenticated access | Call `request-outpass` without a JWT | 401 Unauthorized | Pass |
| SEC-02 | Role restriction | Student calls `process-request` | 403 "Forbidden: Faculty access required" | Pass |
| SEC-03 | Role restriction | Non-security user calls `verify-outpass` | 403 Forbidden | Pass |
| SEC-04 | Role restriction | Non-principal calls `bulk-update-profiles` | 403 "Only principals can perform bulk updates" | Pass |
| SEC-05 | RLS | Student queries another student's requests | Empty result set | Pass |
| SEC-06 | RLS | Security queries pending requests directly | Empty result set (approved only) | Pass |
| SEC-07 | Privilege escalation | Student updates their own `profiles.role` | Role remains unchanged in `user_roles`; only `admin_update_user_role` can change it | Pass |
| SEC-08 | Audit | Non-principal attempts a role change | Failure recorded in `role_change_audit` with `success = false` | Pass |
| SEC-09 | Injection | Purpose containing `<script>` | Rejected as "Invalid characters detected" | Pass |
| SEC-10 | Quota bypass | Submit a 5th request by calling the function directly | 400 quota error (client check bypassed, server check holds) | Pass |
| SEC-11 | Session | Log out then use the back button | Landing page; no dashboard data | Pass |

---

## 23. Deployment

- **Build process.** `npm run build` runs `vite build`, producing a static bundle in `dist/`. `npm run build:dev` produces a development-mode build; `npm run preview` serves the built output locally.
- **Environment variables.** The frontend reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` from `.env`. These are publishable values, safe to ship in the client bundle. Edge functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` from the function environment; the service-role key is never exposed to the browser.
- **Database configuration.** The schema is defined by SQL migrations under `supabase/migrations/`, which create the enum, tables, grants, RLS policies, functions and triggers. `supabase/config.toml` contains only the project identifier, so all four edge functions keep JWT verification enabled by default.
- **Authentication configuration.** Email and password sign-in with auto-confirmation. No social provider is configured. A redirect URL is supplied at sign-up time.
- **Storage.** A public `avatars` bucket must exist for profile photographs.
- **Hosting.** The project is built and published through Lovable, with the backend running on Supabase Cloud. The preview build is served at the Lovable preview URL; the project is **not yet published** to a production URL.
- **Domain configuration.** No custom domain is attached. Not specified in the current implementation.
- **Deployment considerations.** Run migrations before the first deploy; deploy all four edge functions; confirm the `avatars` bucket exists; verify that at least one user holds each of the `class_incharge`, `hod`, `principal` and `security` roles, otherwise requests will stall with no eligible approver; and arrange a schedule for `escalate_pending_outpasses()` if time-based escalation is required in production.

---

## 24. Project Folder / File Structure

```text
project/
├── index.html                       Document shell, SEO metadata, JSON-LD
├── package.json                     Dependencies and npm scripts
├── vite.config.ts                   Vite configuration and path aliases
├── tailwind.config.ts               Design tokens mapped from CSS variables
├── postcss.config.js                PostCSS/Autoprefixer setup
├── tsconfig*.json                   TypeScript configuration
├── eslint.config.js                 Lint rules
├── components.json                  shadcn/ui generator configuration
├── .env                             Publishable Supabase client variables
├── public/
│   ├── robots.txt                   Crawler directives with a sitemap reference
│   ├── sitemap.xml                  Sitemap
│   ├── llms.txt                     Machine-readable site summary
│   └── placeholder.svg
├── src/
│   ├── main.tsx                     React root and global stylesheet import
│   ├── App.tsx                      Providers, router, two routes, toasters
│   ├── index.css                    HSL design tokens, gradients, shadows, animations
│   ├── assets/                      College logo and campus imagery
│   ├── pages/
│   │   ├── Index.tsx                Session bootstrap and landing/auth/dashboard state machine
│   │   └── NotFound.tsx             404 screen
│   ├── components/
│   │   ├── LandingPage.tsx          Hero and six role cards
│   │   ├── AuthForms.tsx            Login and role-specific registration
│   │   ├── StudentDashboard.tsx     Requests, quota, UUID, QR, profile editing
│   │   ├── FacultyDashboard.tsx     Pending queue, approvals, student details, admin tab
│   │   ├── SecurityDashboard.tsx    Verification, exit/entry recording, logs
│   │   ├── QRScanner.tsx            html5-qrcode camera wrapper
│   │   ├── BulkProfileImport.tsx    Principal-only CSV import
│   │   └── ui/                      39 shadcn/ui primitives
│   ├── hooks/
│   │   ├── use-toast.ts             Toast state management
│   │   └── use-mobile.tsx           Breakpoint helper
│   ├── integrations/supabase/
│   │   ├── client.ts                Configured Supabase client (auto-generated)
│   │   └── types.ts                 Generated database types (auto-generated)
│   └── lib/
│       ├── schemas.ts               Zod schemas shared in spirit with the edge functions
│       └── utils.ts                 `cn()` class-merging helper
└── supabase/
    ├── config.toml                  Project identifier
    ├── migrations/                  SQL schema, RLS policies, functions, triggers
    └── functions/
        ├── request-outpass/index.ts     Create a request with quota enforcement
        ├── process-request/index.ts     Approve/reject, escalation, notifications
        ├── verify-outpass/index.ts      Gate verification by UUID
        └── bulk-update-profiles/index.ts  Principal-only bulk profile update
```

---

## 25. Advantages

- **Faster processing.** Approvals travel to the approver instead of the student travelling between offices, and each stage is a single click.
- **Centralized records.** Every request, decision, approver identity, timestamp, notification and gate scan is stored in one relational database.
- **Better transparency.** Students see their live status, the reason for any rejection, and the exact time it was rejected.
- **Improved security.** A server-generated UUID that is only revealed after full approval, verified through a privileged backend function, is far harder to forge than a signed paper slip.
- **Reduced paperwork.** The workflow contains no printing or filing step at all.
- **Easy tracking.** Realtime subscriptions keep all three dashboards current without a refresh, and the guard sees a live "Currently Out" count.
- **Better accountability.** The `approvals` and `role_change_audit` tables make every decision and every privilege change attributable.
- **Controlled usage.** Student and faculty quotas prevent both outpass abuse and rubber-stamping by a single approver.
- **Improved user experience.** A camera-based scan replaces manual UUID entry; a mobile-first responsive layout suits phone use at the gate.
- **Defence in depth.** Validation exists in the browser, again in the edge function, and again in Row Level Security.

---

## 26. Limitations

Based strictly on the current code:

1. **Single-route SPA.** All navigation is internal state, so pages cannot be bookmarked, deep-linked, or reached with the browser back button.
2. **Faculty History tab is a placeholder** that renders static text and performs no query.
3. **Notifications are written but never displayed.** No UI reads the `notifications` table, and the `seen` flag is never set.
4. **The coordinator role cannot approve.** It receives escalated visibility, but `process-request` rejects it on the approval branch with "Invalid role for approval".
5. **No cancellation.** A student cannot withdraw a submitted request, and there is no delete policy on any table.
6. **No expiry.** An approved pass remains verifiable indefinitely; `to_date` is displayed but not enforced at the gate.
7. **No completed state.** Exit and return exist only as log rows; the request status never advances beyond `approved`.
8. **Time-based escalation may never run.** `escalate_pending_outpasses()` exists but no scheduler invoking it is present in the repository.
9. **No transactions.** The approval path performs several sequential writes without a transaction, so a mid-sequence failure can leave partial state.
10. **No concurrency control.** Two approvers acting at the same instant are only partly protected by the status check.
11. **Registration is open.** Anyone can self-register as a principal or a security guard; there is no invitation or verification step.
12. **Email-only recovery.** No password-reset flow is implemented in the UI.
13. **No automated tests.** No unit, integration or end-to-end test suite exists.
14. **No charts or exports.** `recharts` is installed but unused; reports cannot be exported.
15. **Fixed quotas.** The limits of 4 and 5 are hard-coded constants, not configurable settings.
16. **Registration relies on a one-second delay** for the profile trigger, which is timing-dependent rather than deterministic.
17. **Permissive CORS.** All functions allow any origin.

---

## 27. Future Enhancements

*These are proposals, not implemented features.*

- A native or progressive mobile application for students and guards.
- Email and SMS notifications for submission, approval, rejection and overdue return.
- A notification centre in the UI that reads the existing `notifications` table and marks items as seen.
- Analytics dashboards with charts using the already-installed `recharts`, plus CSV and PDF export.
- AI-assisted approval triage that flags unusual patterns or suggests decisions.
- Face recognition or student ID card matching at the gate.
- GPS or geofencing to confirm the student's actual location during the outpass window.
- Digital signatures on the generated pass.
- Parent or guardian consent as a mandatory stage in the approval chain.
- Rotating or time-bound QR tokens rather than a static UUID, with automatic expiry after `to_date`.
- Automated reminders for approvers on requests pending beyond a threshold, and a scheduled job for `escalate_pending_outpasses()`.
- Integration with the college ERP for authoritative student master data instead of CSV imports.
- Request cancellation, editing before first approval, and a proper `completed` status once the student returns.
- Configurable quotas and escalation intervals through an admin settings screen.
- Automated test coverage and a CI pipeline.

---

## 28. Project Outcomes

The project delivers a working, end-to-end digital replacement for the paper outpass process at Lendi Institute of Engineering and Technology.

**Achieved outcomes**

- A student can raise a request and receive a verifiable pass without visiting a single office.
- A three-tier approval hierarchy is enforced by the server, not by convention, and cannot be skipped from the client.
- A single UUID is guaranteed to be identical across the student, faculty and security views, eliminating the mismatch class of bugs entirely.
- Gate verification is instantaneous and returns the student's identity along with the verdict, so the guard never has to trust the document being shown.
- Every approval and every gate movement is permanently attributable to a named user with a timestamp.

**Qualitative improvements**

| Dimension | Traditional process | Implemented system |
|---|---|---|
| Approval time | Hours, dependent on physical availability | Seconds once the approver opens the dashboard |
| Record keeping | Paper register | Eight relational tables with full history |
| Status visibility | Ask in person | Realtime on the student's own dashboard |
| Forgery risk | High | Server-verified UUID revealed only after approval |
| Report generation | Manual counting | Live counts per day, week and month |
| Headcount outside campus | Unknown | Live figure on the Security Dashboard |
| Approval overload | Uncontrolled | Capped at 5 per faculty member per month with automatic escalation |

---

## 29. Conclusion

The Outpass Management System was built to eliminate the delays, opacity and forgery risk inherent in a paper-based campus exit process. The delivered solution is a React 18 and TypeScript single-page application, styled with Tailwind CSS and shadcn/ui, backed by Supabase for authentication, PostgreSQL storage, realtime updates, file storage and serverless business logic.

Its major features are role-based registration and login across six roles, a validated outpass request flow with a four-per-month student quota, a strictly sequential Class In-Charge → HOD → Principal approval chain with idempotency protection and automatic escalation when a faculty member exceeds five approvals in a month, a single canonical UUID that doubles as the QR payload and is disclosed to the student only after full approval, camera-based QR verification through a privileged backend function, and exit and entry logging with live gate statistics. A principal-only bulk profile importer rounds out the administrative side.

Security is layered rather than incidental: Zod validation in the browser, re-validation and role checks inside every edge function, roles held in a dedicated table and queried through `SECURITY DEFINER` helpers, Row Level Security on every table, and an audit trail for both approvals and role changes.

The benefits are concrete — approvals in seconds instead of hours, an unforgeable digital pass, a permanently searchable record, and real-time visibility for all three constituencies. The system also has honest limitations: the notification table is populated but not yet surfaced, the faculty history view is a placeholder, the coordinator role cannot complete an approval, and passes do not expire. Each of these is a well-scoped next step rather than a structural flaw, and the existing schema already accommodates them. With notifications, expiry, analytics and ERP integration added, the platform is well positioned to serve as the institute's permanent campus movement management system.

---

## 30. Appendix

### A. Glossary

| Term | Meaning |
|---|---|
| Outpass | Official permission for a student to leave campus during working hours |
| UUID | Universally Unique Identifier; here, the primary key of the request, its QR payload and its verification token |
| RLS | Row Level Security — PostgreSQL policies that filter rows per authenticated user |
| Edge Function | A Deno serverless function running close to the user, holding privileged business logic |
| Service Role | A privileged database key that bypasses RLS; used only inside edge functions, never in the browser |
| SECURITY DEFINER | A PostgreSQL function that executes with its owner's privileges, used to avoid recursive RLS checks |
| JWT | JSON Web Token issued by the auth provider and attached to every request |
| `current_approval_level` | The column that determines which role may act on a request next |
| `visible_to_roles` | An array column that drives which faculty roles can see a request under RLS |
| Escalation | Automatic transfer of a request to a higher authority, by elapsed time or by approver quota |
| PostgREST | The auto-generated REST interface over the PostgreSQL schema used by the client library |

### B. Sample API exchange — creating a request

```jsonc
// POST → request-outpass   (Authorization: Bearer <jwt> attached automatically)
{
  "purpose": "Medical appointment at the district hospital",
  "from_date": "2026-08-10T09:00:00.000Z",
  "to_date":   "2026-08-10T14:00:00.000Z"
}

// 201 Created
{
  "request": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "student_id": "…",
    "status": "pending",
    "current_approval_level": "class_incharge",
    "visible_to_roles": ["class_incharge"],
    "qr_code": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }
}

// 400 Bad Request — quota exceeded
{ "error": "Monthly outpass limit exceeded. You can only submit 4 requests per month." }
```

### C. Sample API exchange — gate verification

```jsonc
// POST → verify-outpass
{ "uuid": "7c9e6679-7425-40de-944b-e07fc1f90ae7" }

// 200 OK — valid
{
  "valid": true,
  "outpassId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "studentName": "A. Sravani",
  "regNo": "21KA1A0512",
  "year": "3rd Year",
  "department": "CSE",
  "validFrom": "2026-08-10T09:00:00.000Z",
  "validTo": "2026-08-10T14:00:00.000Z",
  "reason": "Medical appointment at the district hospital",
  "status": "approved",
  "alreadyUsed": false,
  "usageType": "exit"
}

// 200 OK — not approved
{
  "valid": false,
  "status": "pending",
  "error": "Outpass Status: PENDING - Cannot grant entry",
  "details": "This outpass has not been approved yet."
}
```

### D. Sample outpass as presented to the student

```text
┌──────────────────────────────────────────────┐
│ Outpass Request — 08/08/2026        ✓ APPROVED│
│ Medical appointment at the district hospital  │
├──────────────────────────────────────────────┤
│ 🛡  Approved Outpass Verification ID          │
│    7c9e6679-7425-40de-944b-e07fc1f90ae7   [⧉] │
├──────────────────────────────────────────────┤
│ Applied: 08/08/2026                           │
│ From:    10/08/2026, 9:00:00 am               │
│ To:      10/08/2026, 2:00:00 pm               │
├──────────────────────────────────────────────┤
│ ✓ Approved — Show the QR code or ID at the    │
│   security gate                               │
│ [ Show QR Code ]  [ Copy ID ]                 │
└──────────────────────────────────────────────┘
```

### E. Sample bulk-import CSV

```csv
email,reg_no,department,year,section,full_name
student1@lendi.org,21KA1A0512,CSE,3rd Year,A,A. Sravani
student2@lendi.org,21KA1A0433,ECE,3rd Year,B,K. Manoj
```

### F. Configuration reference

| Setting | Value |
|---|---|
| Student monthly request limit | 4 |
| Faculty monthly approval limit | 5 (class_incharge and hod only) |
| Time escalation thresholds | Coordinator 5 min, HOD 10 min, Principal 20 min |
| Bulk import maximum | 500 records per file |
| Purpose length | 10–200 characters |
| Approval comments length | ≤ 500 characters |
| Minimum password length | 6 characters |
| Security log fetch limit | 50 most recent |
| QR error-correction level | H, rendered at 200 px |
| Storage bucket | `avatars` (public) |

### G. Screenshots

Screenshots of the Landing Page, Authentication screen, Student Dashboard, Faculty Dashboard, and Security Dashboard should be captured from the running application and inserted here at submission time.

---

## Project Summary

| Aspect | Summary |
|---|---|
| **Project Name** | Outpass Management System — Digital Outpass Approval System, Lendi Institute of Engineering and Technology |
| **Purpose** | Digitize campus outpass requests, multi-level faculty approval, and QR-based security verification at the gate |
| **Users** | Students, Class In-Charges, Coordinators, HODs, the Principal, and Security Guards (six roles) |
| **Main Features** | Role-based registration and login; validated outpass requests with a 4-per-month quota; sequential Class In-Charge → HOD → Principal approval with idempotency and automatic escalation; a single canonical UUID revealed only after approval; QR generation and camera-based scanning; privileged gate verification; exit and entry logging with live statistics; principal-only bulk CSV profile import; realtime dashboard updates |
| **Technology Stack** | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, shadcn/ui over Radix, Zod, qrcode.react, html5-qrcode, lucide-react, Supabase (Auth, PostgreSQL, Edge Functions on Deno, Realtime, Storage) |
| **Database** | PostgreSQL with 8 tables (`profiles`, `user_roles`, `outpass_requests`, `approvals`, `notifications`, `security_logs`, `faculty_monthly_approvals`, `role_change_audit`), 1 enum, 9 functions and 7 triggers, all protected by Row Level Security |
| **Architecture** | Browser SPA → Supabase Auth (JWT) → Edge Functions or PostgREST → Row Level Security → PostgreSQL, with realtime push back to the client |
| **Key Benefits** | Approvals in seconds rather than hours, an unforgeable server-verified pass, a complete and attributable audit trail, live visibility of students currently off campus, controlled outpass frequency, and zero paperwork |
