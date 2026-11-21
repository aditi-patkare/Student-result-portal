/**
 * ============================================================================
 * Student Results Management Portal
 * Academic Performance Management System (DLA Unit 6 Activity 6)
 * ============================================================================
 * Vanilla JavaScript implementation for dynamic data fetching, statistics
 * calculation, instant search filtering, and multi-column sorting.
 */

// ============================================================================
// 1. CONFIGURATION SECTION
// ============================================================================
/**
 * Paste your Google Apps Script Web App Deployment URL below.
 * Example format:
 * https://script.google.com/macros/s/AKfycbx.../exec
 */
const API_URL = "https://script.google.com/macros/s/AKfycbz9pFhxsGi3O4qhKFJepM-O4M3C8_rZ0eO00bR9UQ-73_3FKHdqWuLnHIqbpFjTWThblA/exec";

/**
 * Initial sample records required for initial testing & fallback.
 * Note: These are NOT the final permanent database; they serve as a graceful
 * fallback when API_URL is unconfigured or when demonstrating offline.
 */
const SAMPLE_STUDENTS = [
  {
    "Sr No": 1,
    "Roll No": "101",
    "Student Name": "Aarav Sharma",
    "10th": 88.4,
    "12th": 82.0,
    "Sem 1": 7.8,
    "Sem 2": 8.1
  },
  {
    "Sr No": 2,
    "Roll No": "102",
    "Student Name": "Diya Patel",
    "10th": 91.2,
    "12th": 86.5,
    "Sem 1": 8.4,
    "Sem 2": 8.6
  },
  {
    "Sr No": 3,
    "Roll No": "103",
    "Student Name": "Rohan Mehta",
    "10th": 76.0,
    "12th": 71.8,
    "Sem 1": 6.9,
    "Sem 2": 7.2
  }
];

// ============================================================================
// 2. STATE MANAGEMENT
// ============================================================================
const state = {
  rawStudents: [],        // Original normalized student records fetched from source
  filteredStudents: [],   // Current subset after applying search filter
  currentSort: {
    column: 'srNo',       // 'srNo' | 'rollNo' | 'name' | 'tenth' | 'twelfth' | 'sem1' | 'sem2'
    direction: 'asc'      // 'asc' | 'desc'
  },
  searchQuery: '',
  isLoading: false,
  isDemoMode: false,
  lastUpdated: null
};

// ============================================================================
// 3. DOM ELEMENTS
// ============================================================================
const DOM = {
  // Stats
  statTotalStudents: document.getElementById('statTotalStudents'),
  statAvg10th: document.getElementById('statAvg10th'),
  statAvg12th: document.getElementById('statAvg12th'),
  statAvgSem2: document.getElementById('statAvgSem2'),

  // Header & Status
  apiStatusBadge: document.getElementById('apiStatusBadge'),
  apiStatusText: document.getElementById('apiStatusText'),
  statusBanner: document.getElementById('statusBanner'),
  bannerIcon: document.getElementById('bannerIcon'),
  bannerText: document.getElementById('bannerText'),
  bannerCloseBtn: document.getElementById('bannerCloseBtn'),

  // Controls & Toolbar
  searchInput: document.getElementById('searchInput'),
  searchClearBtn: document.getElementById('searchClearBtn'),
  sortSelector: document.getElementById('sortSelector'),
  refreshBtn: document.getElementById('refreshBtn'),
  refreshIcon: document.getElementById('refreshIcon'),
  displayedCount: document.getElementById('displayedCount'),
  totalCount: document.getElementById('totalCount'),
  lastSyncTime: document.getElementById('lastSyncTime'),

  // Table & States
  studentsTable: document.getElementById('studentsTable'),
  studentsTableBody: document.getElementById('studentsTableBody'),
  tableLoading: document.getElementById('tableLoading'),
  emptyState: document.getElementById('emptyState'),
  emptyStateDesc: document.getElementById('emptyStateDesc'),
  resetSearchBtn: document.getElementById('resetSearchBtn'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn'),
  fallbackBtn: document.getElementById('fallbackBtn'),
  sortableHeaders: document.querySelectorAll('.sortable-th')
};

// ============================================================================
// 4. DATA NORMALIZATION HELPER
// ============================================================================
/**
 * Normalizes diverse Google Sheets JSON response formats and key naming
 * conventions (e.g. 'Roll No', 'rollNo', 'roll_no', 'Student Name', etc.)
 * into a reliable, consistent internal structure.
 */
function normalizeStudentRecord(record, index) {
  // Safe helper to extract properties case-insensitively / key-variations
  const getProp = (...keys) => {
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
        return record[key];
      }
    }
    return undefined;
  };

  const parseNumber = (val, defaultVal = 0) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? defaultVal : num;
  };

  const srNoRaw = getProp('Sr No', 'srNo', 'sr_no', 'Sr', 'sr');
  const rollNoRaw = getProp('Roll No', 'rollNo', 'roll_no', 'Roll', 'roll', 'RollNo');
  const nameRaw = getProp('Student Name', 'studentName', 'student_name', 'Name', 'name', 'StudentName');
  const tenthRaw = getProp('10th', 'tenth', '10th Marks', '10th %', 'Class 10');
  const twelfthRaw = getProp('12th', 'twelfth', '12th Marks', '12th %', 'Class 12');
  const sem1Raw = getProp('Sem 1', 'sem1', 'sem_1', 'Semester 1', 'Sem 1 SGPA');
  const sem2Raw = getProp('Sem 2', 'sem2', 'sem_2', 'Semester 2', 'Sem 2 SGPA');

  return {
    srNo: parseNumber(srNoRaw, index + 1),
    rollNo: rollNoRaw ? String(rollNoRaw).trim() : String(index + 101),
    name: nameRaw ? String(nameRaw).trim() : 'Unknown Student',
    tenth: parseNumber(tenthRaw, 0),
    twelfth: parseNumber(twelfthRaw, 0),
    sem1: parseNumber(sem1Raw, 0),
    sem2: parseNumber(sem2Raw, 0)
  };
}

// ============================================================================
// 5. FETCH & DATA RETRIEVAL
// ============================================================================
/**
 * Checks if the configured URL is still the default placeholder.
 */
function isPlaceholderUrl(url) {
  return (
    !url ||
    url.trim() === "" ||
    url.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE") ||
    !url.startsWith("http")
  );
}

/**
 * Fetches student records dynamically from the Google Apps Script Web App JSON API.
 * Gracefully handles loading states, error states, and unconfigured demo mode.
 */
async function fetchStudentRecords() {
  setLoadingState(true);
  hideBanner();

  // If user hasn't configured the API URL yet, load sample records in demo mode
  if (isPlaceholderUrl(API_URL)) {
    console.info("Info: Google Apps Script API_URL is not set yet. Running in Demo Mode with sample records.");
    setTimeout(() => {
      state.isDemoMode = true;
      loadSampleData(
        "Demo Mode Active: Displaying sample records. To connect live data, paste your Google Apps Script Web App URL into script.js."
      );
      setLoadingState(false);
    }, 450); // Small realistic delay for UI smoothness
    return;
  }

  try {
    updateApiStatus('connecting', 'Connecting to Google Sheets...');
    
    // Google Apps Script Web Apps follow redirects (302) to googleusercontent.com
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const jsonResult = await response.json();
    
    // Support common response wraps: array directly, or { data: [...] }, or { records: [...] }
    let rawList = [];
    if (Array.isArray(jsonResult)) {
      rawList = jsonResult;
    } else if (jsonResult && Array.isArray(jsonResult.data)) {
      rawList = jsonResult.data;
    } else if (jsonResult && Array.isArray(jsonResult.records)) {
      rawList = jsonResult.records;
    } else if (jsonResult && Array.isArray(jsonResult.students)) {
      rawList = jsonResult.students;
    } else {
      throw new Error("Invalid JSON structure: Expected an array of student records.");
    }

    if (rawList.length === 0) {
      showEmptyData("Google Sheet is empty. No student records found.");
      state.rawStudents = [];
      state.filteredStudents = [];
      updateDashboardStats();
      renderTable();
      updateApiStatus('connected', 'Live API Connected (0 records)');
      return;
    }

    // Normalize all records
    state.rawStudents = rawList.map((item, idx) => normalizeStudentRecord(item, idx));
    state.isDemoMode = false;
    state.lastUpdated = new Date();

    updateApiStatus('connected', 'Live API Connected');
    showBanner("Connected successfully to Google Sheets. Live student records loaded.", "success");
    applyFilterAndSort();

  } catch (error) {
    console.error("Error fetching student records from Google Sheets:", error);
    showErrorState(error.message);
  } finally {
    setLoadingState(false);
  }
}

/**
 * Loads the required sample records for offline demonstration or testing.
 */
function loadSampleData(noticeMessage = null) {
  state.rawStudents = SAMPLE_STUDENTS.map((item, idx) => normalizeStudentRecord(item, idx));
  state.isDemoMode = true;
  state.lastUpdated = new Date();

  updateApiStatus('demo', 'Demo Mode (Sample Data)');
  if (noticeMessage) {
    showBanner(noticeMessage, 'warning');
  }

  hideErrorState();
  applyFilterAndSort();
}

// ============================================================================
// 6. STATISTICS CALCULATION
// ============================================================================
/**
 * Dynamically computes:
 * - Total Students
 * - Average 10th Percentage
 * - Average 12th Percentage
 * - Average Semester 2 SGPA
 * Uses the currently active dataset.
 */
function updateDashboardStats() {
  const students = state.rawStudents;
  const count = students.length;

  if (count === 0) {
    DOM.statTotalStudents.textContent = "0";
    DOM.statAvg10th.textContent = "0.00";
    DOM.statAvg12th.textContent = "0.00";
    DOM.statAvgSem2.textContent = "0.00";
    return;
  }

  // Calculate sums
  let sum10th = 0;
  let sum12th = 0;
  let sumSem2 = 0;

  for (const student of students) {
    sum10th += student.tenth;
    sum12th += student.twelfth;
    sumSem2 += student.sem2;
  }

  const avg10th = (sum10th / count).toFixed(2);
  const avg12th = (sum12th / count).toFixed(2);
  const avgSem2 = (sumSem2 / count).toFixed(2);

  // Update DOM with animated counter or formatted value
  animateValue(DOM.statTotalStudents, count);
  animateValue(DOM.statAvg10th, avg10th);
  animateValue(DOM.statAvg12th, avg12th);
  animateValue(DOM.statAvgSem2, avgSem2);
}

/**
 * Clean text update with subtle fade effect
 */
function animateValue(element, targetValue) {
  element.textContent = targetValue;
}

// ============================================================================
// 7. SEARCH & FILTERING
// ============================================================================
/**
 * Filters records instantly by Roll Number or Student Name (case-insensitive).
 */
function handleSearchInput(e) {
  const query = e.target.value.trim().toLowerCase();
  state.searchQuery = query;

  // Toggle clear search button
  if (query.length > 0) {
    DOM.searchClearBtn.style.display = 'flex';
  } else {
    DOM.searchClearBtn.style.display = 'none';
  }

  applyFilterAndSort();
}

/**
 * Clears the active search query.
 */
function clearSearch() {
  DOM.searchInput.value = '';
  state.searchQuery = '';
  DOM.searchClearBtn.style.display = 'none';
  DOM.searchInput.focus();
  applyFilterAndSort();
}

// ============================================================================
// 8. SORTING ENGINE
// ============================================================================
/**
 * Sorts student records by:
 * - Roll Number
 * - Student Name
 * - 10th Marks
 * - 12th Marks
 * - Semester 1
 * - Semester 2
 * - Sr No
 */
function sortRecords(records, column, direction) {
  const sorted = [...records];
  const isAsc = direction === 'asc';

  sorted.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    // Numeric comparison for marks and semesters
    if (['tenth', 'twelfth', 'sem1', 'sem2', 'srNo'].includes(column)) {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return isAsc ? valA - valB : valB - valA;
    }

    // Roll number comparison (handles numeric strings like "101", "102")
    if (column === 'rollNo') {
      const numA = parseInt(valA, 10);
      const numB = parseInt(valB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return isAsc ? numA - numB : numB - numA;
      }
      return isAsc
        ? String(valA).localeCompare(String(valB), undefined, { numeric: true })
        : String(valB).localeCompare(String(valA), undefined, { numeric: true });
    }

    // String comparison for Student Name
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return isAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });

  return sorted;
}

/**
 * Handles header click sorting. Toggles asc <-> desc.
 */
function handleHeaderSort(column) {
  if (state.currentSort.column === column) {
    state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.currentSort.column = column;
    // Default descending for performance metrics, ascending for names/numbers
    if (['tenth', 'twelfth', 'sem1', 'sem2'].includes(column)) {
      state.currentSort.direction = 'desc';
    } else {
      state.currentSort.direction = 'asc';
    }
  }

  // Sync dropdown selector
  const sortKey = `${state.currentSort.column}-${state.currentSort.direction}`;
  if (DOM.sortSelector) {
    DOM.sortSelector.value = sortKey;
  }

  applyFilterAndSort();
}

/**
 * Handles sort selection from the dropdown.
 */
function handleDropdownSort(e) {
  const [column, direction] = e.target.value.split('-');
  state.currentSort.column = column;
  state.currentSort.direction = direction;
  applyFilterAndSort();
}

/**
 * Updates sort indicator icons (▲, ▼, ↕) in table headers.
 */
function updateSortHeadersUI() {
  DOM.sortableHeaders.forEach(th => {
    const col = th.getAttribute('data-column');
    const indicator = th.querySelector('.sort-indicator');

    if (col === state.currentSort.column) {
      th.classList.add('active-sort');
      if (indicator) {
        indicator.textContent = state.currentSort.direction === 'asc' ? '▲' : '▼';
      }
    } else {
      th.classList.remove('active-sort');
      if (indicator) {
        indicator.textContent = '↕';
      }
    }
  });
}

// ============================================================================
// 9. FILTER & SORT ORCHESTRATION
// ============================================================================
function applyFilterAndSort() {
  const query = state.searchQuery.toLowerCase();

  // 1. Search Filter
  let filtered = state.rawStudents.filter(student => {
    if (!query) return true;
    const matchRoll = student.rollNo.toLowerCase().includes(query);
    const matchName = student.name.toLowerCase().includes(query);
    return matchRoll || matchName;
  });

  // 2. Sort
  filtered = sortRecords(filtered, state.currentSort.column, state.currentSort.direction);

  state.filteredStudents = filtered;

  // 3. Update UI
  updateDashboardStats();
  updateSortHeadersUI();
  renderTable();
  updateCounters();
}

// ============================================================================
// 10. TABLE RENDERING
// ============================================================================
/**
 * Generates an initials badge for the student's name
 */
function getInitials(name) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Returns a styled score badge class based on percentage or SGPA
 */
function getScoreBadgeClass(val, type = 'percentage') {
  if (type === 'percentage') {
    if (val >= 85) return 'score-high';
    if (val >= 70) return 'score-medium';
    return 'score-standard';
  } else {
    // SGPA out of 10
    if (val >= 8.0) return 'score-high';
    if (val >= 7.0) return 'score-medium';
    return 'score-standard';
  }
}

/**
 * Renders the student rows into the table body.
 */
function renderTable() {
  const tbody = DOM.studentsTableBody;
  tbody.innerHTML = '';

  const records = state.filteredStudents;

  // Handle Empty State
  if (records.length === 0) {
    DOM.studentsTable.style.display = 'none';
    DOM.emptyState.style.display = 'flex';
    if (state.searchQuery) {
      DOM.emptyStateDesc.textContent = `No student matches "${state.searchQuery}". Check the roll number or student name spelling.`;
      DOM.resetSearchBtn.style.display = 'inline-flex';
    } else {
      DOM.emptyStateDesc.textContent = 'No student records are currently available to display.';
      DOM.resetSearchBtn.style.display = 'none';
    }
    return;
  }

  // Show Table & Hide Empty State
  DOM.emptyState.style.display = 'none';
  DOM.errorState.style.display = 'none';
  DOM.studentsTable.style.display = 'table';

  const fragment = document.createDocumentFragment();

  records.forEach((student, index) => {
    const tr = document.createElement('tr');

    // Display row number or preserve original Sr No
    const displaySrNo = student.srNo || (index + 1);
    const initials = getInitials(student.name);

    tr.innerHTML = `
      <td class="sr-cell">${displaySrNo}</td>
      <td>
        <span class="roll-badge">${escapeHtml(student.rollNo)}</span>
      </td>
      <td>
        <div class="student-name-cell">
          <div class="avatar-circle" aria-hidden="true">${initials}</div>
          <span class="student-name-text">${escapeHtml(student.name)}</span>
        </div>
      </td>
      <td class="numeric-col">
        <span class="score-badge ${getScoreBadgeClass(student.tenth, 'percentage')}">
          ${student.tenth.toFixed(1)}%
        </span>
      </td>
      <td class="numeric-col">
        <span class="score-badge ${getScoreBadgeClass(student.twelfth, 'percentage')}">
          ${student.twelfth.toFixed(1)}%
        </span>
      </td>
      <td class="numeric-col">
        <span class="score-badge ${getScoreBadgeClass(student.sem1, 'sgpa')}">
          ${student.sem1.toFixed(2)}
        </span>
      </td>
      <td class="numeric-col">
        <span class="score-badge ${getScoreBadgeClass(student.sem2, 'sgpa')}">
          ${student.sem2.toFixed(2)}
        </span>
      </td>
    `;

    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

/**
 * Escapes HTML strings to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Updates record counts and sync timestamp.
 */
function updateCounters() {
  DOM.displayedCount.textContent = state.filteredStudents.length;
  DOM.totalCount.textContent = state.rawStudents.length;

  if (state.lastUpdated) {
    const timeStr = state.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    DOM.lastSyncTime.textContent = `Last updated: ${timeStr}`;
  }
}

// ============================================================================
// 11. UI STATE HELPERS (Loading, Error, Banner, Status)
// ============================================================================
function setLoadingState(isLoading) {
  state.isLoading = isLoading;

  if (isLoading) {
    DOM.tableLoading.style.display = 'flex';
    DOM.studentsTable.style.display = 'none';
    DOM.emptyState.style.display = 'none';
    DOM.errorState.style.display = 'none';
    DOM.refreshIcon.classList.add('spinning');
    DOM.refreshBtn.disabled = true;
  } else {
    DOM.tableLoading.style.display = 'none';
    DOM.refreshIcon.classList.remove('spinning');
    DOM.refreshBtn.disabled = false;
  }
}

function showErrorState(errorMsg) {
  DOM.studentsTable.style.display = 'none';
  DOM.emptyState.style.display = 'none';
  DOM.tableLoading.style.display = 'none';
  DOM.errorState.style.display = 'flex';
  DOM.errorMessage.textContent = errorMsg || 'Unable to connect to Google Sheets API.';

  updateApiStatus('error', 'API Connection Failed');
  showBanner("Connection failed: Please check your Google Apps Script Web App URL and deployment settings.", "error");
}

function hideErrorState() {
  DOM.errorState.style.display = 'none';
}

function showEmptyData(message) {
  DOM.studentsTable.style.display = 'none';
  DOM.emptyState.style.display = 'flex';
  DOM.emptyStateDesc.textContent = message;
}

function updateApiStatus(status, text) {
  DOM.apiStatusBadge.className = 'meta-badge live-status-badge';

  if (status === 'connected') {
    DOM.apiStatusBadge.classList.add('status-connected');
  } else if (status === 'demo') {
    DOM.apiStatusBadge.classList.add('status-demo');
  } else if (status === 'error') {
    DOM.apiStatusBadge.classList.add('status-error');
  }

  DOM.apiStatusText.textContent = text;
}

function showBanner(text, type = 'info') {
  DOM.statusBanner.className = 'status-banner';
  if (type === 'warning') DOM.statusBanner.classList.add('banner-warning');
  if (type === 'error') DOM.statusBanner.classList.add('banner-error');
  if (type === 'success') DOM.statusBanner.classList.add('banner-success');

  const icons = {
    info: 'ℹ️',
    warning: '💡',
    error: '⚠️',
    success: '✅'
  };

  DOM.bannerIcon.textContent = icons[type] || 'ℹ️';
  DOM.bannerText.textContent = text;
  DOM.statusBanner.style.display = 'flex';
}

function hideBanner() {
  DOM.statusBanner.style.display = 'none';
}

// ============================================================================
// 12. EVENT LISTENERS
// ============================================================================
function initEventListeners() {
  // Search input & clear
  DOM.searchInput.addEventListener('input', handleSearchInput);
  DOM.searchClearBtn.addEventListener('click', clearSearch);
  DOM.resetSearchBtn.addEventListener('click', clearSearch);

  // Sorting dropdown
  DOM.sortSelector.addEventListener('change', handleDropdownSort);

  // Table header click sorting
  DOM.sortableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-column');
      if (col) handleHeaderSort(col);
    });
  });

  // Refresh button
  DOM.refreshBtn.addEventListener('click', () => {
    fetchStudentRecords();
  });

  // Error state retry & fallback buttons
  DOM.retryBtn.addEventListener('click', () => {
    fetchStudentRecords();
  });

  DOM.fallbackBtn.addEventListener('click', () => {
    loadSampleData("Loaded sample records for demonstration.");
  });

  // Banner close button
  DOM.bannerCloseBtn.addEventListener('click', hideBanner);
}

// ============================================================================
// 13. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  fetchStudentRecords();
});
