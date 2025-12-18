const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Get Sundays for a given month (YYYY-MM)
app.get('/api/dates', (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'Month required' });

    const [year, monthIndex] = month.split('-').map(Number);
    const sundays = [];
    const date = new Date(year, monthIndex - 1, 1);

    // Navigate to first Sunday
    while (date.getDay() !== 0) {
        date.setDate(date.getDate() + 1);
    }

    // Collect all Sundays in month
    while (date.getMonth() === monthIndex - 1) {
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        sundays.push(localDate.toISOString().split('T')[0]);
        date.setDate(date.getDate() + 7);
    }

    res.json({ sundays });
});

// Submit/Update Availability
app.post('/api/availability', async (req, res) => {
    const { name, phone, availability, serviceSession } = req.body;
    if (!name || !phone || !availability || !serviceSession) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const userKey = `${name}-${phone}`;
    const userRef = db.collection('availability').doc(userKey);

    try {
        // Use set with merge to update or create
        await userRef.set({
            name,
            phone,
            serviceSession,
            dates: availability // Merging handled by Firestore deep merge? No, 'dates' object replaces. We need deep merge or read-modify-write.
            // Actually, availability input is partial. If we want to merge dates, we should use dot notation or read first.
            // For simplicity in this app context, let's read-modify-write or assume client sends full month availability? 
            // Client sends "availability" which is { "YYYY-MM-DD": true/false }.
            // If we blindly set dates: availability, we might overwrite other months if we stored them nested.
            // But here we structure likely as flat map under 'dates'.
        }, { merge: true });

        // Wait, if we use { merge: true }, top level fields merge. Nested fields like 'dates' might replace the whole object if we pass 'dates': {...}.
        // To properly merge a map in Firestore, we need dot notation: "dates.2025-01-01": true.
        // Let's do that transformation.

        const updateData = {
            name,
            phone,
            serviceSession
        };

        // Construct dot notation for dates to merge them
        for (const [date, status] of Object.entries(availability)) {
            updateData[`dates.${date}`] = status;
        }

        await userRef.update(updateData).catch(async (e) => {
            // If document doesn't exist, update fails. fallback to set.
            if (e.code === 5) { // NOT_FOUND
                await userRef.set({
                    name, phone, serviceSession, dates: availability
                });
            } else {
                throw e;
            }
        });

        res.json({ success: true, message: 'Availability saved' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Roster & Availability (Admin Dashboard & Search)
app.get('/api/roster', async (req, res) => {
    const { month } = req.query; // Filter logic can be done client side as before for simplicity, or we can query.
    // Client expects: { rosters: {}, allAvailability: {} }

    try {
        const rostersSnapshot = await db.collection('rosters').get();
        const availabilitySnapshot = await db.collection('availability').get();

        const rosters = {};
        rostersSnapshot.forEach(doc => {
            rosters[doc.id] = doc.data(); // doc.id is 'YYYY-MM-DD_session'
        });

        const allAvailability = {};
        availabilitySnapshot.forEach(doc => {
            allAvailability[doc.id] = doc.data();
        });

        res.json({ rosters, allAvailability });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// Save Roster Assignment
app.post('/api/roster', async (req, res) => {
    const { date, session, positions } = req.body;

    const rosterKey = `${date}_${session}`;

    try {
        await db.collection('rosters').doc(rosterKey).set(positions); // Overwrite positions for this session
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Firebase initialized');
});
