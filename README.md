# LibriPulse — Smart Campus Library Circulation Platform

> **Built for Byte Race 2026 • VCET Puttur (Department of CSE)**

---

## 📌 Problem Statement & Core Value Proposition

Campus libraries at engineering colleges still rely on manual register-based issue/return workflows. This leads to **long counter queues**, lost holding records, zero real-time availability tracking, and no incentive mechanism for students to return high-demand textbooks on time.

**LibriPulse** solves these pain points with a fully digital, zero-dependency library circulation platform that any campus can deploy in under 60 seconds:

| Pain Point | LibriPulse Solution |
|:---|:---|
| Long counter queues & manual registers | **Mutual QR Handshake Verification** — student generates a QR, librarian validates instantly |
| No visibility into book availability | **Live Catalog** with real-time status badges (`Available` / `Checked Out` / `Waitlisted`) |
| Static, rigid circulation rules | **Configurable Circulation Policy** — librarian adjusts loan days, hours, and grace periods on the fly |
| No return incentive for students | **Punctuality Loyalty Score** — on-time returns earn +10 score; overdue returns deduct −5; score unlocks higher borrow quotas |
| No audit trail | **Student Profile Audit Log** — complete borrowing history with timestamped punctuality verdicts |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         Client (Vanilla JS PWA — Single Page App)       │
│  • Role-Based Authentication Gate (Student / Librarian) │
│  • Live Countdown Timer Badges (Active ⏳ vs Overdue ⚠️)│
│  • Neo-Brutalist High-Contrast UI                       │
│  • QR Verification Code Renderer                        │
│  • Student Directory & Audit Log Inspection Modal       │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP REST (Port 8000)
                          │
┌─────────────────────────▼───────────────────────────────┐
│         Python REST API Gateway (server.py)             │
│  • Python Standard Library only (http.server, json)     │
│  • Zero pip / external dependencies                     │
│  • Static asset serving + JSON REST endpoints           │
└─────────────────────────┬───────────────────────────────┘
                          │ JSON File I/O
                          │
┌─────────────────────────▼───────────────────────────────┐
│           JSON Pseudo-Database (db.json)                │
│  • Students, Books, Events, Settings, Audit Logs        │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack Breakdown

| Layer | Technology | Details |
|:---|:---|:---|
| **Frontend** | HTML5 + Vanilla CSS3 + JavaScript (ES6+) | Zero frameworks — lightweight PWA with Neo-Brutalist design system |
| **Backend** | None | 100% Client-side Application |
| **Database** | `localStorage` | In-browser JSON persistent store |
| **Deployment** | Open `index.html` in browser | No build step, no Docker, no server |

---

## ✨ Key Features

### 1. Mutual QR Handshake Simulation
Students select a book and generate a verification QR payload (`MUTUAL_VERIFY_HOLD`). The librarian scans/validates this code at the desk — eliminating manual register lookups and reducing counter time to seconds.

### 2. Punctuality Loyalty Score
Every student has a dynamic loyalty score (0–100). On-time book returns earn **+10 points**; overdue returns deduct **−5 points**. The score directly controls the student's maximum borrow quota:

| Score Range | Unlocked Quota |
|:---|:---|
| 90–100 | 5 books |
| 75–89 | 4 books |
| 50–74 | 3 books |
| Below 50 | 2 books |

### 3. Protected Librarian Terminal
The Librarian Desk Terminal is gated behind a **Master Passkey** (`VCETPUTTUR`). From this terminal, librarians can:
- **Add / Edit / Delete** books from the live catalog (full CRUD)
- **Configure circulation policy** — custom loan duration (days + hours) and grace period
- **Issue books** to students by USN with auto-calculated due timestamps
- **Inspect student profiles** — view loyalty scores, active borrows with live countdown timers, and complete punctuality audit logs
- **Adjust loyalty scores** manually (+10 reward / −5 penalty overrides)
- **Reset the database** to default seed state for evaluation testing

### 4. Live Circulation Countdown Timers
Every checked-out book displays a real-time countdown badge that auto-refreshes every 5 seconds:
- `⏳ 3d 14h left` — active loan with time remaining
- `⚠️ OVERDUE by 2h 15m` — overdue indicator with elapsed time

### 5. FIFO Waitlist Queue
When a book is checked out, other students can join a waitlist. Positions are displayed across all views (`WL #1`, `WL #2`, etc.).

### 6. Dynamic Inventory Management
Librarians can add new books with full metadata (ID, title, author, category, subject, shelf location) and remove decommissioned titles — all persisted live to `db.json`.

---

## 🚀 Local Setup & Execution Guide

### Prerequisites
- **Python 3.6+** (no pip packages required)
- A modern web browser (Chrome, Firefox, Edge)

### Run the Server

```bash
# 1. Navigate to the project directory
cd byte_race_librarypulse

# 2. Launch the LibriPulse server
python server.py
```

### Access the Platform

Open your browser and navigate to:

👉 **`http://localhost:8000`**

The server serves both the static frontend files and the REST API on port 8000. No build step, no npm install — just one command.

---

## 🔑 Test Credentials

| Portal | Identity / USN | PIN / Passkey | Notes |
|:---|:---|:---|:---|
| **Student Portal** | `4VP26CS089` | `1234` | Primary demo account (Pravardhan K P). ⚡ Quick Fill button available on login screen. |
| **Student Portal (Alt)** | `4VP26CS012` | `1234` | Secondary student account for multi-user testing |
| **Librarian Gate** | `librarian@vcet.edu.in` | `VCETPUTTUR` | Master Clearance — unlocks full Librarian Desk Terminal |

> **Tip:** Both portals also offer an **Instant Guest Access** button that bypasses credentials entirely for quick evaluation.

---

## 📂 Project Structure

```
byte_race_librarypulse/
├── server.py      # Python REST API server (standard library only)
├── index.html     # Single-page application entry point
├── style.css      # Neo-Brutalist design system stylesheet
├── app.js         # Client-side application logic & rendering
├── db.json        # JSON flat-file database (auto-created on first run)
├── README.md      # This file
└── .gitignore     # Git ignore rules
```

---

## 🛣️ API Endpoints Reference

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/data` | Fetch entire database (books, students, events, settings) |
| `POST` | `/api/auth/login` | Authenticate student or librarian |
| `POST` | `/api/admin/books/add` | Add a new book to catalog |
| `POST` | `/api/admin/books/update` | Edit book metadata |
| `POST` | `/api/admin/books/delete` | Remove a book from inventory |
| `POST` | `/api/admin/settings` | Update circulation policy settings |
| `POST` | `/api/admin/students/adjust-score` | Adjust student loyalty score |
| `POST` | `/api/admin/issue` | Issue a book to a student |
| `POST` | `/api/return` | Return a borrowed book |
| `POST` | `/api/waitlist` | Add student to book waitlist |
| `POST` | `/api/admin/reset` | Reset database to default seed state |

---

## 👥 Team Members — Byte Race 2026

| Member Name | USN | Role |
|:---|:---|:---|
| Pravardhan K P | `4VP26CS089` | Full-Stack Lead & Systems Developer |
| _Team Member 2_ | `4VP26CSXXX` | _Role placeholder_ |
| _Team Member 3_ | `4VP26CSXXX` | _Role placeholder_ |

**Team Name:** Team LibriPulse  
**Institution:** Vivekananda College of Engineering and Technology (VCET), Puttur  
**Department:** Computer Science & Engineering  

---

*LibriPulse — Smart Campus Library Circulation Platform • VCET Puttur Byte Race 2026*
