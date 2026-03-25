require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/');
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

app.use(express.json());

function isUnknownColumnError(err) {
    return Boolean(err && (err.code === 'ER_BAD_FIELD_ERROR' || Number(err.errno) === 1054));
}

app.use(express.static('public'));

//////////////////////////////////////
// ROUTES TO SERVE HTML FILES
//////////////////////////////////////
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/html/logon.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/html/dashboard.html');
});

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/html/profile.html');
});

app.get('/ratings', (req, res) => {
    res.sendFile(__dirname + '/public/html/ratings.html');
});

app.get('/friends', (req, res) => {
    res.sendFile(__dirname + '/public/html/friends.html');
});

app.get('/subscriptions', (req, res) => {
    res.sendFile(__dirname + '/public/html/subscriptions.html');
});

app.get('/movies', (req, res) => {
    res.sendFile(__dirname + '/public/html/movies.html');
});

app.get('/shows', (req, res) => {
    res.sendFile(__dirname + '/public/html/shows.html');
});

app.get('/title-details', (req, res) => {
    res.sendFile(__dirname + '/public/html/title-details.html');
});

app.get('/suggestions', (req, res) => {
    res.sendFile(__dirname + '/public/html/suggestions.html');
});

//////////////////////////////////////
// HELPER FUNCTIONS AND AUTH MIDDLEWARE
//////////////////////////////////////
async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access denied. Missing Bearer token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT email FROM user WHERE email = ?',
            [decoded.email]
        );
        await connection.end();

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Account not found.' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
}

//////////////////////////////////////
// AUTH ROUTES
//////////////////////////////////////
app.post('/api/create-account', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);

        await connection.execute(
            'INSERT INTO user (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        await connection.end();
        return res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'An account with this email already exists.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Error creating account.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );
        await connection.end();

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        return res.status(200).json({ token });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error logging in.' });
    }
});

//////////////////////////////////////
// WATCH HISTORY
//////////////////////////////////////
app.get('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT wh.id, wh.title, wh.type, wh.watched_at, r.rating, r.review
             FROM watch_history wh
             LEFT JOIN rating r ON r.user_email = wh.user_email AND r.title = wh.title AND r.type = wh.type
             WHERE wh.user_email = ?
             ORDER BY wh.watched_at DESC
             LIMIT 50`,
            [req.user.email]
        );
        const [ratingOnlyRows] = await connection.execute(
            `SELECT r.id, r.title, r.type, r.rated_at as watched_at, r.rating, r.review
             FROM rating r
             WHERE r.user_email = ?
             AND NOT EXISTS (SELECT 1 FROM watch_history wh WHERE wh.user_email = r.user_email AND wh.title = r.title AND wh.type = r.type)
             ORDER BY r.rated_at DESC`,
            [req.user.email]
        );
        await connection.end();
        const fromWh = rows.map(r => ({ ...r, watched_at: r.watched_at }));
        const fromRatings = ratingOnlyRows.map(r => ({ ...r, id: r.id + 1000000 }));
        const watchHistory = [...fromWh, ...fromRatings]
            .sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at))
            .slice(0, 50);
        res.status(200).json({ watchHistory });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving watch history.' });
    }
});

app.post('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const titleTrim = (title || '').trim();
    const contentType = type === 'show' ? 'show' : 'movie';

    if (!titleTrim) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();

        await connection.execute(
            'INSERT INTO watch_history (user_email, title, type) VALUES (?, ?, ?)',
            [req.user.email, titleTrim, contentType]
        );

        try {
            await connection.execute(
                `INSERT INTO watch_status (user_email, title, type, status)
                 VALUES (?, ?, ?, 'completed')
                 ON DUPLICATE KEY UPDATE status = 'completed'`,
                [req.user.email, titleTrim, contentType]
            );
        } catch (statusErr) {
            if (statusErr.code !== 'ER_NO_SUCH_TABLE') {
                console.error('watch_status:', statusErr.message);
            }
        }

        await connection.end();
        res.status(201).json({ message: 'Added to watch history and marked as completed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to watch history.' });
    }
});

app.delete('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const titleTrim = (title || '').trim();
    const contentType = type === 'show' ? 'show' : 'movie';

    if (!titleTrim) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'DELETE FROM watch_history WHERE user_email = ? AND title = ? AND type = ?',
            [req.user.email, titleTrim, contentType]
        );
        await connection.end();
        res.status(200).json({ message: 'Removed from watch history.', deleted: result.affectedRows > 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting from watch history.' });
    }
});

//////////////////////////////////////
// RATINGS
//////////////////////////////////////
app.get('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT id, title, type, rating, review, rated_at FROM rating WHERE user_email = ? ORDER BY rated_at DESC',
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ ratings: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving ratings.' });
    }
});

app.post('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type, rating, review } = req.body;

    if (!title || !rating) {
        return res.status(400).json({ message: 'Title and rating are required.' });
    }

    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: 'Rating must be 1-5.' });
    }

    const contentType = type === 'show' ? 'show' : 'movie';

    try {
        const connection = await createConnection();

        await connection.execute(
            'INSERT INTO rating (user_email, title, type, rating, review) VALUES (?, ?, ?, ?, ?)',
            [req.user.email, title, contentType, r, review || null]
        );

        try {
            await connection.execute(
                'INSERT INTO watch_history (user_email, title, type) VALUES (?, ?, ?)',
                [req.user.email, title, contentType]
            );
        } catch (whErr) {
            // ignore duplicate entry errors
        }

        try {
            await connection.execute(
                `INSERT INTO watch_status (user_email, title, type, status)
                 VALUES (?, ?, ?, 'completed')
                 ON DUPLICATE KEY UPDATE status = 'completed'`,
                [req.user.email, title, contentType]
            );
        } catch (statusErr) {
            if (statusErr.code !== 'ER_NO_SUCH_TABLE') console.error('watch_status:', statusErr.message);
        }

        await connection.end();
        res.status(201).json({ message: 'Rating added.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding rating.' });
    }
});

app.put('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type, rating, review } = req.body;
    const titleTrim = (title || '').trim();

    if (!titleTrim || !rating) {
        return res.status(400).json({ message: 'Title and rating are required.' });
    }

    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: 'Rating must be 1-5.' });
    }

    const contentType = type === 'show' ? 'show' : 'movie';

    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'UPDATE rating SET rating = ?, review = ? WHERE user_email = ? AND title = ? AND type = ?',
            [r, review || null, req.user.email, titleTrim, contentType]
        );

        if (result.affectedRows === 0) {
            await connection.execute(
                'INSERT INTO rating (user_email, title, type, rating, review) VALUES (?, ?, ?, ?, ?)',
                [req.user.email, titleTrim, contentType, r, review || null]
            );
        }

        await connection.end();
        res.status(200).json({ message: 'Rating updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating rating.' });
    }
});

app.delete('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const titleTrim = (title || '').trim();
    const contentType = type === 'show' ? 'show' : 'movie';

    if (!titleTrim) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'DELETE FROM rating WHERE user_email = ? AND title = ? AND type = ?',
            [req.user.email, titleTrim, contentType]
        );
        await connection.end();
        res.status(200).json({ message: 'Rating removed.', deleted: result.affectedRows > 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting rating.' });
    }
});

//////////////////////////////////////
// LISTS
//////////////////////////////////////
app.post('/api/dashboard/lists', authenticateToken, async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'List name is required.' });
    }

    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'INSERT INTO list (user_email, name) VALUES (?, ?)',
            [req.user.email, name]
        );
        await connection.end();
        return res.status(201).json({ message: 'List created.', listId: result.insertId });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error creating list.' });
    }
});

app.post('/api/dashboard/lists/:listId/items', authenticateToken, async (req, res) => {
    const { listId } = req.params;
    const { title } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();
        const [lists] = await connection.execute(
            'SELECT id FROM list WHERE id = ? AND user_email = ?',
            [listId, req.user.email]
        );

        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }

        await connection.execute(
            'INSERT INTO list_item (list_id, title) VALUES (?, ?)',
            [listId, title]
        );

        await connection.end();
        res.status(201).json({ message: 'Item added to list.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to list.' });
    }
});

app.delete('/api/dashboard/lists/:listId/items', authenticateToken, async (req, res) => {
    const { listId } = req.params;
    const { title } = req.body;
    const titleTrim = (title || '').trim();

    if (!titleTrim) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();
        const [lists] = await connection.execute(
            'SELECT id FROM list WHERE id = ? AND user_email = ?',
            [listId, req.user.email]
        );

        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }

        const [result] = await connection.execute(
            'DELETE FROM list_item WHERE list_id = ? AND TRIM(title) = ?',
            [listId, titleTrim]
        );

        await connection.end();
        res.status(200).json({ message: 'Item removed from list.', deleted: result.affectedRows > 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error removing from list.' });
    }
});

app.delete('/api/dashboard/lists/:listId', authenticateToken, async (req, res) => {
    const listId = parseInt(String(req.params.listId), 10);
    if (!Number.isFinite(listId) || listId < 1) {
        return res.status(400).json({ message: 'Invalid list id.' });
    }

    try {
        const connection = await createConnection();
        const [lists] = await connection.execute(
            'SELECT id FROM list WHERE id = ? AND user_email = ?',
            [listId, req.user.email]
        );
        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }
        await connection.execute('DELETE FROM list_item WHERE list_id = ?', [listId]);
        await connection.execute('DELETE FROM list WHERE id = ? AND user_email = ?', [listId, req.user.email]);
        await connection.end();
        res.status(200).json({ message: 'List deleted.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting list.' });
    }
});

app.get('/api/dashboard/lists', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [lists] = await connection.execute(
            'SELECT id, name, created_at FROM list WHERE user_email = ? ORDER BY created_at ASC',
            [req.user.email]
        );

        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                'SELECT id, title, added_at FROM list_item WHERE list_id = ? ORDER BY added_at DESC',
                [list.id]
            );
            listsWithItems.push({ ...list, items });
        }

        await connection.end();
        return res.status(200).json({ lists: listsWithItems });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error retrieving lists.' });
    }
});

//////////////////////////////////////
// WATCH STATUS
//////////////////////////////////////
app.get('/api/dashboard/status', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const email = req.user.email;

        try {
            const [whRows] = await connection.execute(
                'SELECT title, type FROM watch_history WHERE user_email = ?',
                [email]
            );
            for (const row of whRows) {
                await connection.execute(
                    `INSERT INTO watch_status (user_email, title, type, status)
                     VALUES (?, ?, ?, 'completed')
                     ON DUPLICATE KEY UPDATE status = 'completed'`,
                    [email, row.title, row.type || 'movie']
                );
            }
        } catch (syncErr) {
            if (syncErr.code !== 'ER_NO_SUCH_TABLE') {
                console.error('watch_status sync:', syncErr.message);
            }
        }

        const [rows] = await connection.execute(
            `SELECT id, title, type, status, updated_at
             FROM watch_status
             WHERE user_email = ?
             ORDER BY updated_at DESC`,
            [email]
        );

        await connection.end();
        return res.status(200).json({ statuses: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error retrieving statuses.' });
    }
});

app.post('/api/dashboard/status', authenticateToken, async (req, res) => {
    const { title, type, status } = req.body;

    if (!title || !status) {
        return res.status(400).json({ message: 'Title and status required.' });
    }

    const t = type === 'show' ? 'show' : 'movie';
    const allowed = new Set(['watching', 'completed', 'want_to_watch']);

    if (!allowed.has(status)) {
        return res.status(400).json({ message: 'Invalid status.' });
    }

    try {
        const connection = await createConnection();
        await connection.execute(
            `INSERT INTO watch_status (user_email, title, type, status)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               status = VALUES(status),
               type = VALUES(type),
               updated_at = CURRENT_TIMESTAMP`,
            [req.user.email, title, t, status]
        );
        await connection.end();
        return res.status(200).json({ message: 'Status saved.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error saving status.' });
    }
});

app.delete('/api/dashboard/status', authenticateToken, async (req, res) => {
    const { title } = req.body;
    const titleTrim = (title || '').trim();

    if (!titleTrim) {
        return res.status(400).json({ message: 'Title is required.' });
    }

    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'DELETE FROM watch_status WHERE user_email = ? AND title = ?',
            [req.user.email, titleTrim]
        );
        await connection.end();
        return res.status(200).json({ message: 'Status removed.', deleted: result.affectedRows > 0 });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error deleting status.' });
    }
});

//////////////////////////////////////
// PROFILE
//////////////////////////////////////
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT email, username, first_name AS firstName, last_name AS lastName, bio, profile_picture AS profilePicture, is_private AS isPrivate FROM user WHERE email = ?',
            [req.user.email]
        );
        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving profile.' });
    }
});

app.put('/api/profile', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    const { firstName, lastName, bio, newPassword, username, isPrivate } = req.body;

    try {
        const connection = await createConnection();

        if (username && username.trim()) {
            const [existing] = await connection.execute(
                'SELECT email FROM user WHERE username = ? AND email != ?',
                [username.trim(), req.user.email]
            );
            if (existing.length > 0) {
                await connection.end();
                return res.status(409).json({ message: 'Username is already taken.' });
            }
        }

        let passwordClause = '';
        const params = [username, firstName, lastName, bio, isPrivate === 'true' || isPrivate === true ? 1 : 0];

        if (newPassword && newPassword.trim().length >= 6) {
            const hashed = await bcrypt.hash(newPassword, 10);
            passwordClause = ', password = ?';
            params.push(hashed);
        }

        let picClause = '';
        if (req.file) {
            const picPath = `/images/${req.file.filename}`;
            picClause = ', profile_picture = ?';
            params.push(picPath);
        }

        params.push(req.user.email);

        await connection.execute(
            `UPDATE user SET username = ?, first_name = ?, last_name = ?, bio = ?, is_private = ?${passwordClause}${picClause} WHERE email = ?`,
            params
        );

        await connection.end();
        res.status(200).json({ message: 'Profile updated successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating profile.' });
    }
});

app.get('/api/profile/:email', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute(
            'SELECT email, username, first_name AS firstName, last_name AS lastName, bio, profile_picture AS profilePicture, is_private FROM user WHERE email = ?',
            [email]
        );

        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const target = rows[0];

        if (target.is_private) {
            const [friendCheck] = await connection.execute(
                `SELECT id FROM friend_request
                 WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
                 AND status = 'accepted'`,
                [req.user.email, email, email, req.user.email]
            );
            if (friendCheck.length === 0 && req.user.email !== email) {
                await connection.end();
                return res.status(403).json({ message: 'This profile is private.', isPrivate: true });
            }
        }

        await connection.end();
        const { is_private, ...profileData } = target;
        return res.status(200).json({ ...profileData, isPrivate: !!is_private });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error retrieving profile.' });
    }
});

app.delete('/api/profile', authenticateToken, async (req, res) => {
    const email = req.user.email;
    try {
        const connection = await createConnection();

        await connection.execute('DELETE FROM message WHERE sender_email = ? OR receiver_email = ?', [email, email]);
        await connection.execute('DELETE FROM friend_request WHERE sender_email = ? OR receiver_email = ?', [email, email]);
        await connection.execute('DELETE FROM user_subscription WHERE user_email = ?', [email]);
        await connection.execute('DELETE FROM watch_status WHERE user_email = ?', [email]);

        const [lists] = await connection.execute('SELECT id FROM list WHERE user_email = ?', [email]);
        for (const list of lists) {
            await connection.execute('DELETE FROM list_item WHERE list_id = ?', [list.id]);
        }
        await connection.execute('DELETE FROM list WHERE user_email = ?', [email]);
        await connection.execute('DELETE FROM rating WHERE user_email = ?', [email]);
        await connection.execute('DELETE FROM watch_history WHERE user_email = ?', [email]);
        await connection.execute('DELETE FROM user WHERE email = ?', [email]);

        await connection.end();
        return res.status(200).json({ message: 'Account deleted successfully.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error deleting account.' });
    }
});

//////////////////////////////////////
// SUGGESTIONS
//////////////////////////////////////
app.get('/api/suggestions', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const email = req.user.email;

        const [[{ count: ratingsCount }]] = await connection.execute(
            'SELECT COUNT(*) as count FROM rating WHERE user_email = ?',
            [email]
        );

        const [toRateRows] = await connection.execute(
            `SELECT wh.title, wh.type
             FROM watch_history wh
             LEFT JOIN rating r ON r.user_email = wh.user_email AND LOWER(r.title) = LOWER(wh.title)
             WHERE wh.user_email = ? AND r.id IS NULL
             LIMIT 10`,
            [email]
        );

        const [recRows] = await connection.execute(
            `SELECT DISTINCT r.title, r.type, AVG(r.rating) as avg_rating
             FROM rating r
             WHERE r.user_email != ?
               AND r.rating >= 4
               AND NOT EXISTS (
                   SELECT 1 FROM rating r2
                   WHERE r2.user_email = ? AND LOWER(r2.title) = LOWER(r.title)
               )
             GROUP BY r.title, r.type
             ORDER BY avg_rating DESC
             LIMIT 10`,
            [email, email]
        );

        await connection.end();

        return res.status(200).json({
            ratingsCount,
            toRate: toRateRows,
            recommendations: recRows.map(row => ({
                title: row.title,
                type: row.type || 'movie',
                avgRating: Math.round(parseFloat(row.avg_rating) * 10) / 10
            }))
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error retrieving suggestions.' });
    }
});

//////////////////////////////////////
// USERS
//////////////////////////////////////
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute('SELECT email FROM user');
        await connection.end();
        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});

app.get('/api/users/public', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT email, username, first_name AS firstName, last_name AS lastName,
                    profile_picture AS profilePicture, is_private AS isPrivate
             FROM user
             WHERE email != ?
             ORDER BY username ASC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ users: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving users.' });
    }
});

app.get('/api/users/:email/ratings', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();
        const [privacyCheck] = await connection.execute(
            'SELECT is_private FROM user WHERE email = ?', [email]
        );
        if (privacyCheck.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }
        if (privacyCheck[0].is_private) {
            await connection.end();
            return res.status(403).json({ message: 'This profile is private.', isPrivate: true });
        }
        const [rows] = await connection.execute(
            'SELECT title, type, rating, review, rated_at FROM rating WHERE user_email = ? ORDER BY rated_at DESC',
            [email]
        );
        await connection.end();
        res.status(200).json({ ratings: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving ratings.' });
    }
});

app.get('/api/users/:email/lists', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();
        const [privacyCheck] = await connection.execute(
            'SELECT is_private FROM user WHERE email = ?', [email]
        );
        if (privacyCheck.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }
        if (privacyCheck[0].is_private) {
            await connection.end();
            return res.status(403).json({ message: 'This profile is private.', isPrivate: true });
        }
        const [lists] = await connection.execute(
            'SELECT id, name, created_at FROM list WHERE user_email = ? ORDER BY created_at ASC', [email]
        );
        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                'SELECT id, title, added_at FROM list_item WHERE list_id = ? ORDER BY added_at DESC', [list.id]
            );
            listsWithItems.push({ ...list, items });
        }
        await connection.end();
        res.status(200).json({ lists: listsWithItems });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving lists.' });
    }
});

//////////////////////////////////////
// TMDB
//////////////////////////////////////
// trending
app.get('/api/trending/movies', authenticateToken, async (req, res) => {
    try {
        const page = req.query.page || 1; // ADDED

        const url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}&page=${page}`; // ADDED

        const tmdbRes = await fetch(url);

        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }

        const data = await tmdbRes.json();

        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error calling TMDB.' });
    }
});

app.get('/api/trending/shows', authenticateToken, async (req, res) => {
    try {
        const url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error calling TMDB.' });
    }
});

app.get('/api/tmdb/search', authenticateToken, async (req, res) => {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'movie';

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    try {
        const tmdbType = type === 'tv' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(q)}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error searching TMDB.' });
    }
});

// TMDB movie or TV details (genres, runtime, seasons) for title modal pills
app.get('/api/tmdb/details', authenticateToken, async (req, res) => {
    const rawId = req.query.id;
    const type = String(req.query.type || 'movie').toLowerCase() === 'tv' ? 'tv' : 'movie';

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    const id = parseInt(String(rawId), 10);
    if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: 'Valid numeric id is required.' });
    }

    try {
        const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }
        const d = await tmdbRes.json();

        if (type === 'movie') {
            return res.status(200).json({
                type: 'movie',
                genres: (d.genres || []).map((g) => g.name).filter(Boolean),
                runtime: typeof d.runtime === 'number' && d.runtime > 0 ? d.runtime : null,
                vote_average: typeof d.vote_average === 'number' ? d.vote_average : null,
                release_date: d.release_date || null,
            });
        }

        const ert = d.episode_run_time;
        let episodeRuntime = null;
        if (Array.isArray(ert) && ert.length > 0) {
            const sum = ert.reduce((a, n) => a + (Number(n) || 0), 0);
            episodeRuntime = Math.round(sum / ert.length) || null;
        }

        return res.status(200).json({
            type: 'tv',
            genres: (d.genres || []).map((g) => g.name).filter(Boolean),
            episode_runtime_minutes: episodeRuntime,
            number_of_seasons: typeof d.number_of_seasons === 'number' ? d.number_of_seasons : null,
            vote_average: typeof d.vote_average === 'number' ? d.vote_average : null,
            first_air_date: d.first_air_date || null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading TMDB details.' });
    }
});

app.get('/api/title/providers', authenticateToken, async (req, res) => {
    const { id, type } = req.query;

    if (!id || !type) {
        return res.status(400).json({ message: 'id and type are required.' });
    }

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    try {
        const tmdbType = type === 'show' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${tmdbType}/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        const data = await tmdbRes.json();

        const regionData =
            data?.results?.US ||
            data?.results?.CA ||
            data?.results?.GB ||
            Object.values(data?.results || {})[0] ||
            null;

        if (!regionData) {
            return res.status(200).json({ available: false, providers: [], streamingProviders: [], label: 'Availability unavailable' });
        }

        const streamingProviders = (regionData.flatrate || []).map(p => ({
    provider_id: String(p.provider_id),
    provider_name: p.provider_name
}));

const rentProviders = (regionData.rent || []).map(p => p.provider_name);
const buyProviders = (regionData.buy || []).map(p => p.provider_name);

const allProviders = [
    ...streamingProviders.map(p => p.provider_name),
    ...rentProviders,
    ...buyProviders
];

const uniqueStreamingProviders = streamingProviders;

        return res.status(200).json({
            available: allProviders.length > 0,
            providers: allProviders,
            streamingProviders: uniqueStreamingProviders,
            label: allProviders.length > 0 ? allProviders.slice(0, 3).join(', ') : 'Availability unavailable'
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading providers.' });
    }
});


app.get('/api/title/details', authenticateToken, async (req, res) => {
    const { id, type } = req.query;

    if (!id || !type) {
        return res.status(400).json({ message: 'id and type are required.' });
    }

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    try {
        const tmdbType = type === 'show' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${process.env.TMDB_API_KEY}`;

        const tmdbRes = await fetch(url);

        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }

        const data = await tmdbRes.json();

        return res.status(200).json({
            id: data.id,
            title: data.title || data.name || 'Untitled',
            type: tmdbType === 'tv' ? 'show' : 'movie',
            posterPath: data.poster_path || null,
            overview: data.overview || ''
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading title details.' });
    }
});

app.get('/api/title/related', authenticateToken, async (req, res) => {
    const { id, type } = req.query;

    if (!id || !type) {
        return res.status(400).json({ message: 'id and type are required.' });
    }

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    try {
        const tmdbType = type === 'show' ? 'tv' : 'movie';

        const [similarRes, recommendationsRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/${tmdbType}/${id}/similar?api_key=${process.env.TMDB_API_KEY}`),
            fetch(`https://api.themoviedb.org/3/${tmdbType}/${id}/recommendations?api_key=${process.env.TMDB_API_KEY}`)
        ]);

        const similarData = similarRes.ok ? await similarRes.json() : { results: [] };
        const recommendationsData = recommendationsRes.ok ? await recommendationsRes.json() : { results: [] };

        const combined = [
            ...(similarData.results || []),
            ...(recommendationsData.results || [])
        ];

        const seen = new Set();

        const relatedTitles = combined
            .filter(item => item && item.id)
            .filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            })
            .slice(0, 12)
            .map(item => ({
                id: item.id,
                title: item.title || item.name || 'Untitled',
                type: tmdbType === 'tv' ? 'show' : 'movie',
                posterPath: item.poster_path || null
            }));

        return res.status(200).json({ relatedTitles });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading related titles.' });
    }
});

app.get('/api/movies/by-genre', authenticateToken, async (req, res) => {
    const { genreId, page = 1, with_watch_providers } = req.query;

    if (!genreId) {
        return res.status(400).json({ message: 'genreId is required.' });
    }

    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }

    try {
        let url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&with_genres=${genreId}&page=${page}&watch_region=US`;

if (with_watch_providers) {
    url += `&with_watch_providers=${with_watch_providers}`;
}
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading genre movies.' });
    }
});

app.get('/api/discover/movies', authenticateToken, async (req, res) => {
    const page = req.query.page || 1;
    const providers = req.query.with_watch_providers;
    if (!process.env.TMDB_API_KEY) return res.status(500).json({ message: 'TMDB API key missing' });
    try {
        let url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&page=${page}&watch_region=US`;
        if (providers) url += `&with_watch_providers=${providers}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB discover failed' });
        const data = await tmdbRes.json();
        res.status(200).json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching discover movies' });
    }
});

app.get('/api/movie/:id/providers', authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (!process.env.TMDB_API_KEY) return res.status(500).json({ message: 'TMDB API key missing' });
    try {
        const url = `https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'Provider fetch failed' });
        const data = await tmdbRes.json();
        res.status(200).json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching providers' });
    }
});

app.get('/api/discover/tv', authenticateToken, async (req, res) => {
    const page = req.query.page || 1;
    const providers = req.query.providers;
    if (!process.env.TMDB_API_KEY) return res.status(500).json({ message: 'TMDB API key missing' });
    try {
        let url = `https://api.themoviedb.org/3/discover/tv?api_key=${process.env.TMDB_API_KEY}&page=${page}&watch_region=US`;
        if (providers) url += `&with_watch_providers=${providers}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB discover failed' });
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error fetching discover shows' });
    }
});

app.get('/api/trending/tv', async (req, res) => {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${process.env.TMDB_API_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching trending TV:', error);
        res.status(500).json({ error: 'Failed to fetch trending TV' });
    }
});

app.get('/api/tv/:id/providers', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching TV providers:', error);
        res.status(500).json({ error: 'Failed to fetch TV providers' });
    }
});

//////////////////////////////////////
// SUBSCRIPTIONS
//////////////////////////////////////
app.post('/api/subscriptions', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    const { providers } = req.body;
    try {
        const connection = await createConnection();
        await connection.execute('DELETE FROM user_subscription WHERE user_email = ?', [userEmail]);
        for (const provider of providers) {
            await connection.execute(
                'INSERT INTO user_subscription (user_email, provider_key) VALUES (?, ?)',
                [userEmail, provider]
            );
        }
        await connection.end();
        res.json({ ok: true });
    } catch (err) {
        console.error('SUBSCRIPTION ERROR:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/subscriptions', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT provider_key FROM user_subscription WHERE user_email = ?',
            [userEmail]
        );
        await connection.end();
        const providers = rows.map(r => r.provider_key);
        res.json(providers);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

//////////////////////////////////////
// FRIENDS
//////////////////////////////////////
app.get('/api/friends/search', authenticateToken, async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) return res.status(400).json({ message: 'Query required.' });
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT email, username, first_name AS firstName, last_name AS lastName, profile_picture AS profilePicture
             FROM user
             WHERE (username LIKE ? OR email LIKE ?) AND email != ?
             LIMIT 10`,
            [`%${query}%`, `%${query}%`, req.user.email]
        );
        await connection.end();
        res.status(200).json({ users: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error searching users.' });
    }
});

app.post('/api/friends/request', authenticateToken, async (req, res) => {
    const { receiverEmail } = req.body;
    if (!receiverEmail) return res.status(400).json({ message: 'Receiver email required.' });
    if (receiverEmail === req.user.email) return res.status(400).json({ message: 'You cannot add yourself.' });
    try {
        const connection = await createConnection();
        const [existing] = await connection.execute(
            `SELECT id FROM friend_request WHERE sender_email = ? AND receiver_email = ? AND status = 'pending'`,
            [req.user.email, receiverEmail]
        );
        if (existing.length > 0) {
            await connection.end();
            return res.status(409).json({ message: 'Friend request already sent.' });
        }
        const [alreadyFriends] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, receiverEmail, receiverEmail, req.user.email]
        );
        if (alreadyFriends.length > 0) {
            await connection.end();
            return res.status(409).json({ message: 'Already friends.' });
        }
        await connection.execute(
            'INSERT INTO friend_request (sender_email, receiver_email) VALUES (?, ?)',
            [req.user.email, receiverEmail]
        );
        await connection.end();
        res.status(201).json({ message: 'Friend request sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error sending friend request.' });
    }
});

app.get('/api/friends/requests/count', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [[row]] = await connection.execute(
            'SELECT COUNT(*) AS count FROM friend_request WHERE receiver_email = ? AND status = ?',
            [req.user.email, 'pending']
        );
        await connection.end();
        res.status(200).json({ count: row?.count ?? 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ count: 0 });
    }
});

app.get('/api/friends/requests/sent', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT receiver_email FROM friend_request WHERE sender_email = ? AND status = 'pending'`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ requests: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving sent requests.' });
    }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT fr.id, fr.sender_email, fr.created_at,
                    u.username, u.first_name AS firstName, u.last_name AS lastName, u.profile_picture AS profilePicture
             FROM friend_request fr
             JOIN user u ON u.email = fr.sender_email
             WHERE fr.receiver_email = ? AND fr.status = 'pending'
             ORDER BY fr.created_at DESC`,
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ requests: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving requests.' });
    }
});

app.put('/api/friends/request/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status.' });
    }
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `UPDATE friend_request SET status = ? WHERE id = ? AND receiver_email = ?`,
            [status, id, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Request not found.' });
        res.status(200).json({ message: `Request ${status}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating request.' });
    }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT u.email, u.username, u.first_name AS firstName, u.last_name AS lastName, u.profile_picture AS profilePicture
             FROM friend_request fr
             JOIN user u ON u.email = CASE
                 WHEN fr.sender_email = ? THEN fr.receiver_email
                 ELSE fr.sender_email
             END
             WHERE (fr.sender_email = ? OR fr.receiver_email = ?) AND fr.status = 'accepted'`,
            [req.user.email, req.user.email, req.user.email]
        );
        await connection.end();
        res.status(200).json({ friends: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving friends.' });
    }
});

const friendAcceptedPairSql = (actorCol) =>
    `EXISTS (
        SELECT 1 FROM friend_request fr
        WHERE fr.status = 'accepted'
        AND (
            (fr.sender_email = ? AND fr.receiver_email = ${actorCol})
            OR (fr.receiver_email = ? AND fr.sender_email = ${actorCol})
        )
    )`;

// Aggregated activity from accepted friends (ratings, list adds, watch status updates)
app.get('/api/friends/activity', authenticateToken, async (req, res) => {
    const me = req.user.email;
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '35'), 10) || 35));

    try {
        const connection = await createConnection();
        const friendParams = [me, me];

        const [ratingRows] = await connection.execute(
            `SELECT r.user_email AS actorEmail,
                    COALESCE(NULLIF(TRIM(u.username), ''), r.user_email) AS actorLabel,
                    r.title, r.type AS mediaType, r.rating, r.rated_at AS occurredAt, 'rating' AS kind
             FROM rating r
             INNER JOIN user u ON u.email = r.user_email
             WHERE r.user_email <> ? AND ${friendAcceptedPairSql('r.user_email')}
             ORDER BY r.rated_at DESC
             LIMIT 60`,
            [me, ...friendParams]
        );

        const [listRows] = await connection.execute(
            `SELECT l.user_email AS actorEmail,
                    COALESCE(NULLIF(TRIM(u.username), ''), l.user_email) AS actorLabel,
                    li.title, l.name AS listName, li.added_at AS occurredAt, 'list_add' AS kind
             FROM list_item li
             INNER JOIN list l ON l.id = li.list_id
             INNER JOIN user u ON u.email = l.user_email
             WHERE l.user_email <> ? AND ${friendAcceptedPairSql('l.user_email')}
             ORDER BY li.added_at DESC
             LIMIT 60`,
            [me, ...friendParams]
        );

        let statusRows = [];
        try {
            const [rows] = await connection.execute(
                `SELECT ws.user_email AS actorEmail,
                        COALESCE(NULLIF(TRIM(u.username), ''), ws.user_email) AS actorLabel,
                        ws.title, ws.type AS mediaType, ws.status, ws.updated_at AS occurredAt, 'status' AS kind
                 FROM watch_status ws
                 INNER JOIN user u ON u.email = ws.user_email
                 WHERE ws.user_email <> ? AND ${friendAcceptedPairSql('ws.user_email')}
                 ORDER BY ws.updated_at DESC
                 LIMIT 60`,
                [me, ...friendParams]
            );
            statusRows = rows;
        } catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE') console.error('friends activity watch_status:', e.message);
        }

        await connection.end();

        const merged = [];
        for (const row of ratingRows) {
            merged.push({
                kind: 'rating',
                actorEmail: row.actorEmail,
                actorLabel: row.actorLabel,
                title: row.title,
                mediaType: row.mediaType,
                rating: row.rating,
                occurredAt: row.occurredAt,
            });
        }
        for (const row of listRows) {
            merged.push({
                kind: 'list_add',
                actorEmail: row.actorEmail,
                actorLabel: row.actorLabel,
                title: row.title,
                listName: row.listName,
                occurredAt: row.occurredAt,
            });
        }
        for (const row of statusRows) {
            merged.push({
                kind: 'status',
                actorEmail: row.actorEmail,
                actorLabel: row.actorLabel,
                title: row.title,
                mediaType: row.mediaType,
                status: row.status,
                occurredAt: row.occurredAt,
            });
        }

        merged.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
        const activities = merged.slice(0, limit);

        res.status(200).json({ activities });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error loading friend activity.' });
    }
});

// Count of friend activity events in the last N days (for dashboard teaser)
app.get('/api/friends/activity/summary', authenticateToken, async (req, res) => {
    const me = req.user.email;
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'), 10) || 7));

    try {
        const connection = await createConnection();
        const friendParams = [me, me];

        const [[ratingCount]] = await connection.execute(
            `SELECT COUNT(*) AS c
             FROM rating r
             WHERE r.user_email <> ? AND ${friendAcceptedPairSql('r.user_email')}
             AND r.rated_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
            [me, ...friendParams]
        );

        const [[listCount]] = await connection.execute(
            `SELECT COUNT(*) AS c
             FROM list_item li
             INNER JOIN list l ON l.id = li.list_id
             WHERE l.user_email <> ? AND ${friendAcceptedPairSql('l.user_email')}
             AND li.added_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
            [me, ...friendParams]
        );

        let statusC = 0;
        try {
            const [[row]] = await connection.execute(
                `SELECT COUNT(*) AS c
                 FROM watch_status ws
                 WHERE ws.user_email <> ? AND ${friendAcceptedPairSql('ws.user_email')}
                 AND ws.updated_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
                [me, ...friendParams]
            );
            statusC = Number(row.c) || 0;
        } catch (e) {
            if (e.code !== 'ER_NO_SUCH_TABLE') console.error('friends activity summary watch_status:', e.message);
        }

        await connection.end();

        const count =
            (Number(ratingCount.c) || 0) + (Number(listCount.c) || 0) + statusC;
        res.status(200).json({ count, windowDays: days });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error loading friend activity summary.' });
    }
});

app.delete('/api/friends/:email', authenticateToken, async (req, res) => {
    const { email } = req.params;
    if (!email || email === req.user.email) return res.status(400).json({ message: 'Invalid friend.' });
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            `DELETE FROM friend_request
             WHERE status = 'accepted'
             AND ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))`,
            [req.user.email, email, email, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Friend not found.' });
        return res.status(200).json({ message: 'Friend removed.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error removing friend.' });
    }
});

app.get('/api/friends/:email/ratings', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();
        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, email, email, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Not friends.' });
        }
        const [rows] = await connection.execute(
            'SELECT title, type, rating, review, rated_at FROM rating WHERE user_email = ? ORDER BY rated_at DESC',
            [email]
        );
        await connection.end();
        res.status(200).json({ ratings: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving friend ratings.' });
    }
});

app.get('/api/friends/:email/lists', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();
        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, email, email, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Not friends.' });
        }
        const [lists] = await connection.execute(
            'SELECT id, name, created_at FROM list WHERE user_email = ? ORDER BY created_at ASC',
            [email]
        );
        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                'SELECT id, title, added_at FROM list_item WHERE list_id = ? ORDER BY added_at DESC',
                [list.id]
            );
            listsWithItems.push({ ...list, items });
        }
        await connection.end();
        res.status(200).json({ lists: listsWithItems });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving friend lists.' });
    }
});

app.post('/api/friends/message', authenticateToken, async (req, res) => {
    const { receiverEmail, content } = req.body;
    if (!receiverEmail || !content) return res.status(400).json({ message: 'Receiver and content required.' });
    try {
        const connection = await createConnection();
        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, receiverEmail, receiverEmail, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Not friends.' });
        }
        await connection.execute(
            'INSERT INTO message (sender_email, receiver_email, content) VALUES (?, ?, ?)',
            [req.user.email, receiverEmail, content]
        );
        await connection.end();
        res.status(201).json({ message: 'Message sent.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error sending message.' });
    }
});

app.get('/api/friends/:email/messages', authenticateToken, async (req, res) => {
    const { email } = req.params;
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT id, sender_email, receiver_email, content, sent_at
             FROM message
             WHERE (sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?)
             ORDER BY sent_at ASC`,
            [req.user.email, email, email, req.user.email]
        );
        await connection.end();
        res.status(200).json({ messages: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving messages.' });
    }
});

app.get('/api/friends/messages/unread/count', authenticateToken, async (req, res) => {
    const fromEmail = (req.query.from || '').trim() || null;
    let connection;
    try {
        connection = await createConnection();
        if (fromEmail) {
            const [friendCheck] = await connection.execute(
                `SELECT id FROM friend_request
                 WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
                 AND status = 'accepted'`,
                [req.user.email, fromEmail, fromEmail, req.user.email]
            );
            if (friendCheck.length === 0) {
                await connection.end();
                connection = null;
                return res.status(403).json({ message: 'Not friends.' });
            }
            const [[row]] = await connection.execute(
                `SELECT COUNT(*) AS cnt FROM message
                 WHERE LOWER(TRIM(receiver_email)) = LOWER(TRIM(?))
                 AND LOWER(TRIM(sender_email)) = LOWER(TRIM(?))
                 AND read_at IS NULL`,
                [req.user.email, fromEmail]
            );
            await connection.end();
            connection = null;
            return res.status(200).json({ count: Number(row?.cnt ?? 0) });
        }
        const [[row]] = await connection.execute(
            `SELECT COUNT(*) AS cnt
             FROM message m
             WHERE LOWER(TRIM(m.receiver_email)) = LOWER(TRIM(?)) AND m.read_at IS NULL
             AND EXISTS (
               SELECT 1 FROM friend_request fr
               WHERE fr.status = 'accepted'
               AND (
                 (LOWER(TRIM(fr.sender_email)) = LOWER(TRIM(m.sender_email)) AND LOWER(TRIM(fr.receiver_email)) = LOWER(TRIM(m.receiver_email)))
                 OR (LOWER(TRIM(fr.sender_email)) = LOWER(TRIM(m.receiver_email)) AND LOWER(TRIM(fr.receiver_email)) = LOWER(TRIM(m.sender_email)))
               )
             )`,
            [req.user.email]
        );
        await connection.end();
        connection = null;
        return res.status(200).json({ count: Number(row?.cnt ?? 0) });
    } catch (error) {
        if (connection) { try { await connection.end(); } catch (_) {} }
        if (isUnknownColumnError(error)) return res.status(200).json({ count: 0, migrated: false });
        console.error(error);
        return res.status(500).json({ message: 'Error counting unread messages.', count: 0 });
    }
});

app.get('/api/friends/messages/unread/summary', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT LOWER(TRIM(m.sender_email)) AS senderEmail, COUNT(*) AS cnt
             FROM message m
             WHERE LOWER(TRIM(m.receiver_email)) = LOWER(TRIM(?)) AND m.read_at IS NULL
             AND EXISTS (
               SELECT 1 FROM friend_request fr
               WHERE fr.status = 'accepted'
               AND (
                 (LOWER(TRIM(fr.sender_email)) = LOWER(TRIM(m.sender_email)) AND LOWER(TRIM(fr.receiver_email)) = LOWER(TRIM(m.receiver_email)))
                 OR (LOWER(TRIM(fr.sender_email)) = LOWER(TRIM(m.receiver_email)) AND LOWER(TRIM(fr.receiver_email)) = LOWER(TRIM(m.sender_email)))
               )
             )
             GROUP BY LOWER(TRIM(m.sender_email))`,
            [req.user.email]
        );
        await connection.end();
        connection = null;
        const threads = (rows || []).map((r) => ({
            senderEmail: String(r.senderEmail || r.senderemail || '').trim().toLowerCase(),
            count: Number(r.cnt ?? r.count ?? 0)
        })).filter((t) => t.senderEmail);
        return res.status(200).json({ threads });
    } catch (error) {
        if (connection) { try { await connection.end(); } catch (_) {} }
        if (isUnknownColumnError(error)) return res.status(200).json({ threads: [], migrated: false });
        console.error(error);
        return res.status(500).json({ message: 'Error loading unread summary.', threads: [] });
    }
});

app.put('/api/friends/:email/messages/read', authenticateToken, async (req, res) => {
    const { email } = req.params;
    if (!email || email === req.user.email) {
        return res.status(400).json({ message: 'Invalid friend.' });
    }
    let connection;
    try {
        connection = await createConnection();
        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, email, email, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            connection = null;
            return res.status(403).json({ message: 'Not friends.' });
        }
        const [result] = await connection.execute(
            `UPDATE message SET read_at = UTC_TIMESTAMP()
             WHERE LOWER(TRIM(receiver_email)) = LOWER(TRIM(?))
             AND LOWER(TRIM(sender_email)) = LOWER(TRIM(?))
             AND read_at IS NULL`,
            [req.user.email, email]
        );
        await connection.end();
        connection = null;
        return res.status(200).json({ marked: result.affectedRows });
    } catch (error) {
        if (connection) { try { await connection.end(); } catch (_) {} }
        if (isUnknownColumnError(error)) return res.status(200).json({ marked: 0, migrated: false });
        console.error(error);
        return res.status(500).json({ message: 'Error marking messages read.' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});