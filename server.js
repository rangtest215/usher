const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config()

// Initialize Firebase
if (!process.env.FIREBASE_PRIVATE_KEY) {
    console.error('CRITICAL ERROR: FIREBASE_PRIVATE_KEY is missing in environment variables!');
    process.exit(1);
}

let privateKey = process.env.FIREBASE_PRIVATE_KEY;

// 1. Remove surrounding quotes if the user copied them from .env or Railway UI
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
}

// 2. Handle escaped newlines (turn string "\n" into actual newlines)
// This is critical for Railway as pasted keys often lose formatting
if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
}

try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
        })
    });
    console.log('Firebase Admin Initialized Successfully');
} catch (error) {
    console.error('CRITICAL ERROR: Firebase Initialization Failed.');
    console.error('Check your FIREBASE_PRIVATE_KEY format in Railway.');
    console.error('Ensure it includes -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----');
    console.error(error);
    process.exit(1);
}

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
    const { month } = req.query;

    try {
        const rostersSnapshot = await db.collection('rosters').get();
        const availabilitySnapshot = await db.collection('availability').get();

        const rosters = {};
        rostersSnapshot.forEach(doc => {
            rosters[doc.id] = doc.data();
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
        await db.collection('rosters').doc(rosterKey).set(positions);
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
