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

/** Normalize client/DB quirks for watch_status.status (ENUM). */
function normalizeDashboardWatchStatus(raw) {
    const s = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (s === 'wanttowatch') return 'want_to_watch';
    const allowed = new Set(['watching', 'completed', 'want_to_watch']);
    return allowed.has(s) ? s : null;
}

function friendAcceptedPairSql(actorCol) {
    return `EXISTS (
        SELECT 1 FROM friend_request fr
        WHERE fr.status = 'accepted'
        AND (
            (fr.sender_email = ? AND fr.receiver_email = ${actorCol})
            OR (fr.receiver_email = ? AND fr.sender_email = ${actorCol})
        )
    )`;
}

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

// Landing page hero — no auth (TMDB key kept on server)
const HERO_POSTER_FALLBACK = [
    'https://image.tmdb.org/t/p/w1280/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    'https://image.tmdb.org/t/p/w1280/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
    'https://image.tmdb.org/t/p/w1280/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    'https://image.tmdb.org/t/p/w1280/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    'https://image.tmdb.org/t/p/w1280/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
    'https://image.tmdb.org/t/p/w1280/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
];

app.get('/api/public/hero-posters', async (req, res) => {
    const key = process.env.TMDB_API_KEY;
    if (!key || key === 'your-tmdb-api-key-here') {
        return res.status(200).json({ posters: HERO_POSTER_FALLBACK });
    }
    try {
        const [movieRes1, movieRes2, tvRes1, tvRes2] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${key}&page=1`),
            fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${key}&page=2`),
            fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${key}&page=1`),
            fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${key}&page=2`),
        ]);
        const urls = [];
        const pushPaths = (results, limit) => {
            for (const r of (results || []).slice(0, limit)) {
                if (r.poster_path) {
                    urls.push(`https://image.tmdb.org/t/p/w1280${r.poster_path}`);
                }
            }
        };
        for (const r of [movieRes1, movieRes2, tvRes1, tvRes2]) {
            if (r.ok) {
                const d = await r.json();
                pushPaths(d.results, 20);
            }
        }
        const seen = new Set();
        const unique = [];
        for (const u of urls) {
            if (!seen.has(u)) {
                seen.add(u);
                unique.push(u);
            }
        }
        const posters = unique.length >= 4 ? unique.slice(0, 56) : HERO_POSTER_FALLBACK;
        return res.status(200).json({ posters });
    } catch (e) {
        console.error('hero-posters:', e.message);
        return res.status(200).json({ posters: HERO_POSTER_FALLBACK });
    }
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

async function getUserDisplayName(connection, email) {
    const [[user]] = await connection.execute(
        `SELECT email, username, first_name, last_name
         FROM user
         WHERE email = ?`,
        [email]
    );

    if (!user) return email;

    const username = String(user.username || '').trim();
    const first = String(user.first_name || '').trim();
    const last = String(user.last_name || '').trim();
    const fullName = `${first} ${last}`.trim();

    if (username) return username;
    if (fullName) return fullName;
    return user.email;
}

async function createNotification(connection, userEmail, type, title, message, actionUrl = null) {
    await connection.execute(
        `INSERT INTO notifications (user_email, type, title, message, action_url, is_read)
         VALUES (?, ?, ?, ?, ?, FALSE)`,
        [userEmail, type, title, message, actionUrl]
    );
}

const ALLOWED_REACTION_EMOJIS = new Set(['👍', '😂', '🔥', '😮']);

function normalizeReactionEmoji(raw) {
    const emoji = String(raw || '').trim();
    return ALLOWED_REACTION_EMOJIS.has(emoji) ? emoji : null;
}

async function areUsersAcceptedFriends(connection, emailA, emailB) {
    const [rows] = await connection.execute(
        `SELECT id
         FROM friend_request
         WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
         AND status = 'accepted'
         LIMIT 1`,
        [emailA, emailB, emailB, emailA]
    );
    return rows.length > 0;
}

async function getReactionSummaryForRating(connection, ratingId, viewerEmail) {
    const [countRows] = await connection.execute(
        `SELECT emoji, COUNT(*) AS count
         FROM rating_reaction
         WHERE rating_id = ?
         GROUP BY emoji`,
        [ratingId]
    );

    const [myRows] = await connection.execute(
        `SELECT emoji
         FROM rating_reaction
         WHERE rating_id = ? AND user_email = ?
         LIMIT 1`,
        [ratingId, viewerEmail]
    );

    const counts = {};
    for (const row of countRows) {
        counts[row.emoji] = Number(row.count) || 0;
    }

    return {
        counts,
        myReaction: myRows.length ? myRows[0].emoji : null
    };
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
// NOTIFICATIONS
//////////////////////////////////////
app.get('/api/notifications', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();

        const [notificationRows] = await connection.execute(
            `SELECT id, user_email, type, title, message, action_url, is_read, created_at
             FROM notifications
             WHERE user_email = ?
             AND type <> 'friend_request'
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.email]
        );

        const [friendRequestRows] = await connection.execute(
            `SELECT 
                fr.id,
                fr.receiver_email AS user_email,
                'friend_request' AS type,
                'New Friend Request' AS title,
                CONCAT(
                    COALESCE(
                        NULLIF(TRIM(u.username), ''),
                        NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
                        fr.sender_email
                    ),
                    ' sent you a friend request.'
                ) AS message,
                '/friends' AS action_url,
                FALSE AS is_read,
                fr.created_at
             FROM friend_request fr
             JOIN user u ON u.email = fr.sender_email
             WHERE fr.receiver_email = ?
               AND fr.status = 'pending'
             ORDER BY fr.created_at DESC`,
            [req.user.email]
        );

        const allNotifications = [...notificationRows, ...friendRequestRows]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 50);

        await connection.end();
        return res.status(200).json({ notifications: allNotifications });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving notifications.', notifications: [] });
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [[notificationRow]] = await connection.execute(
            `SELECT COUNT(*) AS count
             FROM notifications
             WHERE user_email = ? 
             AND is_read = FALSE
             AND type <> 'friend_request'`,
            [req.user.email]
        );
        const [[friendReqRow]] = await connection.execute(
            `SELECT COUNT(*) AS count
            FROM friend_request
            WHERE receiver_email = ?
            AND status = 'pending'`,
            [req.user.email]
        );
        const total =
            Number(notificationRow?.count || 0) + Number(friendReqRow?.count || 0);
        await connection.end();

        return res.status(200).json({ count: total });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(200).json({ count: 0 });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ message: 'Invalid notification id.' });
    }

    let connection;
    try {
        connection = await createConnection();
        await connection.execute(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = ? AND user_email = ?`,
            [id, req.user.email]
        );
        await connection.end();
        return res.status(200).json({ message: 'Notification marked as read.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error marking notification as read.' });
    }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        await connection.execute(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE user_email = ? AND is_read = FALSE`,
            [req.user.email]
        );
        await connection.end();
        return res.status(200).json({ message: 'All notifications marked as read.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error marking all notifications as read.' });
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
        // FIX: Removed the ratingOnlyRows query and the id+1000000 offset that was
        // causing "Rating not found" errors when those inflated IDs were used in reactions.
        await connection.end();
        const watchHistory = rows.map(r => ({ ...r, watched_at: r.watched_at }));
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

async function getRatingSummaryHandler(req, res) {
    const titleRaw = (req.query.title || '').trim();
    const contentType = req.query.type === 'show' ? 'show' : 'movie';
    if (!titleRaw) {
        return res.status(400).json({ message: 'title is required.' });
    }
    const me = req.user.email;

    const roundAvg = (row) => {
        if (!row) return { average: null, count: 0 };
        const c = Number(row.cnt) || 0;
        if (c === 0) return { average: null, count: 0 };
        const a = parseFloat(row.avg_rating);
        if (!Number.isFinite(a)) return { average: null, count: c };
        return {
            average: Math.round(a * 10) / 10,
            count: c
        };
    };

    let connection;
    try {
        connection = await createConnection();
        let friendsRow = null;
        try {
            const [friendsRows] = await connection.execute(
                `SELECT AVG(r.rating) AS avg_rating, COUNT(*) AS cnt
                 FROM rating r
                 WHERE TRIM(r.title) = TRIM(?) AND r.type = ?
                 AND r.user_email <> ?
                 AND ${friendAcceptedPairSql('r.user_email')}`,
                [titleRaw, contentType, me, me, me]
            );
            friendsRow = friendsRows[0];
        } catch (friendsErr) {
            if (friendsErr.code === 'ER_NO_SUCH_TABLE') {
                console.warn('ratings/summary: friend_request missing; returning empty friends aggregate.');
            } else {
                throw friendsErr;
            }
        }

        res.status(200).json({
            friends: roundAvg(friendsRow)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error loading rating summary.' });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (endErr) {
                console.warn('ratings/summary: connection.end failed', endErr.message);
            }
        }
    }
}

app.get('/api/dashboard/ratings/summary', authenticateToken, getRatingSummaryHandler);
app.get('/api/ratings/summary', authenticateToken, getRatingSummaryHandler);

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
        const [access] = await connection.execute(
            `SELECT l.id FROM list l
             WHERE l.id = ? AND (
                 l.user_email = ?
                 OR EXISTS (SELECT 1 FROM list_collaborator lc WHERE lc.list_id = l.id AND lc.collaborator_email = ?)
             )`,
            [listId, req.user.email, req.user.email]
        );

        if (access.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }

        await connection.execute(
            'INSERT INTO list_item (list_id, title, added_by_email) VALUES (?, ?, ?)',
            [listId, title, req.user.email]
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
        const [access] = await connection.execute(
            `SELECT l.id FROM list l
             WHERE l.id = ? AND (
                 l.user_email = ?
                 OR EXISTS (SELECT 1 FROM list_collaborator lc WHERE lc.list_id = l.id AND lc.collaborator_email = ?)
             )`,
            [listId, req.user.email, req.user.email]
        );

        if (access.length === 0) {
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
        const [collabCheck] = await connection.execute(
            'SELECT id FROM list_collaborator WHERE list_id = ? LIMIT 1', [listId]
        );
        if (collabCheck.length > 0) {
            await connection.end();
            return res.status(403).json({ message: 'Cannot delete a shared list. Use "Leave list" instead.' });
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
            `SELECT id, name, created_at FROM list
             WHERE user_email = ?
               AND NOT EXISTS (SELECT 1 FROM list_collaborator lc WHERE lc.list_id = list.id)
             ORDER BY created_at ASC`,
            [req.user.email]
        );

        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                'SELECT id, title, added_at FROM list_item WHERE list_id = ? ORDER BY added_at DESC',
                [list.id]
            );
            let collaborators = [];
            try {
                const [collabRows] = await connection.execute(
                    `SELECT lc.collaborator_email AS email, u.first_name AS firstName, u.last_name AS lastName, u.username
                     FROM list_collaborator lc
                     JOIN user u ON u.email = lc.collaborator_email
                     WHERE lc.list_id = ?`,
                    [list.id]
                );
                collaborators = collabRows;
            } catch (_) {}
            listsWithItems.push({ ...list, items, collaborators });
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
                    `INSERT IGNORE INTO watch_status (user_email, title, type, status)
                     VALUES (?, ?, ?, 'completed')`,
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
    const titleTrim = String(req.body?.title ?? '').trim();
    const statusNorm = normalizeDashboardWatchStatus(req.body?.status);

    if (!titleTrim || !statusNorm) {
        return res.status(400).json({
            message: !titleTrim
                ? 'Title and status required.'
                : 'Invalid status. Use watching, completed, or want to watch.',
        });
    }

    const t = req.body?.type === 'show' ? 'show' : 'movie';

    try {
        const connection = await createConnection();
        await connection.execute(
            `INSERT INTO watch_status (user_email, title, type, status)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               status = VALUES(status),
               type = VALUES(type),
               updated_at = CURRENT_TIMESTAMP`,
            [req.user.email, titleTrim, t, statusNorm]
        );
        await connection.end();
        return res.status(200).json({ message: 'Status saved.' });
    } catch (err) {
        const truncated =
            err &&
            (err.code === 'WARN_DATA_TRUNCATED' ||
                err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' ||
                Number(err.errno) === 1265 ||
                Number(err.errno) === 1366);
        if (truncated) {
            console.error('watch_status ENUM/truncation:', err.message);
            return res.status(400).json({
                message: 'Could not save that status. Your database may need the watch_status status column updated.',
            });
        }
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

/** TMDB search match: id + poster_path (exact title match preferred). */
async function tmdbSearchMatchFromTitle(title, contentType) {
    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return null;
    }
    const tmdbType = contentType === 'show' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
    const tmdbRes = await fetch(url);
    if (!tmdbRes.ok) return null;
    const data = await tmdbRes.json();
    const results = data.results || [];
    const exact = results.find((r) => {
        const t = contentType === 'show' ? r.name : r.title;
        return t && t.toLowerCase() === String(title).toLowerCase();
    });
    const chosen = exact || results[0];
    if (!chosen || !chosen.id) return null;
    return { id: chosen.id, poster_path: chosen.poster_path || null };
}

/** Same region + provider shape as GET /api/title/providers. */
async function tmdbWatchProvidersForId(tmdbId, contentType) {
    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return { available: false, providers: [], streamingProviders: [], label: 'Availability unavailable', providerIds: [] };
    }
    const tmdbType = contentType === 'show' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
    const tmdbRes = await fetch(url);
    if (!tmdbRes.ok) {
        return { available: false, providers: [], streamingProviders: [], label: 'Availability unavailable', providerIds: [] };
    }
    const data = await tmdbRes.json();
    const regionData =
        data?.results?.US ||
        data?.results?.CA ||
        data?.results?.GB ||
        Object.values(data?.results || {})[0] ||
        null;
    if (!regionData) {
        return {
            available: false,
            providers: [],
            streamingProviders: [],
            label: 'Availability unavailable',
            providerIds: [],
        };
    }
    const streamingProviders = (regionData.flatrate || []).map((p) => ({
        provider_id: String(p.provider_id),
        provider_name: p.provider_name,
    }));
    const rentProviders = (regionData.rent || []).map((p) => p.provider_name);
    const buyProviders = (regionData.buy || []).map((p) => p.provider_name);
    const allProviders = [
        ...streamingProviders.map((p) => p.provider_name),
        ...rentProviders,
        ...buyProviders,
    ];
    const providerIds = [
        ...(regionData.flatrate || []).map((p) => String(p.provider_id)),
        ...(regionData.rent || []).map((p) => String(p.provider_id)),
        ...(regionData.buy || []).map((p) => String(p.provider_id)),
    ];
    return {
        available: allProviders.length > 0,
        providers: allProviders,
        streamingProviders,
        label: allProviders.length > 0 ? allProviders.slice(0, 3).join(', ') : 'Availability unavailable',
        providerIds: [...new Set(providerIds)],
    };
}

/** TMDB movie/TV details genre ids (for pick filters). */
async function tmdbGenreIdsForId(tmdbId, contentType) {
    if (!tmdbId || !process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return [];
    }
    const tmdbType = contentType === 'show' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${process.env.TMDB_API_KEY}`;
    const tmdbRes = await fetch(url);
    if (!tmdbRes.ok) return [];
    const d = await tmdbRes.json();
    return (d.genres || []).map((g) => g.id).filter((id) => Number.isFinite(id));
}

function parseGenreIdsFromRequest(req) {
    const q = req.query || {};
    const b = req.body || {};
    const raw = b.genreIds !== undefined && b.genreIds !== null ? b.genreIds : q.genreIds;
    if (Array.isArray(raw)) {
        return raw.map((n) => parseInt(String(n), 10)).filter((n) => !isNaN(n) && n > 0);
    }
    if (typeof raw === 'string' && raw.trim()) {
        return raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    }
    return [];
}

function parseProviderIdsFromRequest(req) {
    const q = req.query || {};
    const b = req.body || {};
    const raw = b.providerIds !== undefined && b.providerIds !== null ? b.providerIds : q.providerIds;
    if (Array.isArray(raw)) {
        return raw.map((s) => String(s).trim()).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
        return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

function genreFilterMatches(selectedIds, titleGenreIds) {
    if (!selectedIds || selectedIds.length === 0) return true;
    if (!titleGenreIds || titleGenreIds.length === 0) return false;
    const set = new Set(titleGenreIds.map((n) => Number(n)));
    return selectedIds.some((s) => set.has(Number(s)));
}

function providerFilterMatches(selectedIds, tmdbProviderIds) {
    if (!selectedIds || selectedIds.length === 0) return true;
    if (!tmdbProviderIds || tmdbProviderIds.length === 0) return false;
    const set = new Set((tmdbProviderIds || []).map(String));
    return selectedIds.some((s) => set.has(String(s)));
}

/** Aligns with public/js/shows.js PROVIDER_IDS for saveSubscriptions keys. */
const SUBSCRIPTION_KEY_TO_TMDB_PROVIDER_IDS = {
    netflix: ['8'],
    prime: ['9', '119', '10'],
    amazon: ['9', '119', '10'],
    hulu: ['15'],
    disney: ['337', '390'],
    max: ['384', '189', '1899'],
};

function subscriptionKeysToNormalizedKeys(userKeys) {
    const out = new Set();
    for (const raw of userKeys || []) {
        const s = String(raw).toLowerCase().trim();
        if (!s) continue;
        if (SUBSCRIPTION_KEY_TO_TMDB_PROVIDER_IDS[raw]) {
            out.add(raw);
            continue;
        }
        if (SUBSCRIPTION_KEY_TO_TMDB_PROVIDER_IDS[s]) {
            out.add(s);
            continue;
        }
        if (s.includes('netflix')) out.add('netflix');
        else if (s.includes('hulu')) out.add('hulu');
        else if (s.includes('disney')) out.add('disney');
        else if (s.includes('prime') || s.includes('amazon')) out.add('prime');
        else if (s.includes('max') || s.includes('hbo')) out.add('max');
    }
    return [...out];
}

function subscriptionKeysOverlapTmdbProviderIds(userKeys, tmdbProviderIds) {
    const idSet = new Set((tmdbProviderIds || []).map(String));
    const keys = subscriptionKeysToNormalizedKeys(userKeys);
    for (const key of keys) {
        const mapped = SUBSCRIPTION_KEY_TO_TMDB_PROVIDER_IDS[key];
        if (mapped && mapped.some((id) => idSet.has(String(id)))) return true;
    }
    return false;
}

const RANDOM_WATCHLIST_MAX_ATTEMPTS = 15;

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

/**
 * Random title from Want to Watch (watch_status) with TMDB streaming info when available.
 * GET query or POST JSON: type=all|movie|show, requireSubscriptionMatch, genreIds (comma or array), providerIds (comma or array).
 */
async function handleRandomWatchlist(req, res) {
    let connection;
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const rawType = String(
            body.type !== undefined && body.type !== null ? body.type : req.query.type || 'all'
        ).toLowerCase();
        const typeFilter = ['all', 'movie', 'show'].includes(rawType) ? rawType : 'all';
        const subRaw =
            body.requireSubscriptionMatch !== undefined && body.requireSubscriptionMatch !== null
                ? body.requireSubscriptionMatch
                : req.query.requireSubscriptionMatch;
        const requireSubscriptionMatch =
            String(subRaw || '').toLowerCase() === 'true' ||
            subRaw === true ||
            subRaw === 1 ||
            req.query.requireSubscriptionMatch === '1';

        const genreIds = parseGenreIdsFromRequest(req);
        const providerIds = parseProviderIdsFromRequest(req);

        if (genreIds.length > 0 && typeFilter === 'all') {
            return res.status(400).json({
                message: 'Choose Movies or TV (not All) to filter by genre, or clear genre pills.',
            });
        }

        connection = await createConnection();
        const email = req.user.email;

        let userSubKeys = [];
        if (requireSubscriptionMatch) {
            try {
                const [subRows] = await connection.execute(
                    'SELECT provider_key FROM user_subscription WHERE user_email = ?',
                    [email]
                );
                userSubKeys = subRows.map((r) => r.provider_key);
            } catch (subErr) {
                if (subErr.code !== 'ER_NO_SUCH_TABLE') {
                    console.error(subErr);
                }
            }
            if (userSubKeys.length === 0) {
                await connection.end();
                return res.status(200).json({
                    pick: null,
                    message:
                        'Add your streaming services on the Subscriptions page, or turn off “Only on my services” to pick without that filter.',
                });
            }
        }

        const emptyMessageForFilter = () => {
            if (typeFilter === 'movie') {
                return 'No movies in your Want to Watch list for this filter. Add movies on the dashboard or choose All.';
            }
            if (typeFilter === 'show') {
                return 'No TV shows in your Want to Watch list for this filter. Add shows on the dashboard or choose All.';
            }
            return 'Your Want to Watch list is empty. Add titles on the dashboard, then try again.';
        };

        for (let attempt = 0; attempt < RANDOM_WATCHLIST_MAX_ATTEMPTS; attempt++) {
            let rows;
            try {
                let sql =
                    'SELECT title, type FROM watch_status WHERE user_email = ? AND status = ?';
                const params = [email, 'want_to_watch'];
                if (typeFilter === 'movie') {
                    sql += " AND type = 'movie'";
                } else if (typeFilter === 'show') {
                    sql += " AND type = 'show'";
                }
                sql += ' ORDER BY RAND() LIMIT 1';
                [rows] = await connection.execute(sql, params);
            } catch (e) {
                if (e.code === 'ER_NO_SUCH_TABLE') {
                    await connection.end();
                    return res.status(200).json({
                        pick: null,
                        message:
                            'Want to Watch is not available yet. Run the watch_status migration, then add titles on your dashboard.',
                    });
                }
                throw e;
            }

            if (!rows || rows.length === 0) {
                await connection.end();
                return res.status(200).json({
                    pick: null,
                    message: emptyMessageForFilter(),
                });
            }

            const row = rows[0];
            const title = row.title;
            const type = row.type === 'show' ? 'show' : 'movie';

            const match = await tmdbSearchMatchFromTitle(title, type);
            const tmdbId = match?.id ?? null;
            const providerPayload = tmdbId
                ? await tmdbWatchProvidersForId(tmdbId, type)
                : {
                      available: false,
                      providers: [],
                      streamingProviders: [],
                      label: 'Availability unavailable',
                      providerIds: [],
                  };

            const tmdbProvIds = providerPayload.providerIds || [];

            if (requireSubscriptionMatch) {
                if (!subscriptionKeysOverlapTmdbProviderIds(userSubKeys, tmdbProvIds)) {
                    continue;
                }
            }

            if (!providerFilterMatches(providerIds, tmdbProvIds)) {
                continue;
            }

            if (genreIds.length > 0) {
                if (!tmdbId) {
                    continue;
                }
                const titleGenreIds = await tmdbGenreIdsForId(tmdbId, type);
                if (!genreFilterMatches(genreIds, titleGenreIds)) {
                    continue;
                }
            }

            await connection.end();
            connection = null;

            return res.status(200).json({
                pick: {
                    title,
                    type,
                    tmdbId,
                    posterPath: match?.poster_path || null,
                    streamingProviders: providerPayload.streamingProviders,
                    providersLabel: providerPayload.label,
                    allProviders: providerPayload.providers,
                    available: providerPayload.available,
                },
            });
        }

        await connection.end();
        connection = null;
        return res.status(200).json({
            pick: null,
            message:
                'No title matched your filters after several tries. Try fewer genre or provider pills, adjust format, or add more titles to Want to Watch.',
        });
    } catch (error) {
        console.error(error);
        if (connection) {
            try {
                await connection.end();
            } catch (_) {}
        }
        return res.status(500).json({ message: 'Error picking from your watchlist.' });
    }
}

app.get('/api/suggestions/random-watchlist', authenticateToken, handleRandomWatchlist);
app.post('/api/suggestions/random-watchlist', authenticateToken, handleRandomWatchlist);

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
    let connection;

    try {
        connection = await createConnection();

        const [privacyCheck] = await connection.execute(
            `SELECT is_private FROM user WHERE email = ?`,
            [email]
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
            `SELECT id, title, type, rating, review, rated_at
             FROM rating
             WHERE user_email = ?
             ORDER BY rated_at DESC`,
            [email]
        );

        const result = [];
        for (const r of rows) {
            const reactions = await getReactionSummaryForRating(connection, r.id, req.user.email);
            result.push({ ...r, reactions });
        }

        await connection.end();
        return res.status(200).json({ ratings: result });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving ratings.' });
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
app.get('/api/trending/movies', authenticateToken, async (req, res) => {
    try {
        const page = req.query.page || 1;
        const url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}&page=${page}`;
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

app.get('/api/trending/tv', authenticateToken, async (req, res) => {
    const page = req.query.page || 1;
    if (!process.env.TMDB_API_KEY) {
        return res.status(500).json({ message: 'TMDB API key missing' });
    }
    try {
        const url = `https://api.themoviedb.org/3/trending/tv/week?api_key=${process.env.TMDB_API_KEY}&page=${page}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB trending failed' });
        }
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error fetching trending shows' });
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

app.get('/api/tmdb/genres', authenticateToken, async (req, res) => {
    const raw = String(req.query.type || 'movie').toLowerCase();
    const listType = raw === 'tv' || raw === 'show' ? 'tv' : 'movie';
    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }
    try {
        const url = `https://api.themoviedb.org/3/genre/${listType}/list?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        const data = await tmdbRes.json();
        return res.status(200).json({ genres: data.genres || [] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading genres.' });
    }
});

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

        return res.status(200).json({
            available: allProviders.length > 0,
            providers: allProviders,
            streamingProviders,
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

        if (tmdbType === 'movie') {
            const detailUrl = `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.TMDB_API_KEY}`;
            const detailRes = await fetch(detailUrl);

            if (!detailRes.ok) {
                return res.status(detailRes.status).json({ message: 'TMDB request failed' });
            }

            const detailData = await detailRes.json();
            const belongsToCollection = detailData.belongs_to_collection;

            if (belongsToCollection?.id) {
                const collectionUrl = `https://api.themoviedb.org/3/collection/${belongsToCollection.id}?api_key=${process.env.TMDB_API_KEY}`;
                const collectionRes = await fetch(collectionUrl);

                if (collectionRes.ok) {
                    const collectionData = await collectionRes.json();
                    const relatedTitles = (collectionData.parts || [])
                        .filter((item) => item && item.id && String(item.id) !== String(id))
                        .sort((a, b) => {
                            const da = new Date(a.release_date || '9999-12-31').getTime();
                            const db = new Date(b.release_date || '9999-12-31').getTime();
                            return da - db;
                        })
                        .map((item) => ({
                            id: item.id,
                            title: item.title || 'Untitled',
                            type: 'movie',
                            posterPath: item.poster_path || null
                        }));

                    return res.status(200).json({ relatedTitles, source: 'collection' });
                }
            }
        }

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
            .filter((item) => item && item.id)
            .filter((item) => {
                if (String(item.id) === String(id)) return false;
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            })
            .slice(0, 12)
            .map((item) => ({
                id: item.id,
                title: item.title || item.name || 'Untitled',
                type: tmdbType === 'tv' ? 'show' : 'movie',
                posterPath: item.poster_path || null
            }));

        return res.status(200).json({ relatedTitles, source: 'fallback' });
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
    const providers = req.query.with_watch_providers;

    if (!process.env.TMDB_API_KEY) {
        return res.status(500).json({ message: 'TMDB API key missing' });
    }

    try {
        let url = `https://api.themoviedb.org/3/discover/tv?api_key=${process.env.TMDB_API_KEY}&page=${page}&watch_region=US`;
        if (providers) {
            url += `&with_watch_providers=${providers}`;
        }
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB discover failed' });
        }
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error fetching discover shows' });
    }
});

app.get('/api/tv/by-genre', authenticateToken, async (req, res) => {
    const { genreId, page = 1, with_watch_providers } = req.query;

    if (!genreId) {
        return res.status(400).json({ message: 'genreId is required.' });
    }

    if (!process.env.TMDB_API_KEY) {
        return res.status(500).json({ message: 'TMDB API key missing' });
    }

    try {
        let url = `https://api.themoviedb.org/3/discover/tv?api_key=${process.env.TMDB_API_KEY}&with_genres=${genreId}&page=${page}&watch_region=US`;
        if (with_watch_providers) {
            url += `&with_watch_providers=${with_watch_providers}`;
        }
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB discover failed' });
        }
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error loading genre shows.' });
    }
});

app.get('/api/tv/:id/providers', authenticateToken, async (req, res) => {
    const { id } = req.params;

    if (!process.env.TMDB_API_KEY) {
        return res.status(500).json({ message: 'TMDB API key missing' });
    }

    try {
        const url = `https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'Provider fetch failed' });
        }
        const data = await tmdbRes.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error fetching providers' });
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

    let connection;
    try {
        connection = await createConnection();
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
        if (connection) { try { await connection.end(); } catch (_) {} }
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

    let connection;
    try {
        connection = await createConnection();

        const [requestRows] = await connection.execute(
            `SELECT id, sender_email, receiver_email 
            FROM friend_request 
            WHERE id = ? AND receiver_email = ? AND status = 'pending'`,
            [id, req.user.email]
        );
        if (requestRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Friend request not found.' });
        }
        const request = requestRows[0];
        const [result] = await connection.execute(
            `UPDATE friend_request SET status = ? WHERE id = ? AND receiver_email = ?`,
            [status, id, req.user.email]
        );
        if (result.affectedRows === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Request not found.' });
        }
        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection, request.sender_email,
            status === 'accepted' ? 'friend_request_accepted' : 'friend_request_declined',
            status === 'accepted' ? 'Friend Request Accepted' : 'Friend Request Declined',
            status === 'accepted'
                ? `${actorLabel} accepted your friend request.`
                : `${actorLabel} declined your friend request.`,
            '/friends'
        );
        await connection.end();
        res.status(200).json({ message: `Request ${status}.` });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
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

app.get('/api/friends/activity', authenticateToken, async (req, res) => {
    const me = req.user.email;
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '35'), 10) || 35));

    let connection;
    try {
        connection = await createConnection();
        const friendParams = [me, me];

        const [ratingRows] = await connection.execute(
            `SELECT r.user_email AS actorEmail,
                    COALESCE(NULLIF(TRIM(u.username), ''), r.user_email) AS actorLabel,
                    r.title,
                    r.type AS mediaType,
                    r.rating,
                    r.rated_at AS occurredAt,
                    'rating' AS kind
             FROM rating r
             INNER JOIN user u ON u.email = r.user_email
             WHERE r.user_email <> ?
               AND ${friendAcceptedPairSql('r.user_email')}
             ORDER BY r.rated_at DESC
             LIMIT 60`,
            [me, ...friendParams]
        );

        const [reactionRows] = await connection.execute(
            `SELECT rr.user_email AS actorEmail,
                    COALESCE(NULLIF(TRIM(u.username), ''), rr.user_email) AS actorLabel,
                    rr.emoji,
                    r.title,
                    r.type AS mediaType,
                    rr.updated_at AS occurredAt,
                    'reaction' AS kind
             FROM rating_reaction rr
             INNER JOIN rating r ON r.id = rr.rating_id
             INNER JOIN user u ON u.email = rr.user_email
             WHERE rr.user_email <> ?
               AND ${friendAcceptedPairSql('rr.user_email')}
             ORDER BY rr.updated_at DESC
             LIMIT 60`,
            [me, ...friendParams]
        );

        const [listRows] = await connection.execute(
            `SELECT l.user_email AS actorEmail,
                    COALESCE(NULLIF(TRIM(u.username), ''), l.user_email) AS actorLabel,
                    li.title,
                    l.name AS listName,
                    li.added_at AS occurredAt,
                    'list_add' AS kind
             FROM list_item li
             INNER JOIN list l ON l.id = li.list_id
             INNER JOIN user u ON u.email = l.user_email
             WHERE l.user_email <> ?
               AND ${friendAcceptedPairSql('l.user_email')}
             ORDER BY li.added_at DESC
             LIMIT 60`,
            [me, ...friendParams]
        );

        let statusRows = [];
        try {
            const [rows] = await connection.execute(
                `SELECT ws.user_email AS actorEmail,
                        COALESCE(NULLIF(TRIM(u.username), ''), ws.user_email) AS actorLabel,
                        ws.title,
                        ws.type AS mediaType,
                        ws.status,
                        ws.updated_at AS occurredAt,
                        'status' AS kind
                 FROM watch_status ws
                 INNER JOIN user u ON u.email = ws.user_email
                 WHERE ws.user_email <> ?
                   AND ${friendAcceptedPairSql('ws.user_email')}
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

        for (const row of reactionRows) {
            merged.push({
                kind: 'reaction',
                actorEmail: row.actorEmail,
                actorLabel: row.actorLabel,
                title: row.title,
                mediaType: row.mediaType,
                emoji: row.emoji,
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

        return res.status(200).json({ activities });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error loading friend activity.' });
    }
});

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
    let connection;

    try {
        connection = await createConnection();

        const [friendCheck] = await connection.execute(
            `SELECT id
             FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, email, email, req.user.email]
        );

        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'Not friends.' });
        }

        const [rows] = await connection.execute(
            `SELECT id, title, type, rating, review, rated_at
             FROM rating
             WHERE user_email = ?
             ORDER BY rated_at DESC`,
            [email]
        );

        const result = [];
        for (const r of rows) {
            const reactions = await getReactionSummaryForRating(connection, r.id, req.user.email);
            result.push({ ...r, reactions });
        }

        // FIX: removed stray 'l' character after connection.end()
        await connection.end();
        return res.status(200).json({ ratings: result });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving friend ratings.' });
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

//////////////////////////////////////
// REACTIONS (EMOJI)
//////////////////////////////////////
app.post('/api/reactions', authenticateToken, async (req, res) => {
    const rawRatingId = req.body?.ratingId;
    const ratingId = parseInt(String(rawRatingId), 10);
    const emoji = normalizeReactionEmoji(req.body?.emoji);

    if (!Number.isFinite(ratingId) || ratingId < 1) {
        return res.status(400).json({ message: 'Invalid ratingId.', debug: { rawRatingId } });
    }

    if (!emoji) {
        return res.status(400).json({ message: 'Invalid emoji.' });
    }

    let connection;
    try {
        connection = await createConnection();

        const [allMatchRows] = await connection.execute(
            `SELECT id, user_email, title, type, rating, rated_at FROM rating WHERE id = ?`,
            [ratingId]
        );

        if (allMatchRows.length === 0) {
            await connection.end();
            return res.status(404).json({
                message: 'Rating not found.',
                debug: { ratingId, rawRatingId }
            });
        }

        const rating = allMatchRows[0];

        if (String(rating.user_email).toLowerCase() === String(req.user.email).toLowerCase()) {
            await connection.end();
            return res.status(400).json({ message: 'You cannot react to your own rating.' });
        }

        const areFriends = await areUsersAcceptedFriends(connection, req.user.email, rating.user_email);

        if (!areFriends) {
            await connection.end();
            return res.status(403).json({ message: 'You can only react to ratings from accepted friends.' });
        }

        await connection.execute(
            `INSERT INTO rating_reaction (rating_id, user_email, emoji)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                emoji = VALUES(emoji),
                updated_at = CURRENT_TIMESTAMP`,
            [ratingId, req.user.email, emoji]
        );

        const reactions = await getReactionSummaryForRating(connection, ratingId, req.user.email);

        await connection.end();
        return res.status(200).json({ message: 'Reaction saved.', reactions });
    } catch (error) {
        console.error('POST /api/reactions error code:', error?.code);
        console.error('POST /api/reactions error message:', error?.message);
        console.error('POST /api/reactions full error:', error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        // Return the actual DB error message in development so you can see what's wrong
        return res.status(500).json({
            message: 'Error saving reaction.',
            debug: { code: error?.code, sqlMessage: error?.sqlMessage || error?.message }
        });
    }
});

app.delete('/api/reactions/:ratingId', authenticateToken, async (req, res) => {
    const ratingId = parseInt(String(req.params.ratingId), 10);

    if (!Number.isFinite(ratingId) || ratingId < 1) {
        return res.status(400).json({ message: 'Invalid ratingId.' });
    }

    let connection;
    try {
        connection = await createConnection();

        const [rows] = await connection.execute(
            `SELECT id FROM rating WHERE id = ? LIMIT 1`,
            [ratingId]
        );

        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Rating not found.' });
        }

        await connection.execute(
            `DELETE FROM rating_reaction WHERE rating_id = ? AND user_email = ?`,
            [ratingId, req.user.email]
        );

        const reactions = await getReactionSummaryForRating(connection, ratingId, req.user.email);

        await connection.end();
        return res.status(200).json({ message: 'Reaction removed.', reactions });
    } catch (error) {
        console.error('DELETE /api/reactions/:ratingId error:', error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error removing reaction.' });
    }
});

app.get('/api/reactions/:ratingId', authenticateToken, async (req, res) => {
    const ratingId = parseInt(req.params.ratingId, 10);

    if (!Number.isFinite(ratingId)) {
        return res.status(400).json({ message: 'Invalid ratingId.' });
    }

    let connection;
    try {
        connection = await createConnection();
        const summary = await getReactionSummaryForRating(connection, ratingId, req.user.email);
        await connection.end();
        return res.status(200).json(summary);
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error loading reactions.' });
    }
});

//////////////////////////////////////
// SHARED LISTS
//////////////////////////////////////
app.get('/api/friends/:email/shared-lists', authenticateToken, async (req, res) => {
    const { email } = req.params;
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
            return res.status(403).json({ message: 'Not friends.' });
        }
        const [lists] = await connection.execute(
            `SELECT DISTINCT l.id, l.name, l.created_at, l.user_email AS ownerEmail,
                    u.first_name AS ownerFirstName, u.last_name AS ownerLastName, u.username AS ownerUsername
             FROM list l
             JOIN list_collaborator lc ON lc.list_id = l.id
             JOIN user u ON u.email = l.user_email
             WHERE lc.status = 'accepted'
               AND ((l.user_email = ? AND lc.collaborator_email = ?)
                 OR (l.user_email = ? AND lc.collaborator_email = ?))
             ORDER BY l.created_at ASC`,
            [req.user.email, email, email, req.user.email]
        );
        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                `SELECT li.id, li.title, li.added_at, li.added_by_email,
                        u.first_name AS addedByFirstName, u.last_name AS addedByLastName
                 FROM list_item li
                 LEFT JOIN user u ON u.email = li.added_by_email
                 WHERE li.list_id = ? ORDER BY li.added_at DESC`,
                [list.id]
            );
            listsWithItems.push({ ...list, items });
        }
        const [invitations] = await connection.execute(
            `SELECT lc.id, lc.list_id, lc.collaborator_email AS invited_email,
                    lc.invited_by_email, lc.created_at,
                    l.name AS listName,
                    u.first_name AS inviterFirstName, u.last_name AS inviterLastName
             FROM list_collaborator lc
             JOIN list l ON l.id = lc.list_id
             JOIN user u ON u.email = lc.invited_by_email
             WHERE lc.status = 'pending'
               AND ((lc.invited_by_email = ? AND lc.collaborator_email = ?)
                 OR (lc.invited_by_email = ? AND lc.collaborator_email = ?))`,
            [req.user.email, email, email, req.user.email]
        );
        await connection.end();
        return res.status(200).json({ lists: listsWithItems, invitations });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving shared lists.' });
    }
});

app.post('/api/friends/:email/shared-lists', authenticateToken, async (req, res) => {
    const { email } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'List name required.' });
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
            return res.status(403).json({ message: 'Not friends.' });
        }
        const [result] = await connection.execute(
            'INSERT INTO list (user_email, name) VALUES (?, ?)',
            [req.user.email, name]
        );
        const listId = result.insertId;
        await connection.execute(
            'INSERT INTO list_collaborator (list_id, collaborator_email, invited_by_email, status) VALUES (?, ?, ?, ?)',
            [listId, email, req.user.email, 'pending']
        );

        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection, email,
            'list_invitation', 'New List Invitation',
            `${actorLabel} invited you to collaborate on : ${name}.`,
            '/friends'
        );

        await connection.end();
        return res.status(201).json({ message: 'Invitation sent.', listId });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error creating shared list.' });
    }
});

app.get('/api/invitations/pending', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT lc.id, lc.list_id, lc.invited_by_email, lc.created_at,
                    l.name AS listName,
                    u.first_name AS inviterFirstName, u.last_name AS inviterLastName
             FROM list_collaborator lc
             JOIN list l ON l.id = lc.list_id
             JOIN user u ON u.email = lc.invited_by_email
             WHERE lc.collaborator_email = ? AND lc.status = 'pending'
             ORDER BY lc.created_at DESC`,
            [req.user.email]
        );
        await connection.end();
        return res.status(200).json({ invitations: rows });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error fetching invitations.' });
    }
});

app.put('/api/invitations/:id/accept', authenticateToken, async (req, res) => {
    const invId = parseInt(req.params.id, 10);
    if (!Number.isFinite(invId)) return res.status(400).json({ message: 'Invalid invitation id.' });

    let connection;
    try {
        connection = await createConnection();

        const [rows] = await connection.execute(
            `SELECT lc.id, lc.list_id, lc.invited_by_email, l.name AS listName
             FROM list_collaborator lc
             JOIN list l ON l.id = lc.list_id
             WHERE lc.id = ? AND lc.collaborator_email = ? AND lc.status = 'pending'`,
            [invId, req.user.email]
        );

        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Invitation not found.' });
        }

        const invitation = rows[0];

        const [result] = await connection.execute(
            `UPDATE list_collaborator SET status = 'accepted'
             WHERE id = ? AND collaborator_email = ? AND status = 'pending'`,
            [invId, req.user.email]
        );

        if (result.affectedRows === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Invitation not found.' });
        }

        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection,
            invitation.invited_by_email,
            'list_invitation_accepted',
            'List Invitation Accepted',
            `${actorLabel} accepted your invitation to ${invitation.listName}.`,
            '/friends'
        );

        await connection.end();
        return res.status(200).json({ message: 'Invitation accepted.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error accepting invitation.' });
    }
});

// FIX: was referencing undefined 'invitation' variable — now uses 'rows[0]' correctly
app.put('/api/invitations/:id/decline', authenticateToken, async (req, res) => {
    const invId = parseInt(req.params.id, 10);
    if (!Number.isFinite(invId)) return res.status(400).json({ message: 'Invalid invitation id.' });
    let connection;
    try {
        connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT lc.id, lc.list_id, lc.invited_by_email, l.name AS listName FROM list_collaborator lc JOIN list l ON l.id = lc.list_id WHERE lc.id = ? AND lc.collaborator_email = ? AND lc.status = ?',
            [invId, req.user.email, 'pending']
        );
        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'Invitation not found.' });
        }
        const invitation = rows[0];
        await connection.execute('DELETE FROM list_collaborator WHERE id = ?', [invId]);
        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection,
            invitation.invited_by_email,
            'list_invitation_declined',
            'List Invitation Declined',
            `${actorLabel} declined your invitation to ${invitation.listName}.`,
            '/friends'
        );
        await connection.end();
        return res.status(200).json({ message: 'Invitation declined.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error declining invitation.' });
    }
});

app.get('/api/recommendations/between/:email', authenticateToken, async (req, res) => {
    const { email } = req.params;
    let connection;
    try {
        connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT r.id, r.sender_email, r.receiver_email, r.title, r.type, r.note, r.sent_at, r.read_at,
                    u.first_name AS senderFirstName, u.last_name AS senderLastName
             FROM recommendation r
             JOIN user u ON u.email = r.sender_email
             WHERE (r.sender_email = ? AND r.receiver_email = ?)
                OR (r.sender_email = ? AND r.receiver_email = ?)
             ORDER BY r.sent_at ASC`,
            [req.user.email, email, email, req.user.email]
        );
        await connection.end();
        return res.status(200).json({ recommendations: rows });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving recommendations.' });
    }
});

//////////////////////////////////////
// LIST COLLABORATION
//////////////////////////////////////
app.post('/api/dashboard/lists/:listId/collaborators', authenticateToken, async (req, res) => {
    const listId = parseInt(req.params.listId, 10);
    const { collaboratorEmail } = req.body;
    if (!Number.isFinite(listId) || !collaboratorEmail) {
        return res.status(400).json({ message: 'listId and collaboratorEmail required.' });
    }
    let connection;
    try {
        connection = await createConnection();
        const [lists] = await connection.execute(
            'SELECT id, name FROM list WHERE id = ? AND user_email = ?',
            [listId, req.user.email]
        );
        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found or you are not the owner.' });
        }
        const listName = lists[0].name;

        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, collaboratorEmail, collaboratorEmail, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'You can only invite friends as collaborators.' });
        }
        await connection.execute(
            'INSERT IGNORE INTO list_collaborator (list_id, collaborator_email, invited_by_email) VALUES (?, ?, ?)',
            [listId, collaboratorEmail, req.user.email]
        );
        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection, collaboratorEmail,
            'list_invitation', 'New List Invitation',
            `${actorLabel} invited you to collaborate on : ${listName}.`,
            '/friends'
        );
        await connection.end();
        return res.status(201).json({ message: 'Collaborator added.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error adding collaborator.' });
    }
});

app.delete('/api/dashboard/lists/:listId/leave', authenticateToken, async (req, res) => {
    const listId = parseInt(req.params.listId, 10);
    if (!Number.isFinite(listId)) return res.status(400).json({ message: 'Invalid listId.' });
    let connection;
    try {
        connection = await createConnection();
        const [ownerRows] = await connection.execute(
            'SELECT user_email FROM list WHERE id = ?', [listId]
        );
        if (ownerRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }
        const ownerEmail = ownerRows[0].user_email;

        if (ownerEmail === req.user.email) {
            const [collabs] = await connection.execute(
                'SELECT collaborator_email FROM list_collaborator WHERE list_id = ? LIMIT 1', [listId]
            );
            if (collabs.length === 0) {
                await connection.end();
                return res.status(400).json({ message: 'List has no collaborators to transfer to.' });
            }
            const newOwner = collabs[0].collaborator_email;
            await connection.execute('UPDATE list SET user_email = ? WHERE id = ?', [newOwner, listId]);
            await connection.execute('DELETE FROM list_collaborator WHERE list_id = ?', [listId]);
        } else {
            const [result] = await connection.execute(
                'DELETE FROM list_collaborator WHERE list_id = ? AND collaborator_email = ?',
                [listId, req.user.email]
            );
            if (result.affectedRows === 0) {
                await connection.end();
                return res.status(404).json({ message: 'Not a collaborator on this list.' });
            }
        }
        await connection.end();
        return res.status(200).json({ message: 'Left shared list.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error leaving list.' });
    }
});

app.delete('/api/dashboard/lists/:listId/collaborators/:email', authenticateToken, async (req, res) => {
    const listId = parseInt(req.params.listId, 10);
    const { email } = req.params;
    if (!Number.isFinite(listId)) return res.status(400).json({ message: 'Invalid listId.' });
    let connection;
    try {
        connection = await createConnection();
        const [lists] = await connection.execute('SELECT id FROM list WHERE id = ? AND user_email = ?', [listId, req.user.email]);
        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }
        await connection.execute(
            'DELETE FROM list_collaborator WHERE list_id = ? AND collaborator_email = ?',
            [listId, email]
        );
        await connection.end();
        return res.status(200).json({ message: 'Collaborator removed.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error removing collaborator.' });
    }
});

app.get('/api/dashboard/shared-lists', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [lists] = await connection.execute(
            `SELECT l.id, l.name, l.created_at, l.user_email AS ownerEmail,
                    u.first_name AS ownerFirstName, u.last_name AS ownerLastName, u.username AS ownerUsername
             FROM list_collaborator lc
             JOIN list l ON l.id = lc.list_id
             JOIN user u ON u.email = l.user_email
             WHERE lc.collaborator_email = ?
             ORDER BY l.created_at ASC`,
            [req.user.email]
        );
        const listsWithItems = [];
        for (const list of lists) {
            const [items] = await connection.execute(
                `SELECT li.id, li.title, li.added_at, li.added_by_email,
                        u.first_name AS addedByFirstName, u.last_name AS addedByLastName
                 FROM list_item li
                 LEFT JOIN user u ON u.email = li.added_by_email
                 WHERE li.list_id = ? ORDER BY li.added_at DESC`,
                [list.id]
            );
            listsWithItems.push({ ...list, items });
        }
        await connection.end();
        return res.status(200).json({ lists: listsWithItems });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving shared lists.' });
    }
});

//////////////////////////////////////
// RECOMMENDATIONS
//////////////////////////////////////
app.post('/api/recommendations', authenticateToken, async (req, res) => {
    const { receiverEmail, title, type, note } = req.body;
    if (!receiverEmail || !title) {
        return res.status(400).json({ message: 'receiverEmail and title are required.' });
    }
    const contentType = type === 'show' ? 'show' : 'movie';
    let connection;
    try {
        connection = await createConnection();
        const [friendCheck] = await connection.execute(
            `SELECT id FROM friend_request
             WHERE ((sender_email = ? AND receiver_email = ?) OR (sender_email = ? AND receiver_email = ?))
             AND status = 'accepted'`,
            [req.user.email, receiverEmail, receiverEmail, req.user.email]
        );
        if (friendCheck.length === 0) {
            await connection.end();
            return res.status(403).json({ message: 'You can only recommend to friends.' });
        }
        await connection.execute(
            'INSERT INTO recommendation (sender_email, receiver_email, title, type, note) VALUES (?, ?, ?, ?, ?)',
            [req.user.email, receiverEmail, title.trim(), contentType, (note || '').trim() || null]
        );
        const actorLabel = await getUserDisplayName(connection, req.user.email);
        await createNotification(
            connection, receiverEmail, 'recommendation_received', 'New Recommendation',
            `${actorLabel} recommended ${title.trim()} (${contentType}) to you.`,
            '/suggestions'
        );

        await connection.end();
        return res.status(201).json({ message: 'Recommendation sent.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error sending recommendation.' });
    }
});

app.get('/api/recommendations/inbox', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT r.id, r.sender_email, r.title, r.type, r.note, r.sent_at, r.read_at,
                    u.first_name AS senderFirstName, u.last_name AS senderLastName, u.username AS senderUsername
             FROM recommendation r
             JOIN user u ON u.email = r.sender_email
             WHERE r.receiver_email = ?
             ORDER BY r.sent_at DESC`,
            [req.user.email]
        );
        await connection.end();
        return res.status(200).json({ recommendations: rows });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error retrieving recommendations.' });
    }
});

app.get('/api/recommendations/inbox/count', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await createConnection();
        const [[row]] = await connection.execute(
            'SELECT COUNT(*) AS cnt FROM recommendation WHERE receiver_email = ? AND read_at IS NULL',
            [req.user.email]
        );
        await connection.end();
        return res.status(200).json({ count: Number(row.cnt) });
    } catch (error) {
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(200).json({ count: 0 });
    }
});

app.delete('/api/recommendations/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
    let connection;
    try {
        connection = await createConnection();
        const [result] = await connection.execute(
            'DELETE FROM recommendation WHERE id = ? AND (receiver_email = ? OR sender_email = ?)',
            [id, req.user.email, req.user.email]
        );
        await connection.end();
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Not found.' });
        return res.status(200).json({ message: 'Recommendation deleted.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error deleting recommendation.' });
    }
});

app.put('/api/recommendations/:id/read', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id.' });
    let connection;
    try {
        connection = await createConnection();
        await connection.execute(
            'UPDATE recommendation SET read_at = UTC_TIMESTAMP() WHERE id = ? AND receiver_email = ? AND read_at IS NULL',
            [id, req.user.email]
        );
        await connection.end();
        return res.status(200).json({ message: 'Marked as read.' });
    } catch (error) {
        console.error(error);
        if (connection) { try { await connection.end(); } catch (_) {} }
        return res.status(500).json({ message: 'Error marking read.' });
    }
});

app.use(express.static('public'));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});