const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS, assets) from the project root
app.use(express.static(path.join(__dirname)));

// ─── MySQL Connection Pool ────────────────────────────────────────────────────
// Set these environment variables on your host, or replace the fallbacks below
// with your InfinityFree credentials (never commit real passwords to git).
//
//   DB_HOST     = sql308.infinityfree.com
//   DB_USER     = if0_42145933
//   DB_PASSWORD = <your password>
//   DB_NAME     = if0_42145933_coflowery
//   DB_PORT     = 3306  (optional)
// ─────────────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'sql308.infinityfree.com',
    user:     process.env.DB_USER     || 'if0_42145933',
    password: process.env.DB_PASSWORD || '',          // ← fill in or set env var
    database: process.env.DB_NAME     || 'if0_42145933_coflowery',
    port:     Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
});

// ─── Initialize Tables & Seed Products ───────────────────────────────────────
async function initDB() {
    // Drop & recreate products table on every start (keeps catalog fresh)
    await pool.query(`DROP TABLE IF EXISTS products`);

    await pool.query(`
        CREATE TABLE products (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            title       VARCHAR(255) UNIQUE NOT NULL,
            price       FLOAT        NOT NULL,
            img         TEXT         NOT NULL,
            description TEXT         NOT NULL,
            category    VARCHAR(50)  NOT NULL
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id       INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            email    VARCHAR(255) UNIQUE NOT NULL,
            password TEXT         NOT NULL
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS profiles (
            userId     INT PRIMARY KEY,
            fullName   VARCHAR(255),
            phone      VARCHAR(50),
            country    VARCHAR(100),
            address1   TEXT,
            address2   TEXT,
            city       VARCHAR(100),
            province   VARCHAR(100),
            postalCode VARCHAR(20),
            notes      TEXT,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            userId      INT,
            orderId     VARCHAR(100) UNIQUE NOT NULL,
            date        TEXT         NOT NULL,
            items       TEXT         NOT NULL,
            subtotal    FLOAT        NOT NULL,
            shipping    FLOAT        NOT NULL,
            discount    FLOAT        NOT NULL,
            total       FLOAT        NOT NULL,
            paymentType VARCHAR(100),
            voucherCode VARCHAR(100),
            status      VARCHAR(50),
            estimate    VARCHAR(50),
            createdAt   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ratings (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            userId       INT,
            productTitle VARCHAR(255) NOT NULL,
            ratingValue  INT          NOT NULL CHECK(ratingValue BETWEEN 1 AND 5),
            comment      TEXT,
            createdAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_product (userId, productTitle),
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS comments (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            productTitle VARCHAR(255) NOT NULL,
            text         TEXT         NOT NULL,
            author       VARCHAR(100) NOT NULL DEFAULT 'Guest',
            authorId     VARCHAR(50),
            parentId     INT,
            date         TEXT,
            createdAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parentId) REFERENCES comments(id) ON DELETE CASCADE
        )
    `);

    const sampleProducts = [
        // Flowers
        { title: 'Rose Bouquet',      price: 500,   img: 'assets/flowers/rose-bouquet.jpg',      description: 'A classic choice for expressing deep love and romance.',      category: 'flower' },
        { title: 'Tulip Bouquet',     price: 200,   img: 'assets/flowers/tulip-bouquet.jpg',     description: 'Vibrant and fresh, symbolizing perfect love.',                category: 'flower' },
        { title: 'Sunflower Bouquet', price: 300,   img: 'assets/flowers/sunflower-bouquet.jpg', description: 'Bright and cheerful, perfect for spreading joy.',             category: 'flower' },
        { title: 'Orchid Bouquet',    price: 200,   img: 'assets/flowers/orchid-bouquet.jpg',    description: 'Elegant and delicate, symbolizing luxury and beauty.',        category: 'flower' },
        { title: 'Lily Bouquet',      price: 250,   img: 'assets/flowers/lily-bouquet.jpg',      description: 'Pure and elegant lilies for any occasion.',                  category: 'flower' },
        // Coffee
        { title: 'Americano',  price: 75,  img: 'assets/coffees/americano.jpg',  description: 'Bold and refreshing espresso diluted with hot water.',           category: 'coffee' },
        { title: 'Latte',      price: 95,  img: 'assets/coffees/latte.jpg',      description: 'Smooth espresso with steamed milk and a thin layer of foam.',    category: 'coffee' },
        { title: 'Cappuccino', price: 90,  img: 'assets/coffees/cappuccino.jpg', description: 'Equal parts espresso, steamed milk, and milk foam.',             category: 'coffee' },
        { title: 'Espresso',   price: 55,  img: 'assets/coffees/espresso.jpg',   description: 'A rich, concentrated shot for pure coffee intensity.',           category: 'coffee' },
        { title: 'Mocha',      price: 110, img: 'assets/coffees/mocha.jpg',      description: 'A sweet blend of espresso, chocolate, and steamed milk.',        category: 'coffee' },
        // Desserts
        { title: 'Brownies',        price: 70, img: 'assets/desserts/brownies.jpg',   description: 'Fudgy and rich, perfect warmed up with coffee.',                      category: 'dessert' },
        { title: 'Chocolate Cake',  price: 65, img: 'assets/desserts/choccake.jpg',   description: 'Moist, decadent layers of pure chocolate.',                            category: 'dessert' },
        { title: 'Crossini',        price: 55, img: 'assets/desserts/crossini.jpg',   description: 'Flaky pastry, light and airy, ideal with cappuccino.',                 category: 'dessert' },
        { title: 'Cheesecake',      price: 75, img: 'assets/desserts/cheesecake.jpg', description: 'Creamy, tangy, and served on a graham crust.',                         category: 'dessert' },
        { title: 'Macarons',        price: 85, img: 'assets/desserts/macarons.jpg',   description: 'Sweet meringue-based confection with ganache filling.',                category: 'dessert' },
        // Promos
        { title: 'Latte Promo',      price: 70, img: 'https://via.placeholder.com/300x200?text=Promo+Latte',      description: 'Special discount on our best-selling Latte.',           category: 'promo' },
        { title: 'Cappuccino Promo', price: 65, img: 'https://via.placeholder.com/300x200?text=Promo+Cappuccino', description: 'Limited time offer: enjoy a complimentary pastry.',      category: 'promo' },
        { title: 'Espresso Promo',   price: 55, img: 'https://via.placeholder.com/300x200?text=Promo+Espresso',   description: 'Double-shot special for an extra kickstart.',            category: 'promo' },
        { title: 'Mocha Promo',      price: 75, img: 'https://via.placeholder.com/300x200?text=Promo+Mocha',      description: 'Save big on our delicious chocolate mocha.',             category: 'promo' },
        { title: 'Cake Promo',       price: 50, img: 'https://via.placeholder.com/300x200?text=Promo+Cake',       description: 'Discounted slices at the end of the day.',              category: 'promo' }
    ];

    for (const p of sampleProducts) {
        await pool.query(
            `INSERT IGNORE INTO products (title, price, img, description, category) VALUES (?, ?, ?, ?, ?)`,
            [p.title, p.price, p.img, p.description, p.category]
        );
    }

    console.log('Cloud database initialized. ☁️');
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM products`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get featured products by rating and order popularity
app.get('/api/featured', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.*,
                   COALESCE(r.avgRating, 0)   AS averageRating,
                   COALESCE(r.ratingCount, 0) AS ratingCount
            FROM products p
            LEFT JOIN (
                SELECT productTitle,
                       AVG(ratingValue) AS avgRating,
                       COUNT(*)         AS ratingCount
                FROM ratings
                GROUP BY productTitle
            ) r ON r.productTitle = p.title
            ORDER BY averageRating DESC, ratingCount DESC, p.title ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Signup new user
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const [result] = await pool.query(
            `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
            [username, email, password]
        );
        res.status(201).json({ message: 'User created successfully', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Login existing user
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const [rows] = await pool.query(
            `SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?`,
            [identifier, identifier, password]
        );
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid username or password.' });
        const row = rows[0];
        res.json({ message: 'Login successful', user: { id: row.id, username: row.username, email: row.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get account profile data
app.get('/api/account/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.username, u.email,
                   p.fullName, p.phone, p.country, p.address1, p.address2,
                   p.city, p.province, p.postalCode, p.notes
            FROM users u
            LEFT JOIN profiles p ON u.id = p.userId
            WHERE u.id = ?
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save account profile data
app.post('/api/account', async (req, res) => {
    const { id, username, email, fullName, phone, country, address1, address2, city, province, postalCode, notes } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing user id.' });
    try {
        await pool.query(
            `UPDATE users SET username = ?, email = ? WHERE id = ?`,
            [username, email, id]
        );
        await pool.query(`
            INSERT INTO profiles (userId, fullName, phone, country, address1, address2, city, province, postalCode, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                fullName   = VALUES(fullName),
                phone      = VALUES(phone),
                country    = VALUES(country),
                address1   = VALUES(address1),
                address2   = VALUES(address2),
                city       = VALUES(city),
                province   = VALUES(province),
                postalCode = VALUES(postalCode),
                notes      = VALUES(notes)
        `, [id, fullName || '', phone || '', country || '', address1 || '', address2 || '', city || '', province || '', postalCode || '', notes || '']);
        res.json({ message: 'Profile saved.', user: { id, username, email } });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Save order data
app.post('/api/orders', async (req, res) => {
    const { userId, orderId, date, items, subtotal, shipping, discount, total, paymentType, voucherCode, status, estimate } = req.body;
    if (!orderId || !date || !items || typeof subtotal !== 'number' || typeof total !== 'number') {
        return res.status(400).json({ error: 'Incomplete order payload.' });
    }
    try {
        const [result] = await pool.query(`
            INSERT INTO orders (userId, orderId, date, items, subtotal, shipping, discount, total, paymentType, voucherCode, status, estimate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId || null,
            orderId,
            date,
            JSON.stringify(items),
            subtotal,
            shipping,
            discount,
            total,
            paymentType || 'Cash on Delivery',
            voucherCode || '',
            status || 'Preparing',
            estimate || ''
        ]);
        res.status(201).json({ message: 'Order saved.', orderId, id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get orders for a user
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC`,
            [userId]
        );
        const orders = rows.map(row => ({ ...row, items: JSON.parse(row.items || '[]') }));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get average rating for a product
// MySQL rewrite of the PostgreSQL DISTINCT ON subquery
app.get('/api/ratings/:title', async (req, res) => {
    const { title } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT AVG(ratingValue) AS average, COUNT(*) AS count
            FROM (
                SELECT COALESCE(CAST(userId AS CHAR), CAST(id AS CHAR)) AS voter,
                       ratingValue,
                       ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(CAST(userId AS CHAR), CAST(id AS CHAR))
                           ORDER BY id DESC
                       ) AS rn
                FROM ratings
                WHERE productTitle = ?
            ) sub
            WHERE rn = 1
        `, [title]);
        const row = rows[0];
        const average = row && row.average ? parseFloat(row.average).toFixed(1) : 4.5;
        const count   = row ? parseInt(row.count) : 0;
        res.json({ average: parseFloat(average), count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a new rating
app.post('/api/ratings', async (req, res) => {
    const { userId, productTitle, ratingValue, comment } = req.body;
    if (!productTitle || !ratingValue || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({ error: 'Invalid rating data.' });
    }
    try {
        if (userId) {
            await pool.query(`
                INSERT INTO ratings (userId, productTitle, ratingValue, comment)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    ratingValue = VALUES(ratingValue),
                    comment     = VALUES(comment),
                    createdAt   = CURRENT_TIMESTAMP
            `, [userId, productTitle, ratingValue, comment || '']);
            res.json({ message: 'Rating submitted successfully' });
        } else {
            const [result] = await pool.query(`
                INSERT INTO ratings (userId, productTitle, ratingValue, comment)
                VALUES (NULL, ?, ?, ?)
            `, [productTitle, ratingValue, comment || '']);
            res.json({ message: 'Rating submitted successfully', id: result.insertId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all comments for a product
app.get('/api/comments/:productTitle', async (req, res) => {
    const { productTitle } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT * FROM comments WHERE productTitle = ? ORDER BY createdAt ASC`,
            [decodeURIComponent(productTitle)]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Post a new comment or reply
app.post('/api/comments', async (req, res) => {
    const { productTitle, text, author, authorId, parentId, date } = req.body;
    if (!productTitle || !text) return res.status(400).json({ error: 'Missing required fields.' });
    try {
        const [result] = await pool.query(`
            INSERT INTO comments (productTitle, text, author, authorId, parentId, date)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            productTitle,
            text,
            author || 'Guest',
            authorId ? String(authorId) : null,
            parentId || null,
            date || new Date().toLocaleDateString()
        ]);
        const [rows] = await pool.query(`SELECT * FROM comments WHERE id = ?`, [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit a comment (owner only)
app.put('/api/comments/:id', async (req, res) => {
    const { id } = req.params;
    const { text, authorId } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text.' });
    try {
        const [result] = await pool.query(
            `UPDATE comments SET text = ? WHERE id = ? AND authorId = ?`,
            [text, id, String(authorId)]
        );
        if (result.affectedRows === 0) return res.status(403).json({ error: 'Not authorized or comment not found.' });
        const [rows] = await pool.query(`SELECT * FROM comments WHERE id = ?`, [id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a comment (owner only) — replies auto-deleted via ON DELETE CASCADE
app.delete('/api/comments/:id', async (req, res) => {
    const { id } = req.params;
    const { authorId } = req.body;
    try {
        const [result] = await pool.query(
            `DELETE FROM comments WHERE id = ? AND authorId = ?`,
            [id, String(authorId)]
        );
        if (result.affectedRows === 0) return res.status(403).json({ error: 'Not authorized or comment not found.' });
        res.json({ message: 'Comment deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
const ADMIN_USERNAMES = new Set(['admin']);

async function requireAdmin(req, res, next) {
    const username = (req.headers['x-admin-username'] || '').toLowerCase();
    if (!ADMIN_USERNAMES.has(username)) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

// Get ALL orders (admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT o.*, u.username FROM orders o
             LEFT JOIN users u ON o.userId = u.id
             ORDER BY o.createdAt DESC`
        );
        const orders = rows.map(row => ({ ...row, items: JSON.parse(row.items || '[]') }));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update order status (admin)
app.put('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status, estimate } = req.body;
    try {
        const [result] = await pool.query(
            `UPDATE orders SET status = ?, estimate = ? WHERE id = ?`,
            [status || 'Preparing', estimate || '', id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found.' });
        res.json({ message: 'Order updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ALL comments across all products (admin)
app.get('/api/admin/comments', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM comments ORDER BY createdAt DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete any comment by ID (admin, bypasses authorId check)
app.delete('/api/admin/comments/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(`DELETE FROM comments WHERE id = ?`, [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Comment not found.' });
        res.json({ message: 'Comment deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ALL users (admin) — passwords excluded
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT id, username, email FROM users ORDER BY id ASC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a new product (admin)
app.post('/api/products', requireAdmin, async (req, res) => {
    const { title, price, img, description, category } = req.body;
    if (!title || !price || !img || !description || !category) {
        return res.status(400).json({ error: 'All product fields are required.' });
    }
    try {
        const [result] = await pool.query(
            `INSERT INTO products (title, price, img, description, category) VALUES (?, ?, ?, ?, ?)`,
            [title, price, img, description, category]
        );
        res.status(201).json({ message: 'Product added.', id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A product with this title already exists.' });
        res.status(500).json({ error: err.message });
    }
});

// Update a product (admin)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, price, img, description, category } = req.body;
    try {
        const [result] = await pool.query(
            `UPDATE products SET title=?, price=?, img=?, description=?, category=? WHERE id=?`,
            [title, price, img, description, category, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found.' });
        res.json({ message: 'Product updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a product (admin)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(`DELETE FROM products WHERE id = ?`, [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found.' });
        res.json({ message: 'Product deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find user by identifier (for forgot-password flow)
app.post('/api/forgot-password/find', async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Identifier required.' });
    try {
        const [rows] = await pool.query(
            `SELECT u.id, u.email, p.phone FROM users u
             LEFT JOIN profiles p ON u.id = p.userId
             WHERE u.username = ? OR u.email = ?`,
            [identifier, identifier]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
    const { identifier, newPassword } = req.body;
    if (!identifier || !newPassword) return res.status(400).json({ error: 'Missing fields.' });
    try {
        const [result] = await pool.query(
            `UPDATE users SET password = ? WHERE username = ? OR email = ?`,
            [newPassword, identifier, identifier]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Account not found.' });
        res.json({ message: 'Password reset successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
initDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Backend API live at http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
