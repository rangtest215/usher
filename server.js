const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Helper to read data
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { rosters: {}, availability: {} };
    }
    const data = fs.readFileSync(DATA_FILE);
    return JSON.parse(data);
}

// Helper to write data
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get Sundays for a given month (YYYY-MM)
app.get('/api/dates', (req, res) => {
    const { month } = req.query; // Format: YYYY-MM
    if (!month) return res.status(400).json({ error: 'Month is required' });

    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(year, monthIndex - 1, 1);
    const sundays = [];

    while (date.getMonth() === monthIndex - 1) {
        if (date.getDay() === 0) {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            sundays.push(`${yyyy}-${mm}-${dd}`);
        }
        date.setDate(date.getDate() + 1);
    }
    res.json({ sundays });
});

// Submit Availability
app.post('/api/availability', (req, res) => {
    const { name, phone, availability, serviceSession } = req.body; // availability: { "YYYY-MM-DD": true/false }
    if (!name || !phone || !availability || !serviceSession) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const data = readData();
    const userKey = `${name}-${phone}`;

    // Initialize user availability if not exists
    if (!data.availability[userKey]) {
        data.availability[userKey] = { name, phone, serviceSession, dates: {} };
    } else {
        data.availability[userKey].serviceSession = serviceSession;
    }

    // Merge new availability
    Object.assign(data.availability[userKey].dates, availability);

    writeData(data);
    res.json({ success: true, message: 'Availability saved' });
});

// Get Roster data for admin
app.get('/api/roster', (req, res) => {
    const { month } = req.query;
    const data = readData();
    res.json({
        rosters: data.rosters,
        allAvailability: data.availability
    });
});

// Save Roster
app.post('/api/roster', (req, res) => {
    const { date, session, positions } = req.body;
    if (!date || !session || !positions) return res.status(400).json({ error: 'Missing fields' });

    const data = readData();
    const rosterKey = `${date}_${session}`; // Key by date AND session
    data.rosters[rosterKey] = positions;

    writeData(data);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
