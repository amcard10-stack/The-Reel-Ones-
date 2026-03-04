require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

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

// Route to serve recommendations.html
app.get('/recommendations', (req, res) => {
    res.sendFile(__dirname + '/public/html/recommendations.html');
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

// Route: Get current user's watch history
app.get('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT id, title, type, watched_at FROM watch_history WHERE user_email = ? ORDER BY watched_at DESC LIMIT 20',
            [req.user.email]
        );
        await connection.end();
        res.status(200).json({ watchHistory: rows });
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

// Route: Add to watch history
app.post('/api/dashboard/watch-history', authenticateToken, async (req, res) => {
    const { title, type } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    try {
        const connection = await createConnection();
        await connection.execute(
            'INSERT INTO watch_history (user_email, title, type) VALUES (?, ?, ?)',
            [req.user.email, title, type || 'movie']
        );
        await connection.end();
        res.status(201).json({ message: 'Added to watch history.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to watch history.' });
    }
});

// Route: Add rating
app.post('/api/dashboard/ratings', authenticateToken, async (req, res) => {
    const { title, type, rating, review } = req.body;
    if (!title || !rating) return res.status(400).json({ message: 'Title and rating are required.' });
    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) return res.status(400).json({ message: 'Rating must be 1-5.' });
    const contentType = type === 'show' ? 'show' : 'movie';
    try {
        const connection = await createConnection();
        await connection.execute(
            'INSERT INTO rating (user_email, title, type, rating, review) VALUES (?, ?, ?, ?, ?)',
            [req.user.email, title, contentType, r, review || null]
        );
        await connection.end();
        res.status(201).json({ message: 'Rating added.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding rating.' });
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

// Route: Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();  // Close connection

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
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

//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});