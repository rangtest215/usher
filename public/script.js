// script.js

// API Base URL
const API_URL = '/api';

// Utility: Generate Month Options (Next 12 months)
function populateMonthSelect(selectElementId) {
    const select = document.getElementById(selectElementId);
    if (!select) return;

    const today = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM Local
        const text = d.toLocaleDateString('default', { year: 'numeric', month: 'long' });

        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }
}

// ------ Member View Logic ------
async function loadMemberView() {
    const monthSelect = document.getElementById('monthSelect');
    if (!monthSelect) return; // Not on member page

    populateMonthSelect('monthSelect');

    monthSelect.addEventListener('change', async () => {
        const month = monthSelect.value;
        const dateList = document.getElementById('dateList');
        dateList.innerHTML = '<p style="text-align:center; color: var(--text-muted);">Loading dates...</p>';

        try {
            const res = await fetch(`${API_URL}/dates?month=${month}`);
            const data = await res.json();
            renderDateList(data.sundays);
        } catch (e) {
            dateList.innerHTML = '<p style="color:red; text-align:center;">Error loading dates</p>';
        }
    });

    document.getElementById('availabilityForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted');
        const name = document.getElementById('name').value;
        const phone = document.getElementById('phone').value;
        const serviceSession = document.getElementById('sessionSelect').value;
        const month = document.getElementById('monthSelect').value;

        if (!serviceSession) {
            alert('Please select your Service Session');
            return;
        }

        if (!month) {
            alert('Please select a month');
            return;
        }

        const availability = {};
        const selects = document.querySelectorAll('.availability-select');
        selects.forEach(select => {
            if (select.value === 'yes') {
                availability[select.dataset.date] = true;
            } else if (select.value === 'no') {
                availability[select.dataset.date] = false;
            }
        });

        try {
            const res = await fetch(`${API_URL}/availability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, availability, serviceSession })
            });
            const result = await res.json();
            if (result.success) {
                alert('Availability saved! Thank you.');
            } else {
                alert('Error saving: ' + result.error);
            }
        } catch (e) {
            alert('Network error');
        }
    });
}

function renderDateList(sundays) {
    const dateList = document.getElementById('dateList');
    dateList.innerHTML = '';

    if (sundays.length === 0) {
        dateList.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No Sundays found for this month.</p>';
        return;
    }

    sundays.forEach(dateStr => {
        // Parse YYYY-MM-DD manually to prevent timezone shifts
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d); // Local time construction
        const formattedDate = dateObj.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'short' });

        const div = document.createElement('div');
        div.className = 'date-item';

        div.innerHTML = `
            <span class="date-label">${formattedDate}</span>
            <select class="availability-select" data-date="${dateStr}">
                <option value="unknown">Select...</option>
                <option value="yes">Available</option>
                <option value="no">Not Available</option>
            </select>
        `;
        dateList.appendChild(div);
    });
}

// ------ Admin View Logic ------
let currentRosters = {};
let currentAvailability = {};
let currentMonthSundays = [];

async function loadAdminView() {
    const monthSelect = document.getElementById('adminMonthSelect');
    const sessionSelect = document.getElementById('adminSessionSelect');
    if (!monthSelect) return;

    populateMonthSelect('adminMonthSelect');

    const refresh = async () => {
        const month = monthSelect.value;
        const session = sessionSelect.value;
        if (month && session) {
            await loadAdminData(month, session);
        }
    };

    monthSelect.addEventListener('change', refresh);
    sessionSelect.addEventListener('change', refresh);
}

async function loadAdminData(month, session) {
    const container = document.getElementById('rosterContainer');
    container.innerHTML = '<p style="text-align:center;">Loading roster data...</p>';

    try {
        // 1. Get Dates
        const dateRes = await fetch(`${API_URL}/dates?month=${month}`);
        const dateData = await dateRes.json();
        currentMonthSundays = dateData.sundays;

        // 2. Get Roster & Availability (Fetching all, filtering locally)
        const rosterRes = await fetch(`${API_URL}/roster?month=${month}`);
        const rosterData = await rosterRes.json();

        currentRosters = rosterData.rosters;
        currentAvailability = rosterData.allAvailability;

        renderRosterTables(session);
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red; text-align:center;">Error loading data</p>';
    }
}

function renderRosterTables(session) {
    const container = document.getElementById('rosterContainer');
    container.innerHTML = '';

    currentMonthSundays.forEach(dateStr => {
        const section = document.createElement('div');
        section.className = 'card';
        section.style.marginBottom = '2rem';

        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        section.innerHTML = `<h3>${dateObj.toLocaleDateString()} (Session ${session})</h3>`;

        const table = document.createElement('table');
        const roles = ['Door', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

        // Header
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>Role</th><th>Assigned Member</th></tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        const rosterKey = `${dateStr}_${session}`;

        roles.forEach(role => {
            const tr = document.createElement('tr');
            const assignedName = currentRosters[rosterKey]?.[role] || '';

            tr.innerHTML = `
                <td>${role}</td>
                <td>
                    <select class="roster-select" data-date="${dateStr}" data-session="${session}" data-role="${role}">
                        <option value="">-- Select Member --</option>
                        ${getMemberOptions(dateStr, assignedName, session)}
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        section.appendChild(table);

        container.appendChild(section);
    });

    // Add global save button at bottom
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save All Changes';
    saveBtn.onclick = () => saveAllRosters(session);
    container.appendChild(saveBtn);

    // Attach event listeners to update dropdowns dynamically
    document.querySelectorAll('.roster-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const date = e.target.dataset.date;
            const session = e.target.dataset.session;
            const role = e.target.dataset.role;
            const val = e.target.value;

            const key = `${date}_${session}`;
            if (!currentRosters[key]) currentRosters[key] = {};
            currentRosters[key][role] = val;

            updateDropdowns(date, session);
        });
    });
}

function getMemberOptions(dateStr, currentAssigned, session) {
    const availableMembers = [];
    Object.values(currentAvailability).forEach(user => {
        // Filter by Session AND Date availability
        if (user.dates && user.dates[dateStr] === true && String(user.serviceSession) === String(session)) {
            availableMembers.push(user.name);
        }
    });

    if (currentAssigned && !availableMembers.includes(currentAssigned)) {
        availableMembers.push(currentAssigned);
    }

    return availableMembers.map(name => {
        const isSelected = name === currentAssigned ? 'selected' : '';
        return `<option value="${name}" ${isSelected}>${name}</option>`;
    }).join('');
}

function updateDropdowns(dateStr, session) {
    const key = `${dateStr}_${session}`;
    const assignments = currentRosters[key] || {};
    const assignedNames = Object.values(assignments).filter(n => n);

    const selects = document.querySelectorAll(`.roster-select[data-date="${dateStr}"][data-session="${session}"]`);

    selects.forEach(select => {
        const currentVal = select.value;
        const role = select.dataset.role;

        const baseOptions = getMemberOptionsRaw(dateStr, session);

        const validOptions = baseOptions.filter(name => {
            return name === currentVal || !assignedNames.includes(name);
        });

        const previousVal = select.value;

        select.innerHTML = '<option value="">-- Select Member --</option>';
        validOptions.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === previousVal) opt.selected = true;
            select.appendChild(opt);
        });
    });
}

function getMemberOptionsRaw(dateStr, session) {
    const availableMembers = [];
    Object.values(currentAvailability).forEach(user => {
        if (user.dates && user.dates[dateStr] === true && String(user.serviceSession) === String(session)) {
            availableMembers.push(user.name);
        }
    });
    return availableMembers;
}

async function saveAllRosters(session) {
    const updates = [];

    for (const [key, positions] of Object.entries(currentRosters)) {
        const [date, sess] = key.split('_');
        if (sess !== session) continue;

        updates.push(fetch(`${API_URL}/roster`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, session: sess, positions })
        }));
    }

    try {
        await Promise.all(updates);
        alert('All rosters saved successfully!');
    } catch (e) {
        alert('Error saving some rosters.');
    }
}

// ------ Search Roster Logic ------
async function loadSearchRosterView() {
    const searchForm = document.getElementById('searchForm');
    if (!searchForm) return;

    const monthSelect = document.getElementById('searchMonth');
    const dateSelect = document.getElementById('searchDate');

    // 1. Populate Month
    populateMonthSelect('searchMonth');

    // 2. Handle Month Change -> Populate Dates
    monthSelect.addEventListener('change', async () => {
        const month = monthSelect.value;
        dateSelect.innerHTML = '<option value="">Loading...</option>';

        try {
            const res = await fetch(`${API_URL}/dates?month=${month}`);
            const data = await res.json();

            dateSelect.innerHTML = '<option value="">-- Select Sunday --</option>';
            data.sundays.forEach(dateStr => {
                const [y, m, d] = dateStr.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const display = dateObj.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });

                const opt = document.createElement('option');
                opt.value = dateStr;
                opt.textContent = display;
                dateSelect.appendChild(opt);
            });
        } catch (e) {
            dateSelect.innerHTML = '<option value="">Error loading dates</option>';
        }
    });

    // Trigger initial load if month is auto-selected (usually first option)
    if (monthSelect.value) {
        monthSelect.dispatchEvent(new Event('change'));
    }

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateStr = document.getElementById('searchDate').value;
        const session = document.getElementById('searchSession').value;
        const container = document.getElementById('searchResult');

        if (!dateStr || !session) {
            alert("Please select both a date and a session.");
            return;
        }

        container.innerHTML = '<p style="text-align:center;">Searching...</p>';

        try {
            const month = dateStr.slice(0, 7); // YYYY-MM

            const res = await fetch(`${API_URL}/roster?month=${month}`);
            const data = await res.json();

            // Update G_vars so helpers work
            currentAvailability = data.allAvailability;
            currentRosters = data.rosters;

            const rosterKey = `${dateStr}_${session}`;
            const roster = currentRosters[rosterKey] || {};

            // Render Single Table
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);

            let html = `
                <div class="card">
                    <h3>${dateObj.toLocaleDateString()} (Session ${session})</h3>
                    <table>
                        <thead>
                            <tr><th>Role</th><th>Assigned Member</th></tr>
                        </thead>
                        <tbody>
            `;

            const roles = ['Door', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
            roles.forEach(role => {
                const assignedName = roster[role] || '';

                html += `
                    <tr>
                        <td>${role}</td>
                        <td>
                            <select class="roster-select" data-date="${dateStr}" data-session="${session}" data-role="${role}">
                                <option value="">-- Select Member --</option>
                                ${getMemberOptions(dateStr, assignedName, session)}
                            </select>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table>`;

            // Add Save Button
            html += `
                <div style="margin-top: 1rem; text-align: right;">
                    <button id="saveSearchRosterBtn" class="btn">Save Changes</button>
                </div>
            `;

            html += `</div>`;
            container.innerHTML = html;

            // Attach Save Handler
            document.getElementById('saveSearchRosterBtn').addEventListener('click', () => {
                saveAllRosters(session);
            });

            // Trigger Smart Filtering Initial Pass
            updateDropdowns(dateStr, session);

            // Attach Change Handlers
            document.querySelectorAll('.roster-select').forEach(select => {
                select.addEventListener('change', (e) => {
                    const date = e.target.dataset.date;
                    const session = e.target.dataset.session;
                    const role = e.target.dataset.role;
                    const val = e.target.value;

                    const key = `${date}_${session}`;
                    if (!currentRosters[key]) currentRosters[key] = {};
                    currentRosters[key][role] = val;

                    updateDropdowns(date, session);
                });
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = '<p style="color:red; text-align:center;">Error searching roster</p>';
        }
    });
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadMemberView();
    loadAdminView();
    loadSearchRosterView();
});
