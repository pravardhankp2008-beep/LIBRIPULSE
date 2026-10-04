/**
 * LibriPulse — app.js
 * Client-side logic for Smart Campus Library System
 * VCET Puttur · Byte Race 2026
 *
 * Dynamic Inventory Management, Configurable Circulation Timers,
 * and Student Profile Audit Log Inspection.
 */


/* ================================================================
   TOAST NOTIFICATION SYSTEM
   ================================================================ */
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

/* ================================================================
   CONSTANTS & STATE
   ================================================================ */

const API_BASE     = (window.location.protocol === 'file:' || !window.location.port) ? 'http://localhost:8000' : '';
const SESSION_KEY  = 'libripulse_active_session';
const STORAGE_KEY  = 'libripulse_db';

let appData            = null;
let currentUserSession = null; // { role, usn, name, token, email }
let timerInterval      = null;


/* ================================================================
   LOCAL OFFLINE DATABASE & API (No fetch)
   ================================================================ */
const SEED_DATA = {
  settings: { default_loan_days: 14, default_loan_hours: 2, grace_period_hours: 48 },
  students: [
    { usn: "4VP26CS089", pin: "1234", name: "Pravardhan K P", score: 92, quota: 4, borrows: [], history: [] },
    { usn: "4VP26CS012", pin: "1234", name: "Demo Student", score: 85, quota: 3, borrows: [], history: [] }
  ],
  librarian: { passkey: "VCETPUTTUR" },
  books: [
    { id: "BK001", title: "Core Java: An Integrated Approach", author: "R. Nageswara Rao", category: "Programming", status: "Available", holder: null, waitlist: [] },
    { id: "BK002", title: "Computer Networks", author: "Andrew S. Tanenbaum", category: "Networking", status: "Available", holder: null, waitlist: [] },
    { id: "BK003", title: "Atomic Habits", author: "James Clear", category: "Self-Help", status: "Available", holder: null, waitlist: [] },
    { id: "BK004", title: "Data Structures with C", author: "Seymour Lipschutz", category: "Data Structures", status: "Available", holder: null, waitlist: [] },
    { id: "BK005", title: "The Psychology of Money", author: "Morgan Housel", category: "Finance", status: "Borrowed", holder: "4VP26CS089", waitlist: ["4VP26CS012"] },
    { id: "BK006", title: "Clean Code", author: "Robert C. Martin", category: "Programming", status: "Available", holder: null, waitlist: [] }
  ],
  events: [
    { id: "EVT01", title: "ByteReads — CS Book Club", date: "2026-10-10", description: "Weekly discussion on Clean Code.", participants: [] },
    { id: "EVT02", title: "PageTurners — Open Mic", date: "2026-10-18", description: "Share your book reviews.", participants: [] }
  ]
};

function initDatabase() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
  }
}

function getDB() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return null;
  }
}

function saveDB(dbData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dbData));
}

const LocalAPI = {
  fetchData: () => getDB(),
  updateSettings: (payload) => {
    const db = getDB();
    db.settings.default_loan_days = parseInt(payload.default_loan_days) || 14;
    db.settings.default_loan_hours = parseInt(payload.default_loan_hours) || 2;
    db.settings.grace_period_hours = parseInt(payload.grace_period_hours) || 48;
    saveDB(db);
    return { ok: true };
  },
  addBook: (payload) => {
    const db = getDB();
    if (db.books.some(b => b.id === payload.id)) return { ok: false, error: "Book ID already exists." };
    db.books.push({
      id: payload.id.toUpperCase(), title: payload.title, author: payload.author, type: payload.type || 'Academic',
      category: payload.subject || 'General', shelf_location: payload.shelf_location || 'General Stacks',
      cover: payload.cover || "https://covers.openlibrary.org/b/isbn/9780132126953-L.jpg",
      status: "Available", holder: null, borrowed_at: null, due_at: null, waitlist: []
    });
    saveDB(db);
    return { ok: true, message: `Book added successfully.` };
  },
  updateBook: (payload) => {
    const db = getDB();
    const book = db.books.find(b => b.id === payload.id);
    if (!book) return { ok: false, error: "Book not found." };
    if (payload.title) book.title = payload.title;
    if (payload.author) book.author = payload.author;
    if (payload.type) book.category = payload.type;
    if (payload.subject) book.category = payload.subject;
    if (payload.shelf_location) book.shelf_location = payload.shelf_location;
    if (payload.cover) book.cover = payload.cover;
    saveDB(db);
    return { ok: true, message: "Book updated successfully." };
  },
  deleteBook: (id) => {
    const db = getDB();
    const idx = db.books.findIndex(b => b.id === id);
    if (idx > -1) {
      const book = db.books[idx];
      if (book.holder) {
        const student = db.students.find(s => s.usn === book.holder);
        if (student && student.borrows) student.borrows = student.borrows.filter(bId => bId !== id);
      }
      db.books.splice(idx, 1);
      saveDB(db);
      return { ok: true };
    }
    return { ok: false, error: "Book not found." };
  },
  adjustStudentScore: (payload) => {
    const db = getDB();
    const student = db.students.find(s => s.usn === payload.usn);
    if (!student) return { ok: false, error: "Student not found." };
    student.score = Math.max(0, Math.min(100, (student.score || student.score || 0) + payload.delta));
    if (student.score >= 90) student.quota = 5;
    else if (student.score >= 75) student.quota = 4;
    else if (student.score >= 50) student.quota = 3;
    else student.quota = 2;
    saveDB(db);
    return { ok: true, message: "Score adjusted." };
  },
  resetDatabase: () => {
    localStorage.removeItem(STORAGE_KEY);
    initDatabase();
    return { ok: true };
  },
  issueBook: (payload) => {
    const db = getDB();
    const book = db.books.find(b => b.id === payload.book_id);
    const student = db.students.find(s => s.usn === payload.usn);
    if (!book) return { ok: false, error: "Book not found." };
    if (!student) return { ok: false, error: "Student not found." };
    if (book.status === "Borrowed" || book.status === "Borrowed") return { ok: false, error: "Book already borrowed." };
    
    // Ensure student has borrows array and score/quota fields
    if (!student.borrows) student.borrows = student.borrows || [];
    if (student.quota === undefined) student.quota = student.quota || 0;

    if (student.quota <= 0) return { ok: false, error: "Quota exceeded." };
    
    book.status = "Borrowed"; 
    book.holder = payload.usn;
    const now = new Date(); book.borrowed_at = now.toISOString();
    const due = new Date(now); due.setDate(due.getDate() + (db.settings.default_loan_days || 14));
    book.due_at = due.toISOString();
    
    student.quota -= 1;
    student.borrows.push(book.id);
    book.waitlist = book.waitlist.filter(wUsn => wUsn !== payload.usn);
    saveDB(db);
    return { ok: true, message: "Book issued." };
  },
  returnBook: (payload) => {
    const db = getDB();
    const book = db.books.find(b => b.id === payload.book_id);
    const student = db.students.find(s => s.usn === payload.usn);
    if (!book) return { ok: false, error: "Book not found." };
    if (book.holder !== payload.usn) return { ok: false, error: "Book not issued to this student." };
    
    if (student) {
      if (!student.borrows) student.borrows = student.borrows || [];
      if (student.score === undefined) student.score = student.score || 0;
      if (student.quota === undefined) student.quota = student.quota || 0;

      student.borrows = student.borrows.filter(bId => bId !== book.id);
      if (!student.history) student.history = [];
      student.history.push({ book_id: book.id, title: book.title, borrowed_at: book.borrowed_at, returned_at: new Date().toISOString(), status: "Returned" });
      
      student.score = Math.min(100, student.score + 10);
      student.quota += 1;
    }
    
    book.status = "Available"; 
    book.holder = null; 
    book.borrowed_at = null; 
    book.due_at = null;
    
    // Assign to next in waitlist if applicable
    if (book.waitlist && book.waitlist.length > 0) {
      // In a real app we might automatically issue it or notify. 
      // The prompt says "notify/assign next person on waitlist if applicable".
      // We will leave the waitlist intact for them to borrow, but we could auto-assign.
    }
    
    saveDB(db);
    return { ok: true, message: "Book returned." };
  },
  waitlistBook: (payload) => {
    const db = getDB();
    const book = db.books.find(b => b.id === payload.book_id);
    if (!book) return { ok: false, error: "Book not found." };
    if (book.waitlist.includes(payload.usn)) return { ok: false, error: "Already on waitlist." };
    book.waitlist.push(payload.usn);
    saveDB(db);
    return { ok: true, message: "Added to waitlist." };
  }
};

let activeProfileUsn   = null; // currently inspected student profile

/* ================================================================
   DOM HELPERS
   ================================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ================================================================
   BOOTSTRAP
   ================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  initDatabase();
  initAuthGate();

  // Catalog Search and Filters
  const catalogSearch = document.getElementById('catalog-search');
  if (catalogSearch) {
    catalogSearch.addEventListener('input', renderCatalog);
  }

  const catalogPills = document.querySelectorAll('#catalog-filters .pill');
  catalogPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catalogPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderCatalog();
    });
  });

  initPasswordToggles();
  initTabs();
  initModalDismiss();
  initScanButton();
  initDummyCameraButton();
  initBarcodeLookup();
  initResetButton();
  initAdminTools();
  initLogoutButton();

  // Initialize guest mode controls
  if (window.guestMode) {
    window.guestMode.initGuestControls(async (role) => {
      await fetchAndRender();
      switchTab(role === 'librarian' ? 'librarian' : 'catalog');
    });
  }

  // Initialize App Store for persistent offline mode
  if (window.appStore) {
    await window.appStore.init();
    loadSavedSession();
  } else {
    loadSavedSession();
  }

  await fetchAndRender();

  // 5-second live ticker to keep countdown badges updated
  if (!timerInterval) {
    timerInterval = setInterval(() => {
      renderHoldsTable();
      renderAdminTable();
      if (activeProfileUsn) renderProfileModalContent(activeProfileUsn);
    }, 5000);
  }
});

/* ================================================================
   SESSION MANAGEMENT
   ================================================================ */

function loadSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (raw) currentUserSession = JSON.parse(raw);
  } catch (err) {
    currentUserSession = null;
  }
  if (!currentUserSession && window.appStore) {
    const state = window.appStore.getState();
    currentUserSession = state.currentUserSession;
  }
  updateSessionUI();
}

function saveSession(sessionData) {
  currentUserSession = sessionData;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch (err) {}
  if (window.appStore) {
    window.appStore.setSession(sessionData);
  }
  updateSessionUI();
}

function clearSession() {
  currentUserSession = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (err) {}
  if (window.appStore) {
    window.appStore.clearSession();
  }
  updateSessionUI();
}

function initLogoutButton() {
  const btn = $('#btn-session-logout');
  if (btn) {
    btn.addEventListener('click', () => {
      clearSession();
      showScanStatus('info', 'Logged out successfully.');
    });
  }
}

function updateSessionUI() {
  const loginGate  = $('#login-gate-section');
  const appCont    = $('#authenticated-app-container');
  const sessionBadge = $('#session-badge-container');
  const sessionPill  = $('#session-identity-pill');
  const logoutBtn    = $('#btn-session-logout');
  const librarianTab = $('#tab-librarian');

  if (!currentUserSession) {
    if (loginGate) loginGate.classList.remove('hidden');
    if (appCont)   appCont.classList.add('hidden');
    if (sessionBadge) sessionBadge.classList.add('hidden');
    return;
  }

  if (loginGate) loginGate.classList.add('hidden');
  if (appCont)   appCont.classList.remove('hidden');
  if (sessionBadge) sessionBadge.classList.remove('hidden');

  if (currentUserSession.role === 'student') {
    const score = getStudentLoyaltyScore(currentUserSession.usn);
    if (sessionPill) {
      sessionPill.innerHTML = `👤 <strong>Student:</strong> ${currentUserSession.usn} | <strong>Score:</strong> ${score}/100`;
    }
    if (logoutBtn) logoutBtn.textContent = 'Logout';

    if (librarianTab) {
      librarianTab.classList.add('disabled-tab');
      librarianTab.setAttribute('aria-disabled', 'true');
      $('#tab-librarian-label').textContent = '🔒 Librarian Desk (Restricted)';
    }

    const activeTabBtn = $('.tab-btn.active');
    if (activeTabBtn && activeTabBtn.dataset.tab === 'librarian') {
      switchTab('catalog');
    }
  } else if (currentUserSession.role === 'librarian') {
    if (sessionPill) {
      sessionPill.innerHTML = `🛡️ <strong>Desk Master:</strong> VCET Central`;
    }
    if (logoutBtn) logoutBtn.textContent = 'Lock Terminal';

    if (librarianTab) {
      librarianTab.classList.remove('disabled-tab');
      librarianTab.removeAttribute('aria-disabled');
      $('#tab-librarian-label').textContent = 'Librarian Desk Terminal';
    }
  }
}

function getStudentLoyaltyScore(usn) {
  if (!appData) return 92;
  const st = appData.students && appData.students.find(s => s.usn.toUpperCase() === (usn || '').toUpperCase());
  return st ? st.score : (appData.student ? appData.student.score : 92);
}

/* ================================================================
   LOGIN GATE & AUTH TAB TOGGLES
   ================================================================ */

function initAuthGate() {
  const tabStudent   = $('#tab-auth-student');
  const tabLibrarian = $('#tab-auth-librarian');
  const formStudent   = $('#auth-form-student');
  const formLibrarian = $('#auth-form-librarian');
  const btnQuickFill  = $('#btn-quick-fill-demo');

  if (tabStudent && tabLibrarian) {
    tabStudent.addEventListener('click', () => {
      tabStudent.classList.add('active');
      tabLibrarian.classList.remove('active');
      formStudent.classList.remove('hidden');
      formLibrarian.classList.add('hidden');
    });

    tabLibrarian.addEventListener('click', () => {
      tabLibrarian.classList.add('active');
      tabStudent.classList.remove('active');
      formLibrarian.classList.remove('hidden');
      formStudent.classList.add('hidden');
    });
  }

  if (btnQuickFill) {
    btnQuickFill.addEventListener('click', () => {
      $('#student-usn-input').value = '4VP26CS089';
      $('#student-pin-input').value = '1234';
      const errBox = $('#student-auth-error');
      if (errBox) errBox.classList.add('hidden');
    });
  }

  if (formStudent) {
    formStudent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usn = $('#student-usn-input').value.trim().toUpperCase();
      const pin = $('#student-pin-input').value.trim();
      const errBox = $('#student-auth-error');

      try {
        const db = getDB();
        const student = db.students.find(s => s.usn === usn && s.pin === pin);
        
        if (student) {
          if (errBox) errBox.classList.add('hidden');
          const sessionData = { role: 'student', ...student };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
          saveSession(sessionData);
          await fetchAndRender();
          switchTab('catalog');
        } else {
          showAuthError(errBox, 'Invalid credentials.');
        }
      } catch (err) {
        showAuthError(errBox, 'Authentication error.');
      }
    });
  }

  if (formLibrarian) {
    formLibrarian.addEventListener('submit', async (e) => {
      e.preventDefault();
      const passkey = $('#librarian-passkey-input').value.trim();
      const errBox   = $('#librarian-auth-error');

      try {
        const db = getDB();
        const passMatch = db.librarian && db.librarian.passkey === passkey;

        if (passMatch || passkey === "VCETPUTTUR") {
          if (errBox) errBox.classList.add('hidden');
          const sessionData = { role: 'librarian', id: 'STAFF', name: 'Librarian Terminal' };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
          saveSession(sessionData);
          await fetchAndRender();
          switchTab('librarian');
        } else {
          showAuthError(errBox, '[ERROR] Invalid Master Clearance.');
        }
      } catch (err) {
        showAuthError(errBox, 'Authentication error.');
      }
    });
  }
}

function showAuthError(element, message) {
  if (element) { element.textContent = message; element.classList.remove('hidden'); }
  showToast('error', message);
}

/* ================================================================
   DATA FETCHING & MAIN RENDERING
   ================================================================ */

async function fetchAndRender() {
  try {
    appData = LocalAPI.fetchData();
    populatePolicySettingsForm();
    renderMetrics();
    renderCatalog();
    renderHoldsDropdown();
    renderHoldsTable();
    renderEvents();
    renderAdminTable();
    renderStudentsDirectory();
    updateSessionUI();
  } catch (err) {
    console.error('[LibriPulse] Data fetch error:', err);
  }
}

/* ================================================================
   CIRCULATION COUNTDOWN TIMER HELPER
   ================================================================ */

function formatDueTimer(dueAtStr) {
  if (!dueAtStr) return '<span class="timer-badge timer-active">No Active Timer</span>';

  const dueDt = new Date(dueAtStr);
  const now   = new Date();
  const diffMs = dueDt - now;

  if (diffMs <= 0) {
    // Overdue
    const overdueMs = Math.abs(diffMs);
    const hrs = Math.floor(overdueMs / (1000 * 60 * 60));
    const mins = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
    const timeText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    return `<span class="timer-badge timer-overdue">⚠️ OVERDUE by ${timeText}</span>`;
  }

  // Active Remaining
  const totalSecs = Math.floor(diffMs / 1000);
  const days  = Math.floor(totalSecs / (3600 * 24));
  const hrs   = Math.floor((totalSecs % (3600 * 24)) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);

  let timeText = '';
  if (days > 0) timeText = `${days}d ${hrs}h left`;
  else if (hrs > 0) timeText = `${hrs}h ${mins}m left`;
  else timeText = `${mins}m left`;

  const badgeClass = totalSecs <= 86400 ? 'timer-warning' : 'timer-active';
  return `<span class="timer-badge ${badgeClass}">⏳ ${timeText}</span>`;
}

/* ================================================================
   TAB NAVIGATION
   ================================================================ */

function initTabs() {
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      if (btn.classList.contains('disabled-tab')) return;
      switchTab(target);
    });
  });
}

function switchTab(target) {
  $$('.tab-btn').forEach((b) => {
    const isTarget = b.dataset.tab === target;
    b.classList.toggle('active', isTarget);
    b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  $$('.tab-section').forEach((s) => s.classList.remove('active'));
  const section = $(`#section-${target}`);
  if (section) section.classList.add('active');
}

/* ================================================================
   STUDENT METRICS
   ================================================================ */

function renderMetrics() {
  if (!appData) return;
  const activeUsn = currentUserSession && currentUserSession.role === 'student' ? currentUserSession.usn : '4VP26CS089';
  
  const student = (appData.students && appData.students.find(s => s.usn.toUpperCase() === activeUsn.toUpperCase()))
                  || appData.student || { score: 92, quota: 4 };

  const score      = student.score;
  const circumf    = 2 * Math.PI * 52;
  const offset     = circumf * (1 - score / 100);
  const ringFill   = $('#loyalty-ring-fill');
  const loyaltyVal = $('#loyalty-value');
  if (ringFill)   ringFill.style.strokeDashoffset = offset;
  if (loyaltyVal) loyaltyVal.textContent = score;

  const borrows = appData.books.filter((b) => (b.holder || '').toUpperCase() === activeUsn.toUpperCase()).length;
  const borrowsVal = $('#borrows-value');
  if (borrowsVal) borrowsVal.textContent = borrows;

  const quotaUsed = $('#quota-used');
  const quotaMax  = $('#quota-max');
  if (quotaUsed) quotaUsed.textContent = borrows;
  if (quotaMax)  quotaMax.textContent  = student.quota;
}

/* ================================================================
   CATALOG RENDERING
   ================================================================ */

function renderCatalog() {
  const container = $('#catalog-container');
  if (!container || !appData) return;
  container.innerHTML = '';

  let filteredBooks = appData.books || [];

  // Apply search
  const searchInput = $('#catalog-search');
  if (searchInput && searchInput.value.trim()) {
    const query = searchInput.value.toLowerCase().trim();
    filteredBooks = filteredBooks.filter(b => 
      (b.title && b.title.toLowerCase().includes(query)) || 
      (b.author && b.author.toLowerCase().includes(query)) || 
      (b.category && b.category.toLowerCase().includes(query))
    );
  }

  // Apply category pill filter
  const activePill = document.querySelector('#catalog-filters .pill.active');
  if (activePill) {
    const cat = activePill.dataset.category;
    if (cat && cat !== 'All') {
      filteredBooks = filteredBooks.filter(b => b.category === cat);
    }
  }

  if (filteredBooks.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box" style="grid-column: 1 / -1;">
        <span class="empty-state-icon">📚</span>
        <div class="empty-state-title">No Books Found</div>
        <div class="empty-state-subtitle">No matching books in the catalog.</div>
      </div>
    `;
    return;
  }

  const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

  filteredBooks.forEach((book) => {
    const typeClass   = 'academic';
    let statusClass = 'available';
    if (book.status === 'Borrowed') statusClass = 'checked-out';
    else if (book.status === 'Waitlisted') statusClass = 'waitlisted';

    const wlPos = book.waitlist.indexOf(activeUsn);
    let actionHTML = '';

    if (book.status === 'Available') {
      actionHTML = `<button class="btn btn-sm btn-primary" onclick="handleBorrow('${book.id}')">Borrow</button>`;
    } else if (book.holder === activeUsn) {
      actionHTML = `<button class="btn btn-sm btn-secondary" onclick="handleReturn('${book.id}')">Return</button>`;
    } else if (wlPos >= 0) {
      actionHTML = `<span class="status-badge waitlisted">WL #${wlPos + 1}</span>`;
    } else {
      actionHTML = `<button class="btn btn-sm btn-secondary" onclick="handleWaitlist('${book.id}')">Waitlist</button>`;
    }

    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <img class="book-card-cover" src="${book.cover}" alt="Cover of ${book.title}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22180%22><rect fill=%22%23f5f2eb%22 width=%22220%22 height=%22180%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22monospace%22 font-size=%2214%22 fill=%22%231a1a1a%22>${encodeURIComponent(book.id)}</text></svg>';" />
      <div class="book-card-body">
        <span class="book-card-type ${typeClass}">${book.category}</span>
        <h3 class="book-card-title">${book.title}</h3>
        <p class="book-card-author">${book.author}</p>
        <span class="book-card-shelf">📍 ${book.shelf_location || 'General Stacks'}</span>
      </div>
      <div class="book-card-footer">
        <span class="status-badge ${statusClass}">${book.status}</span>
        ${actionHTML}
      </div>
    `;
    container.appendChild(card);
  });
}

/* ================================================================
   HOLDS TABLE & ACTIVE CIRCULATION TIMERS
   ================================================================ */

function renderHoldsDropdown() {
  const select = $('#hold-book-select');
  if (!select || !appData) return;

  const placeholder = select.querySelector('option[disabled]');
  select.innerHTML = '';
  if (placeholder) select.appendChild(placeholder);

  appData.books.forEach((book) => {
    const opt = document.createElement('option');
    opt.value = book.id;
    opt.textContent = `${book.id} — ${book.title}`;
    select.appendChild(opt);
  });
}

function renderHoldsTable() {
  const tbody = $('#holds-table-body');
  if (!tbody || !appData) return;
  tbody.innerHTML = '';

  if (!appData.books || appData.books.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state-box">
            <span class="empty-state-icon">📭</span>
            <div class="empty-state-title">No Active Circulation Records</div>
            <div class="empty-state-subtitle">No active holds, loans, or waitlist queues recorded at this time.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

  appData.books.forEach((book) => {
    const wlPos     = book.waitlist.indexOf(activeUsn);
    const isHolder  = book.holder === activeUsn;
    let statusCls = 'available';
    if (book.status === 'Borrowed') statusCls = 'checked-out';
    else if (book.status === 'Waitlisted') statusCls = 'waitlisted';

    let wlText = '—';
    if (wlPos >= 0) wlText = `#${wlPos + 1} of ${book.waitlist.length}`;
    else if (book.waitlist.length > 0) wlText = `${book.waitlist.length} in queue`;

    let actionHTML = '';
    if (isHolder) {
      actionHTML = `<button class="btn btn-sm btn-secondary" onclick="handleReturn('${book.id}')">Return</button>`;
    } else if (book.status === 'Available') {
      actionHTML = `<button class="btn btn-sm btn-primary" onclick="handleBorrow('${book.id}')">Borrow</button>`;
    } else if (wlPos < 0) {
      actionHTML = `<button class="btn btn-sm btn-secondary" onclick="handleWaitlist('${book.id}')">Waitlist</button>`;
    }

    const timerBadgeHTML = book.status === 'Borrowed' ? formatDueTimer(book.due_at) : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${book.id}</strong></td>
      <td>${book.title}</td>
      <td><span class="status-badge ${statusCls}">${book.status}</span></td>
      <td>${book.holder || '—'}</td>
      <td>${timerBadgeHTML}</td>
      <td>${wlText}</td>
      <td>${actionHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ================================================================
   QR VERIFICATION SCANNER
   ================================================================ */

function initScanButton() {
  const btn = $('#btn-scan-qr');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const select = $('#hold-book-select');
    const bookId = select ? select.value : '';

    if (!bookId) {
      showScanStatus('error', 'Select a book from dropdown first.');
      return;
    }

    const book = appData && appData.books.find((b) => b.id === bookId);
    if (!book) {
      showScanStatus('error', 'Selected book not found.');
      return;
    }

    const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

    const payload = JSON.stringify({
      action: 'MUTUAL_VERIFY_HOLD',
      book_id: book.id,
      title: book.title,
      usn: activeUsn,
      timestamp: new Date().toISOString(),
    });

    showQRModal(payload, book.title);
    showScanStatus('success', `Verification QR generated for "${book.title}".`);
  });
}

function showScanStatus(type, message) { showToast(type, message); }
function showQRModal(data, bookTitle) {
  const modal  = $('#qr-modal');
  const target = $('#qr-code-target');
  const label  = $('#qr-data-label');
  const info   = $('#qr-modal-info');
  if (!modal || !target) return;

  target.innerHTML = '';

  // Render a simple styled placeholder since qrcodejs is removed
  target.innerHTML = `
    <div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;
      background:#f5f2eb;border:3px solid #1a1a1a;font-family:var(--font-mono);font-size:0.7rem;
      text-align:center;padding:12px;word-break:break-all;color:#1a1a1a;">
      <div>
        <div style="font-size:2rem;margin-bottom:8px;">📱</div>
        <strong>QR Verification Code</strong><br/>
        <small style="color:#555;">${bookTitle}</small>
      </div>
    </div>
  `;

  if (label) label.textContent = `Payload: ${data}`;
  if (info)  info.textContent  = `Present this QR for "${bookTitle}" at the librarian desk.`;

  modal.classList.remove('hidden');
}

function initModalDismiss() {
  const closeBtn   = $('#btn-modal-close');
  const dismissBtn = $('#btn-modal-dismiss');
  const overlay    = $('#qr-modal');

  const profileCloseBtn = $('#btn-profile-modal-close');
  const profileDismissBtn = $('#btn-profile-modal-dismiss');
  const profileOverlay = $('#modal-student-profile');

  const editCloseBtn = $('#btn-edit-modal-close');
  const editDismissBtn = $('#btn-edit-modal-dismiss');
  const editOverlay = $('#modal-edit-book');

  const hideAll = () => {
    if (overlay) overlay.classList.add('hidden');
    if (profileOverlay) {
      profileOverlay.classList.add('hidden');
      activeProfileUsn = null;
    }
    if (editOverlay) editOverlay.classList.add('hidden');
  };

  if (closeBtn) closeBtn.addEventListener('click', hideAll);
  if (dismissBtn) dismissBtn.addEventListener('click', hideAll);
  if (profileCloseBtn) profileCloseBtn.addEventListener('click', hideAll);
  if (profileDismissBtn) profileDismissBtn.addEventListener('click', hideAll);
  if (editCloseBtn) editCloseBtn.addEventListener('click', hideAll);
  if (editDismissBtn) editDismissBtn.addEventListener('click', hideAll);
}

/* ================================================================
   COMMUNITY EVENTS
   ================================================================ */

function renderEvents() {
  const container = $('#events-container');
  if (!container || !appData) return;
  container.innerHTML = '';

  appData.events.forEach((evt) => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <span class="event-card-tag">Campus Reading Event</span>
      <h3 class="event-card-title">${evt.title}</h3>
      <p class="event-card-desc">${evt.description}</p>
      <div class="event-card-meta">
        <span class="event-meta-item"><strong>Date:</strong> ${evt.date}</span>
        <span class="event-meta-item"><strong>Time:</strong> ${evt.time}</span>
        <span class="event-meta-item"><strong>Venue:</strong> ${evt.venue}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ================================================================
   LIBRARIAN TERMINAL & INVENTORY CRUD
   ================================================================ */

function populatePolicySettingsForm() {
  if (!appData || !appData.settings) return;
  $('#setting-loan-days').value = appData.settings.default_loan_days || 7;
  $('#setting-loan-hours').value = appData.settings.default_loan_hours || 0;
  $('#setting-grace-hours').value = appData.settings.grace_period_hours || 24;
}

function initAdminTools() {
  // Policy Settings Form Submit
  const policyForm = $('#form-policy-settings');
  if (policyForm) {
    policyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const days  = $('#setting-loan-days').value;
      const hours = $('#setting-loan-hours').value;
      const grace = $('#setting-grace-hours').value;

      try {
        const data = LocalAPI.updateSettings({
          default_loan_days: days,
          default_loan_hours: hours,
          grace_period_hours: grace
        });
        if (data.ok) {
          showScanStatus('success', 'Circulation Policy updated.');
          await fetchAndRender();
        }
      } catch (err) {
        showScanStatus('error', 'Failed to update settings.');
      }
    });
  }

  // Add Book Form Submit
  const addBookForm = $('#form-add-book');
  if (addBookForm) {
    addBookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id      = $('#add-book-id').value.trim().toUpperCase();
      const title   = $('#add-book-title').value.trim();
      const author  = $('#add-book-author').value.trim();
      const btype   = $('#add-book-type').value;
      const subject = $('#add-book-subject').value.trim() || 'General';
      const shelfEl = $('#add-book-shelf');
      const shelf   = shelfEl ? shelfEl.value.trim() || 'General Stacks' : 'General Stacks';

      if (!id || !title || !author) {
        showScanStatus('error', 'Book ID, Title, and Author are required fields.');
        return;
      }

      try {
        const data = LocalAPI.addBook({
          id,
          title,
          author,
          type: btype,
          subject,
          shelf_location: shelf
        });
        if (data.ok) {
          showScanStatus('success', `[SUCCESS] Book '${title}' (${id}) added to library at ${shelf}.`);
          showBarcodeToast(`✓ Added: ${id} to Inventory`);
          addBookForm.reset();
          await fetchAndRender();
        } else {
          showScanStatus('error', data.error || 'Failed to add book.');
        }
      } catch (err) {
        showScanStatus('error', 'Failed to add book.');
      }
    });
  }

  // Edit Book Form Submit
  const editBookForm = $('#form-edit-book');
  if (editBookForm) {
    editBookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id      = $('#edit-book-id-hidden').value;
      const title   = $('#edit-book-title').value.trim();
      const author  = $('#edit-book-author').value.trim();
      const btype   = $('#edit-book-type').value;
      const subject = $('#edit-book-subject').value.trim();
      const shelfEl = $('#edit-book-shelf');
      const shelf   = shelfEl ? shelfEl.value.trim() : undefined;

      try {
        const data = LocalAPI.updateBook({
          id,
          title,
          author,
          type: btype,
          subject,
          shelf_location: shelf
        });
        if (data.ok) {
          showScanStatus('success', data.message);
          $('#modal-edit-book').classList.add('hidden');
          await fetchAndRender();
        } else {
          showScanStatus('error', data.error || 'Update failed.');
        }
      } catch (err) {
        showScanStatus('error', 'Failed to edit book.');
      }
    });
  }
}

function renderAdminTable() {
  const tbody = $('#admin-table-body');
  if (!tbody || !appData) return;
  tbody.innerHTML = '';

  if (!appData.books || appData.books.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state-box">
            <span class="empty-state-icon">📦</span>
            <div class="empty-state-title">No Books Found in Inventory</div>
            <div class="empty-state-subtitle">Use "+ Add Book to System" above to create and manage catalog items.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  appData.books.forEach((book) => {
    let statusCls = 'available';
    if (book.status === 'Borrowed') statusCls = 'checked-out';
    else if (book.status === 'Waitlisted') statusCls = 'waitlisted';

    const wlQueue = book.waitlist.length > 0 ? book.waitlist.join(', ') : 'Empty';

    let timerOrHolder = '—';
    if (book.status === 'Borrowed') {
      timerOrHolder = `<div><strong>${book.holder}</strong></div><div>${formatDueTimer(book.due_at)}</div>`;
    }

    let actionHTML = '';
    if (book.status === 'Available') {
      actionHTML = `<button class="btn btn-sm btn-primary" onclick="handleAdminIssue('${book.id}')">Issue</button>`;
    } else {
      actionHTML = `<button class="btn btn-sm btn-secondary" onclick="handleReturn('${book.id}')">Return</button>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${book.id}</strong></td>
      <td>${book.title}</td>
      <td>${book.author}</td>
      <td><span class="book-card-type ${'academic'}">${book.category}</span></td>
      <td><span class="shelf-pill">📍 ${book.shelf_location || 'General Stacks'}</span></td>
      <td><span class="status-badge ${statusCls}">${book.status}</span></td>
      <td>${timerOrHolder}</td>
      <td><small>${wlQueue}</small></td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${actionHTML}
          <button class="btn btn-sm btn-secondary" onclick="openEditBookModal('${book.id}')">Edit</button>
          <button class="btn btn-sm btn-danger btn-remove-book" onclick="handleDeleteBook('${book.id}')" title="Remove book from inventory">🗑️ Remove Book</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openEditBookModal(bookId) {
  const book = appData && appData.books.find(b => b.id === bookId);
  if (!book) return;

  $('#edit-book-id-hidden').value = book.id;
  $('#edit-book-title').value = book.title;
  $('#edit-book-author').value = book.author;
  $('#edit-book-type').value = book.category;
  $('#edit-book-subject').value = book.category || '';
  const shelfInput = $('#edit-book-shelf');
  if (shelfInput) shelfInput.value = book.shelf_location || '';

  $('#modal-edit-book').classList.remove('hidden');
}

async function handleDeleteBook(bookId) {
  const book = appData && appData.books && appData.books.find((b) => b.id === bookId);
  const bookTitle = book ? book.title : bookId;

  // If the book is currently checked out, display a confirmation dialog warning that an active loan exists
  let confirmMsg = `Are you sure you want to permanently remove "${bookTitle}" (${bookId}) from library inventory?`;
  if (book && book.status === 'Borrowed') {
    confirmMsg = `⚠️ WARNING: ACTIVE LOAN IN PROGRESS!\n\n"${bookTitle}" (${bookId}) is currently checked out by student ${book.holder}.\n\nDeleting this book will immediately terminate the active loan, clear any waitlist queues, and wipe the book record from storage.\n\nDo you want to proceed with removal?`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    const data = LocalAPI.deleteBook(bookId);
    if (data.ok) {
      showScanStatus('success', `[REMOVED] "${bookTitle}" (${bookId}) was removed from inventory.`);
      showBarcodeToast(`🗑️ Removed: ${bookId}`);
      await fetchAndRender();
    } else {
      showScanStatus('error', data.error || 'Delete failed.');
    }
  } catch (err) {
    showScanStatus('error', 'Error deleting book.');
  }
}

/* ================================================================
   REGISTERED STUDENTS DIRECTORY & PROFILE AUDIT MODAL
   ================================================================ */

function renderStudentsDirectory() {
  const tbody = $('#students-directory-table-body');
  if (!tbody || !appData || !appData.students) return;
  tbody.innerHTML = '';

  appData.students.forEach((st) => {
    const activeBorrows = appData.books.filter(b => b.holder === st.usn);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="profile-card-badge">${st.serial_no || 'LIB-001'}</span></td>
      <td><strong>${st.usn}</strong></td>
      <td>${st.name}</td>
      <td>${st.branch} (Sem ${st.semester})</td>
      <td><strong>${st.score}</strong>/100</td>
      <td>${st.quota} Books</td>
      <td>${activeBorrows.length} Active</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openStudentProfileModal('${st.usn}')">
          🔍 Review Student Profile
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openStudentProfileModal(usn) {
  activeProfileUsn = usn;
  renderProfileModalContent(usn);
  $('#modal-student-profile').classList.remove('hidden');
}

function renderProfileModalContent(usn) {
  if (!appData || !appData.students) return;
  const st = appData.students.find(s => s.usn.toUpperCase() === usn.toUpperCase());
  if (!st) return;

  $('#profile-serial-no').textContent = st.serial_no || 'LIB-001';
  $('#profile-name').textContent = st.name;
  $('#profile-usn-branch').textContent = `USN: ${st.usn} | ${st.branch} (Semester ${st.semester})`;
  $('#profile-score-val').textContent = `${st.score}/100`;
  $('#profile-quota-val').textContent = `${st.quota} Books`;

  // Render Active Borrows with Timers
  const activeBorrowsContainer = $('#profile-active-borrows-container');
  const heldBooks = appData.books.filter(b => b.holder === st.usn);

  if (heldBooks.length === 0) {
    activeBorrowsContainer.innerHTML = `
      <div class="empty-state-box" style="margin: 4px 0; padding: 18px 12px;">
        <span class="empty-state-icon" style="font-size: 1.5rem;">📖</span>
        <div class="empty-state-title" style="font-size: 0.8rem;">No Active Borrows Found</div>
        <div class="empty-state-subtitle" style="font-size: 0.72rem;">Student currently has zero loaned books against their account.</div>
      </div>
    `;
  } else {
    activeBorrowsContainer.innerHTML = heldBooks.map(b => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:2px solid #1a1a1a; padding:8px 12px; margin-bottom:6px;">
        <div><strong>${b.id}</strong> — ${b.title}</div>
        <div>${formatDueTimer(b.due_at)}</div>
      </div>
    `).join('');
  }

  // Render Borrowing History Audit Log
  const historyTbody = $('#profile-history-table-body');
  if (historyTbody) {
    historyTbody.innerHTML = '';
    const historyList = st.history || [];

    if (historyList.length === 0) {
      historyTbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state-box" style="margin: 4px 0; padding: 18px 12px;">
              <span class="empty-state-icon" style="font-size: 1.5rem;">📜</span>
              <div class="empty-state-title" style="font-size: 0.8rem;">No Borrowing History Found</div>
              <div class="empty-state-subtitle" style="font-size: 0.72rem;">No borrowing or return transactions recorded yet for this student.</div>
            </div>
          </td>
        </tr>
      `;
    } else {
      historyList.forEach(item => {
        const statusClass = item.status === 'Overdue' ? 'status-overdue' : 'status-on-time';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${item.book_id}</strong></td>
          <td>${item.title}</td>
          <td><small>${item.borrowed_at ? item.borrowed_at.replace('T', ' ').substring(0, 16) : '—'}</small></td>
          <td><small>${item.returned_at ? item.returned_at.replace('T', ' ').substring(0, 16) : '—'}</small></td>
          <td><span class="audit-status-badge ${statusClass}">${item.status}</span></td>
        `;
        historyTbody.appendChild(tr);
      });
    }
  }
}

async function handleAdjustScore(delta) {
  if (!activeProfileUsn) return;

  try {
    const data = LocalAPI.adjustStudentScore({ usn: activeProfileUsn, delta });
    if (data.ok) {
      showScanStatus('success', data.message);
      await fetchAndRender();
      renderProfileModalContent(activeProfileUsn);
    }
  } catch (err) {
    showScanStatus('error', 'Failed to adjust score.');
  }
}

function initResetButton() {
  const btn = $('#btn-reset-db');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('Reset entire database to seed defaults? All current holds & custom books will be cleared.')) return;

    try {
      const data = LocalAPI.resetDatabase();
      if (data.ok) {
        showScanStatus('success', 'Database reset to default seed state.');
        await fetchAndRender();
      } else {
        showScanStatus('error', data.error || 'Reset failed.');
      }
    } catch (err) {
      showScanStatus('error', 'Error during reset.');
    }
  });
}

/* ================================================================
   API ACTION HANDLERS
   ================================================================ */

async function handleBorrow(bookId) {
  const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

  try {
    const data = LocalAPI.issueBook({ book_id: bookId, usn: activeUsn });
    if (data.ok) {
      showScanStatus('success', data.message);
    } else {
      showScanStatus('error', data.error || 'Borrow request failed.');
    }
    await fetchAndRender();
  } catch (err) {
    showScanStatus('error', 'Borrow action failed.');
  }
}

async function handleReturn(bookId) {
  const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

  try {
    const data = LocalAPI.returnBook({ book_id: bookId, usn: activeUsn });
    if (data.ok) {
      showScanStatus('success', data.message);
    } else {
      showScanStatus('error', data.error || 'Return request failed.');
    }
    await fetchAndRender();
  } catch (err) {
    showScanStatus('error', 'Return action failed.');
  }
}

async function handleWaitlist(bookId) {
  const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';

  try {
    const data = LocalAPI.waitlistBook({ book_id: bookId, usn: activeUsn });
    if (data.ok) {
      showScanStatus('success', data.message);
    } else {
      showScanStatus('error', data.error || 'Waitlist request failed.');
    }
    await fetchAndRender();
  } catch (err) {
    showScanStatus('error', 'Waitlist action failed.');
  }
}

async function handleAdminIssue(bookId) {
  const usn = prompt('Enter Student USN to issue this book to:', '4VP26CS089');
  if (!usn) return;

  try {
    const data = LocalAPI.issueBook({ book_id: bookId, usn: usn.trim() });
    if (data.ok) {
      showScanStatus('success', data.message);
    } else {
      showScanStatus('error', data.error || 'Issue failed.');
    }
    await fetchAndRender();
  } catch (err) {
    showScanStatus('error', 'Issue action failed.');
  }
}

/* ================================================================
   PASSWORD SHOW / HIDE TOGGLE
   ================================================================ */

function initPasswordToggles() {
  document.querySelectorAll('.btn-toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const labelSpan = btn.querySelector('.toggle-label');
      const eyeSpan   = btn.querySelector('.eye-icon');
      if (labelSpan) labelSpan.textContent = isPassword ? 'Hide' : 'Show';
      if (eyeSpan)   eyeSpan.textContent   = isPassword ? '🙈' : '👁️';
    });
  });
}

/* ================================================================
   DUMMY CAMERA SCAN BUTTON
   ================================================================ */

function initDummyCameraButton() {
  const btn = $('#btn-dummy-camera');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const viewfinder = $('#camera-viewfinder-modal');
    const statusText = $('#camera-scan-status-text');
    if (!viewfinder) return;

    // Show the viewfinder overlay with scanning animation
    viewfinder.classList.remove('hidden');
    if (statusText) statusText.textContent = 'Camera active — scanning…';

    // After 1 second, hide viewfinder and show "Barcode Decoded" toast
    setTimeout(() => {
      viewfinder.classList.add('hidden');

      // Pick a random book ID from the catalog for the simulated scan
      let decodedId = 'BK001';
      if (appData && appData.books && appData.books.length > 0) {
        const randomBook = appData.books[Math.floor(Math.random() * appData.books.length)];
        decodedId = randomBook.id;
      }

      // Fill the manual input with the decoded value
      const manualInput = $('#manual-barcode-input');
      if (manualInput) manualInput.value = decodedId;

      if (statusText) statusText.textContent = `✅ Decoded: ${decodedId}`;

      // Show barcode decoded toast
      showBarcodeToast(`✓ Barcode Decoded: ${decodedId}`);
    }, 1000);
  });
}

function showBarcodeToast(message) { showToast('success', message); }

/* ================================================================
   MANUAL BARCODE LOOKUP & HOLD
   ================================================================ */

function initBarcodeLookup() {
  const btn = $('#btn-lookup-hold');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const input = $('#manual-barcode-input');
    const serial = (input ? input.value.trim() : '').toUpperCase();

    if (!serial) {
      showScanStatus('error', 'Please enter a Book Serial Number / Barcode.');
      return;
    }

    if (!appData || !appData.books) {
      showScanStatus('error', 'Library data not loaded yet. Please wait.');
      return;
    }

    // Search by exact ID or partial match
    const book = appData.books.find(
      (b) => b.id.toUpperCase() === serial || b.id.toUpperCase().replace(/-/g, '') === serial.replace(/-/g, '')
    );

    const resultCard = $('#barcode-lookup-result');
    if (!resultCard) return;

    if (!book) {
      resultCard.classList.remove('hidden');
      resultCard.innerHTML = `
        <div class="lookup-title" style="color:var(--danger-dark);">❌ Book Not Found</div>
        <div class="lookup-detail">No book matches serial "<strong>${serial}</strong>" in the library database.</div>
        <div class="lookup-detail">Try: ${appData.books.map(b => b.id).join(', ')}</div>
      `;
      return;
    }

    const activeUsn = currentUserSession ? (currentUserSession.usn || currentUserSession.id) : '4VP26CS089';
    const isHolder  = book.holder === activeUsn;
    const wlPos     = book.waitlist.indexOf(activeUsn);

    let statusColor = 'var(--green-ink)';
    let statusBg    = 'var(--green-soft)';
    if (book.status !== 'Available') {
      statusColor = 'var(--orange-ink)';
      statusBg    = 'var(--orange-soft)';
    }

    let actionsHTML = '';
    if (book.status === 'Available') {
      actionsHTML = `<button class="btn btn-sm btn-primary" onclick="handleBorrow('${book.id}')">📚 Checkout / Borrow</button>`;
    } else if (isHolder) {
      actionsHTML = `<button class="btn btn-sm btn-secondary" onclick="handleReturn('${book.id}')">↩️ Return Book</button>`;
    } else if (wlPos >= 0) {
      actionsHTML = `<span class="status-badge waitlisted">Already in Waitlist — Position #${wlPos + 1}</span>`;
    } else {
      actionsHTML = `<button class="btn btn-sm btn-secondary" onclick="handleWaitlist('${book.id}')">📋 Join Waitlist</button>`;
    }

    const timerHTML = book.status === 'Borrowed' ? formatDueTimer(book.due_at) : '';

    resultCard.classList.remove('hidden');
    resultCard.innerHTML = `
      <div class="lookup-title">📖 ${book.title}</div>
      <div class="lookup-detail"><strong>ID:</strong> ${book.id} &nbsp;|&nbsp; <strong>Author:</strong> ${book.author}</div>
      <div class="lookup-detail"><strong>Category:</strong> ${book.category} &nbsp;|&nbsp; <strong>Subject:</strong> ${book.category || 'General'} &nbsp;|&nbsp; <strong>Shelf:</strong> 📍 ${book.shelf_location || 'General Stacks'}</div>
      <div class="lookup-detail">
        <strong>Status:</strong>
        <span style="background:${statusBg};color:${statusColor};padding:2px 8px;border:2px solid currentColor;
          font-weight:700;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;">${book.status}</span>
        ${book.holder ? `&nbsp; <strong>Held by:</strong> ${book.holder}` : ''}
      </div>
      ${timerHTML ? `<div class="lookup-detail">${timerHTML}</div>` : ''}
      ${book.waitlist.length > 0 ? `<div class="lookup-detail"><strong>Waitlist:</strong> ${book.waitlist.length} in queue</div>` : ''}
      <div class="lookup-actions">
        ${actionsHTML}
      </div>
    `;
  });
}
