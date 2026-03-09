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
        cb(null, 'public/images/profiles/');
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

//////////////////////////////////////
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
// Default route to serve logon.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/html/logon.html');
});

// Route to serve dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/html/dashboard.html');
});

// Route to serve profile.html
app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/html/profile.html');
});

// Route to serve ratings.html
app.get('/ratings', (req, res) => {
    res.sendFile(__dirname + '/public/html/ratings.html');
});

// Route to serve friends.html
app.get('/friends', (req, res) => {
    res.sendFile(__dirname + '/public/html/friends.html');
});

// Route to serve subscriptions.html
app.get('/subscriptions', (req, res) => {
    res.sendFile(__dirname + '/public/html/subscriptions.html');
});

// Route to serve movies.html
app.get('/movies', (req, res) => {
    res.sendFile(__dirname + '/public/html/movies.html');
});

// Route to serve shows.html
app.get('/shows', (req, res) => {
    res.sendFile(__dirname + '/public/html/shows.html');
});

// Route to serve suggestions.html
app.get('/suggestions', (req, res) => {
    res.sendFile(__dirname + '/public/html/suggestions.html');
});

//////////////////////////////////////
//END ROUTES TO SERVE HTML FILES
//////////////////////////////////////


/////////////////////////////////////////////////
//HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
// Helper function to create a MySQL connection
async function createConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

// **Authorization Middleware: Verify JWT Token and Check User in Database**
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']; // "Bearer <token>"

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
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

}
/////////////////////////////////////////////////
//END HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////


//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////
// Route: Create Account
app.post('/api/create-account', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);  // Hash password

        const [result] = await connection.execute(
            'INSERT INTO user (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        await connection.end();  // Close connection

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
    }
});

// Route: Logon
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

        await connection.end();  // Close connection

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

        res.status(200).json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Route: Get current user's profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            `SELECT email, first_name, last_name, bio, profile_picture
             FROM user
             WHERE email = ?`,
            [req.user.email]
        );
        await connection.end();
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const u = rows[0];
        res.status(200).json({
            email: u.email,
            firstName: u.first_name || "",
            lastName: u.last_name || "",
            bio: u.bio || "",
            profilePicture: u.profile_picture || ""
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching profile.' });
    }
});

app.put('/api/profile', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    const { firstName, lastName, bio, newPassword } = req.body;
    let profilePicture = null;
    if (req.file) {
        profilePicture = "/images/profiles/" + req.file.filename;
    }
    try {
        const connection = await createConnection();
        // If user is changing password
        if (newPassword && newPassword.length >= 6) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            if (profilePicture) {
                await connection.execute(
                    `UPDATE user
                     SET first_name=?, last_name=?, bio=?, profile_picture=?, password=?
                     WHERE email=?`,
                    [firstName || null, lastName || null, bio || null, profilePicture, hashedPassword, req.user.email]
                );
            } else {
                await connection.execute(
                    `UPDATE user
                     SET first_name=?, last_name=?, bio=?, password=?
                     WHERE email=?`,
                    [firstName || null, lastName || null, bio || null, hashedPassword, req.user.email]
                );
            }
        } else {
            if (profilePicture) {
                await connection.execute(
                    `UPDATE user
                     SET first_name=?, last_name=?, bio=?, profile_picture=?
                     WHERE email=?`,
                    [firstName || null, lastName || null, bio || null, profilePicture, req.user.email]
                );
            } else {
                await connection.execute(
                    `UPDATE user
                     SET first_name=?, last_name=?, bio=?
                     WHERE email=?`,
                    [firstName || null, lastName || null, bio || null, req.user.email]
                );
            }
        }
        await connection.end();
        res.status(200).json({ message: "Profile updated." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating profile." });
    }
});

// Route: Get current user's watch history (with ratings, includes rated-only items)
app.get('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [whRows] = await connection.execute(
            `SELECT wh.id, wh.title, wh.type, wh.watched_at, r.rating, r.review
             FROM watch_history wh
             LEFT JOIN rating r ON r.user_email = wh.user_email AND r.title = wh.title AND r.type = wh.type
             WHERE wh.user_email = ?
             ORDER BY wh.watched_at DESC`,
            [req.user.email]
        );
        const [ratingOnlyRows] = await connection.execute(
            `SELECT r.id, r.title, r.type, r.rated_at, r.rating, r.review
             FROM rating r
             WHERE r.user_email = ?
             AND NOT EXISTS (SELECT 1 FROM watch_history wh WHERE wh.user_email = r.user_email AND wh.title = r.title AND wh.type = r.type)
             ORDER BY r.rated_at DESC`,
            [req.user.email]
        );
        await connection.end();
        const fromWh = whRows.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            watched_at: r.watched_at,
            rating: r.rating,
            review: r.review
        }));
        const fromRatings = ratingOnlyRows.map(r => ({
            id: r.id + 1000000,
            title: r.title,
            type: r.type,
            watched_at: r.rated_at,
            rating: r.rating,
            review: r.review
        }));
        const watchHistory = [...fromWh, ...fromRatings]
            .sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at))
            .slice(0, 50);
        res.status(200).json({ watchHistory });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving watch history.' });
    }
});

// Route: Get current user's ratings
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

// Route: Add to watch history (also marks as completed in status)
app.post('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const titleTrim = (title || '').trim();
    if (!titleTrim) return res.status(400).json({ message: 'Title is required.' });
    const contentType = type === 'show' ? 'show' : 'movie';
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
            console.error('watch_status insert failed:', statusErr.message);
        }
        await connection.end();
        res.status(201).json({ message: 'Added to watch history and marked as completed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to watch history.' });
    }
});

// Route: Add rating (also adds to watch history + marks as completed in status)
app.post('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type, rating, review } = req.body;
    const titleTrim = (title || '').trim();
    if (!titleTrim || !rating) return res.status(400).json({ message: 'Title and rating are required.' });
    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) return res.status(400).json({ message: 'Rating must be 1-5.' });
    const contentType = type === 'show' ? 'show' : 'movie';
    try {
        const connection = await createConnection();
        await connection.execute(
            'INSERT INTO rating (user_email, title, type, rating, review) VALUES (?, ?, ?, ?, ?)',
            [req.user.email, titleTrim, contentType, r, review || null]
        );
        const [existingWh] = await connection.execute(
            'SELECT 1 FROM watch_history WHERE user_email = ? AND title = ? AND type = ? LIMIT 1',
            [req.user.email, titleTrim, contentType]
        );
        if (existingWh.length === 0) {
            await connection.execute(
                'INSERT INTO watch_history (user_email, title, type) VALUES (?, ?, ?)',
                [req.user.email, titleTrim, contentType]
            );
        }
        try {
            await connection.execute(
                `INSERT INTO watch_status (user_email, title, type, status)
                 VALUES (?, ?, ?, 'completed')
                 ON DUPLICATE KEY UPDATE status = 'completed'`,
                [req.user.email, titleTrim, contentType]
            );
        } catch (statusErr) {
            console.error('watch_status insert failed (table may not exist):', statusErr.message);
        }
        await connection.end();
        res.status(201).json({ message: 'Rating added. Added to watch history and marked as completed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding rating.' });
    }
});

// Route: Update rating (by title + type)
app.put('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type, rating, review } = req.body;
    const titleTrim = (title || '').trim();
    if (!titleTrim || !rating) return res.status(400).json({ message: 'Title and rating are required.' });
    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) return res.status(400).json({ message: 'Rating must be 1-5.' });
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

// Route: Create list
app.post('/api/dashboard/lists', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'List name is required.' });
    try {
        const connection = await createConnection();
        const [result] = await connection.execute(
            'INSERT INTO list (user_email, name) VALUES (?, ?)',
            [req.user.email, name]
        );
        await connection.end();
        res.status(201).json({ message: 'List created.', listId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating list.' });
    }
});

// Route: Add item to list
app.post('/api/dashboard/lists/:listId/items', authenticateToken, async (req, res) => {
    const { listId } = req.params;
    const { title } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    try {
        const connection = await createConnection();
        const [lists] = await connection.execute('SELECT id FROM list WHERE id = ? AND user_email = ?', [listId, req.user.email]);
        if (lists.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'List not found.' });
        }
         // avoids duplicates //
    const [existing] = await connection.execute(
    'SELECT id FROM list_item WHERE list_id = ? AND title = ?',
    [listId, title]
    );

    if (existing.length > 0) {
    await connection.end();
    return res.status(409).json({ message: 'Item already in list.' });
    }
        await connection.execute('INSERT INTO list_item (list_id, title) VALUES (?, ?)', [listId, title]);
        await connection.end();
        res.status(201).json({ message: 'Item added to list.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to list.' });
    }
});

// Route: Get current user's lists with items
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
        res.status(200).json({ lists: listsWithItems });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving lists.' });
    }
});

// Route: Get personalized suggestions (uses ratings to improve recommendations)
app.get('/api/suggestions', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const email = req.user.email;

        // Get user's rating count
        const [[{ count: ratingsCount }]] = await connection.execute(
            'SELECT COUNT(*) as count FROM rating WHERE user_email = ?',
            [email]
        );

        // Titles from watch history that user hasn't rated yet (suggest to rate)
        const [toRateRows] = await connection.execute(
            `SELECT wh.title, wh.type FROM watch_history wh
             LEFT JOIN rating r ON r.user_email = wh.user_email AND LOWER(r.title) = LOWER(wh.title)
             WHERE wh.user_email = ? AND r.id IS NULL
             LIMIT 10`,
            [email]
        );

        // Recommendations: titles other users rated 4-5 stars that this user hasn't rated
        const [recRows] = await connection.execute(
            `SELECT DISTINCT r.title, r.type, AVG(r.rating) as avg_rating
             FROM rating r
             WHERE r.user_email != ?
             AND r.rating >= 4
             AND NOT EXISTS (
                 SELECT 1 FROM rating r2 WHERE r2.user_email = ? AND LOWER(r2.title) = LOWER(r.title)
             )
             GROUP BY r.title, r.type
             ORDER BY avg_rating DESC
             LIMIT 10`,
            [email, email]
        );

        await connection.end();

        res.status(200).json({
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
        res.status(500).json({ message: 'Error retrieving suggestions.' });
    }
});

// Route: Get All Email Addresses (optional ?q= for search)
app.get('/api/users', authenticateToken, async (req, res) => {
    const q = (req.query.q || '').trim();
    try {
        const connection = await createConnection();
        let rows;
        if (q.length >= 1) {
            const pattern = '%' + q + '%';
            [rows] = await connection.execute(
                'SELECT email FROM user WHERE email LIKE ? AND email != ?',
                [pattern, req.user.email]
            );
        } else {
            [rows] = await connection.execute(
                'SELECT email FROM user WHERE email != ?',
                [req.user.email]
            );
        }
        await connection.end();
        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving users.' });
    }
});

// Route: Get current user's friends
app.get('/api/friends', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT friend_email FROM friend WHERE user_email = ? ORDER BY created_at DESC',
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ friends: rows.map(r => r.friend_email) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching friends.' });
    }
});

// Route: Add friend
app.post('/api/friends', authenticateToken, async (req, res) => {
    const { friendEmail } = req.body;
    const friend = (friendEmail || '').trim().toLowerCase();
    if (!friend) return res.status(400).json({ message: 'Friend email required.' });
    if (friend === req.user.email.toLowerCase()) {
        return res.status(400).json({ message: 'Cannot add yourself.' });
    }
    try {
        const connection = await createConnection();
        const [users] = await connection.execute('SELECT email FROM user WHERE email = ?', [friend]);
        if (users.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }
        await connection.execute(
            'INSERT INTO friend (user_email, friend_email) VALUES (?, ?)',
            [req.user.email, users[0].email]
        );
        await connection.end();
        res.status(201).json({ message: 'Friend added.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Already friends.' });
        }
        console.error(error);
        res.status(500).json({ message: 'Error adding friend.' });
    }
});
// TMDB: Batch poster lookup for titles
app.post('/api/tmdb/posters', authenticateToken, async (req, res) => {
    const items = req.body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(200).json({ posters: {} });
    }
    if (items.length > 50) {
        return res.status(400).json({ message: 'Max 50 items per request.' });
    }
    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }
    const key = process.env.TMDB_API_KEY;
    const base = 'https://api.themoviedb.org/3';
    const posters = {};
    const seen = new Set();
    const unique = items.filter(({ title, type }) => {
        const k = `${(title || '').toLowerCase()}|${type || 'movie'}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return (title || '').trim().length >= 2;
    });
    try {
        await Promise.all(unique.map(async ({ title, type }) => {
            const endpoint = type === 'tv' ? 'search/tv' : 'search/movie';
            const url = `${base}/${endpoint}?api_key=${key}&query=${encodeURIComponent(title.trim())}&language=en-US&include_adult=false`;
            const tmdbRes = await fetch(url);
            if (!tmdbRes.ok) return;
            const data = await tmdbRes.json();
            const results = data.results || [];
            const first = results[0];
            if (first && first.poster_path) {
                posters[`${title}|${type || 'movie'}`] = first.poster_path;
            }
        }));
        res.status(200).json({ posters });
    } catch (error) {
        console.error('TMDB posters error:', error);
        res.status(500).json({ message: 'Error fetching posters.' });
    }
});

// TMDB: Search movies or TV (type=movie or type=tv)
app.get('/api/tmdb/search', authenticateToken, async (req, res) => {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'movie';
    if (q.length < 2) {
        return res.status(400).json({ message: 'Query must be at least 2 characters' });
    }
    if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your-tmdb-api-key-here') {
        return res.status(503).json({ message: 'TMDB API key not configured.' });
    }
    try {
        const base = 'https://api.themoviedb.org/3';
        const key = process.env.TMDB_API_KEY;
        const encoded = encodeURIComponent(q);
        const endpoint = type === 'tv' ? 'search/tv' : 'search/movie';
        const url = `${base}/${endpoint}?api_key=${key}&query=${encoded}&language=en-US&include_adult=false`;
        const tmdbRes = await fetch(url);
        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }
        const data = await tmdbRes.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('TMDB search error:', error);
        res.status(500).json({ message: 'Error searching TMDB.' });
    }
});

// TMDB: Trending Movies only
app.get('/api/trending/movies', authenticateToken, async (req, res) => {
    try {
        const url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);

        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }

        const data = await tmdbRes.json();
        res.status(200).json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error calling TMDB.' });
    }
});

// TMDB: Trending TV Shows only
app.get('/api/trending/shows', authenticateToken, async (req, res) => {
    try {
        const url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${process.env.TMDB_API_KEY}`;
        const tmdbRes = await fetch(url);

        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ message: 'TMDB request failed' });
        }

        const data = await tmdbRes.json();
        res.status(200).json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error calling TMDB.' });
    }
});

// Route: Get Watch Statuses (syncs watch_history → completed in watch_status first)
app.get('/api/dashboard/status', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const email = req.user.email;

        // Backfill: ensure all watch_history items exist in watch_status as 'completed'
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
            if (syncErr.code !== 'ER_NO_SUCH_TABLE') console.error('watch_status sync:', syncErr.message);
        }

        const [rows] = await connection.execute(
            'SELECT title, type, status FROM watch_status WHERE user_email = ? ORDER BY updated_at DESC',
            [email]
        );
        await connection.end();
        res.status(200).json({ statuses: rows });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(200).json({ statuses: [] });
        }
        console.error(error);
        res.status(500).json({ message: 'Error fetching statuses.' });
    }
});

// Route: Set or Update Watch Status
app.post('/api/dashboard/status', authenticateToken, async (req, res) => {
    const { title, type, status } = req.body;

    if (!title || !status) {
        return res.status(400).json({ message: 'Title and status required.' });
    }

    try {
        const connection = await createConnection();

        await connection.execute(
            `INSERT INTO watch_status (user_email, title, type, status)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [req.user.email, title, type || 'movie', status]
        );

        await connection.end();

        res.status(200).json({ message: 'Status updated.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating status.' });
    }
});

app.delete('/api/dashboard/status', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const email = req.user.email;

    try {
        const connection = await createConnection();

        await connection.execute(
            'DELETE FROM watch_status WHERE user_email = ? AND title = ? AND type = ?',
            [email, title, type || 'movie']
        );

        await connection.end();

        res.status(200).json({ message: 'Status removed.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error removing status.' });
    }
});

app.delete('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const email = req.user.email;

    try {
        const connection = await createConnection();
        await connection.execute(
            'DELETE FROM rating WHERE user_email = ? AND title = ? AND type = ?',
            [email, title, type || 'movie']
        );
        await connection.end();
        res.status(200).json({ message: 'Rating deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete rating' });
    }
});

app.delete('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    const email = req.user.email;

    try {
        const connection = await createConnection();
        await connection.execute(
            'DELETE FROM watch_history WHERE user_email = ? AND title = ? AND type = ?',
            [email, title, type || 'movie']
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete watch history' });
    }
    app.delete('/api/dashboard/lists/items', authenticateToken, async (req, res) => {

    const { title } = req.body;

    try {
        const connection = await createConnection();

        await connection.execute(
            `DELETE li
             FROM list_item li
             JOIN list l ON li.list_id = l.id
             WHERE l.user_email = ? AND li.title = ?`,
            [req.user.email, title]
        );

        await connection.end();

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error deleting list item.' });
    }
});
});


//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});