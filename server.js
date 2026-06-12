const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');                          // ← NEW: needed to read/write products_tmp.json
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS, assets) from the project root
app.use(express.static(path.join(__dirname)));

// Connect to PostgreSQL cloud database via environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ─────────────────────────────────────────────────────────────────────────────
// products_tmp.json SYNC HELPERS
// These two functions keep products_tmp.json in sync with the database
// whenever a product is added, edited, or deleted from the admin panel.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS_TMP_PATH = path.join(__dirname, 'products_tmp.json');

/**
 * readProductsTmp()
 * Safely reads and parses products_tmp.json.
 * Handles two quirks of the original file:
 *   1. UTF-16 LE BOM character (0xFEFF) at the start — stripped before parsing.
 *   2. JavaScript-style // comments — stripped because JSON.parse() rejects them.
 * Returns an empty array if the file is missing or unparseable.
 */
function readProductsTmp() {
    try {
        const raw = fs.readFileSync(PRODUCTS_TMP_PATH, 'utf8')
            .replace(/^\uFEFF/, '')           // strip BOM
            .replace(/\/\/[^\n]*/g, '');      // strip // comments
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

/**
 * writeProductsTmp(products)
 * Serialises the products array back to products_tmp.json as clean,
 * formatted JSON (4-space indent). The // comments from the original
 * file will not be re-added — the file becomes standard JSON going forward.
 */
function writeProductsTmp(products) {
    fs.writeFileSync(PRODUCTS_TMP_PATH, JSON.stringify(products, null, 4), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────

// Initialize tables and seed product data
async function initDB() {
    const client = await pool.connect();
    try {
        // ← FIXED (from previous session): was DROP TABLE which wiped admin-added products on every restart.
        // Now uses CREATE TABLE IF NOT EXISTS so existing rows are preserved.
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title TEXT UNIQUE NOT NULL,
                price REAL NOT NULL,
                img TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                "userId" INTEGER PRIMARY KEY REFERENCES users(id),
                "fullName" TEXT,
                phone TEXT,
                country TEXT,
                address1 TEXT,
                address2 TEXT,
                city TEXT,
                province TEXT,
                "postalCode" TEXT,
                notes TEXT
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES users(id),
                "orderId" TEXT UNIQUE NOT NULL,
                date TEXT NOT NULL,
                items TEXT NOT NULL,
                subtotal REAL NOT NULL,
                shipping REAL NOT NULL,
                discount REAL NOT NULL,
                total REAL NOT NULL,
                "paymentType" TEXT,
                "voucherCode" TEXT,
                status TEXT,
                estimate TEXT,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ratings (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES users(id),
                "productTitle" TEXT NOT NULL,
                "ratingValue" INTEGER NOT NULL CHECK("ratingValue" BETWEEN 1 AND 5),
                comment TEXT,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE("userId", "productTitle")
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                "productTitle" TEXT NOT NULL,
                text TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT 'Guest',
                "authorId" TEXT,
                "parentId" INTEGER REFERENCES comments(id) ON DELETE CASCADE,
                date TEXT,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const sampleProducts = [
            // Flowers
            { title: 'Rose Bouquet', price: 500, img: 'assets/flowers/rose-bouquet.jpg', description: 'A classic choice for expressing deep love and romance.', category: 'flower' },
            { title: 'Tulip Bouquet', price: 200, img: 'assets/flowers/tulip-bouquet.jpg', description: 'Vibrant and fresh, symbolizing perfect love.', category: 'flower' },
            { title: 'Sunflower Bouquet', price: 300, img: 'assets/flowers/sunflower-bouquet.jpg', description: 'Bright and cheerful, perfect for spreading joy.', category: 'flower' },
            { title: 'Orchid Bouquet', price: 200, img: 'assets/flowers/orchid-bouquet.jpg', description: 'Elegant and delicate, symbolizing luxury and beauty.', category: 'flower' },
            { title: 'Lily Bouquet', price: 250, img: 'assets/flowers/lily-bouquet.jpg', description: 'Pure and elegant lilies for any occasion.', category: 'flower' },
            // Coffee
            { title: 'Americano', price: 75.00, img: 'assets/coffees/americano.jpg', description: 'Bold and refreshing espresso diluted with hot water.', category: 'coffee' },
            { title: 'Latte', price: 95.00, img: 'assets/coffees/latte.jpg', description: 'Smooth espresso with steamed milk and a thin layer of foam.', category: 'coffee' },
            { title: 'Cappuccino', price: 90.00, img: 'assets/coffees/cappuccino.jpg', description: 'Equal parts espresso, steamed milk, and milk foam.', category: 'coffee' },
            { title: 'Espresso', price: 55, img: 'assets/coffees/espresso.jpg', description: 'A rich, concentrated shot for pure coffee intensity.', category: 'coffee' },
            { title: 'Mocha', price: 110.00, img: 'assets/coffees/mocha.jpg', description: 'A sweet blend of espresso, chocolate, and steamed milk.', category: 'coffee' },
            // Desserts
            { title: 'Brownies', price: 70, img: 'assets/desserts/brownies.jpg', description: 'Fudgy and rich, perfect warmed up with coffee.', category: 'dessert' },
            { title: 'Chocolate Cake', price: 65, img: 'assets/desserts/choccake.jpg', description: 'Moist, decadent layers of pure chocolate.', category: 'dessert' },
            { title: 'Crossini', price: 55, img: 'assets/desserts/crossini.jpg', description: 'Flaky pastry, light and airy, ideal with cappuccino.', category: 'dessert' },
            { title: 'Cheesecake', price: 75, img: 'assets/desserts/cheesecake.jpg', description: 'Creamy, tangy, and served on a graham crust.', category: 'dessert' },
            { title: 'Macarons', price: 85, img: 'assets/desserts/macarons.jpg', description: 'Sweet meringue-based confection with ganache filling.', category: 'dessert' },
            // Promos
            { title: 'Latte Promo', price: 70, img: 'https://via.placeholder.com/300x200?text=Promo+Latte', description: 'Special discount on our best-selling Latte.', category: 'promo' },
            { title: 'Cappuccino Promo', price: 65, img: 'https://via.placeholder.com/300x200?text=Promo+Cappuccino', description: 'Limited time offer: enjoy a complimentary pastry.', category: 'promo' },
            { title: 'Espresso Promo', price: 55, img: 'https://via.placeholder.com/300x200?text=Promo+Espresso', description: 'Double-shot special for an extra kickstart.', category: 'promo' },
            { title: 'Mocha Promo', price: 75, img: 'https://via.placeholder.com/300x200?text=Promo+Mocha', description: 'Save big on our delicious chocolate mocha.', category: 'promo' },
            { title: 'Cake Promo', price: 50, img: 'https://via.placeholder.com/300x200?text=Promo+Cake', description: 'Discounted slices at the end of the day.', category: 'promo' }
        ];

        for (const p of sampleProducts) {
            await client.query(
                `INSERT INTO products (title, price, img, description, category)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [p.title, p.price, p.img, p.description, p.category]
            );
        }

        console.log('Cloud database initialized. ☁️');
    } finally {
        client.release();
    }
}

// 3. API Routes

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM products`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get featured products by rating and order popularity
app.get('/api/featured', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*,
                   COALESCE(r."avgRating", 0) AS "averageRating",
                   COALESCE(r."ratingCount", 0) AS "ratingCount"
            FROM products p
            LEFT JOIN (
                SELECT "productTitle",
                       AVG("ratingValue") AS "avgRating",
                       COUNT(*) AS "ratingCount"
                FROM ratings
                GROUP BY "productTitle"
            ) r ON r."productTitle" = p.title
            ORDER BY "averageRating" DESC, "ratingCount" DESC, p.title ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Signup new user
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id`,
            [username, email, password]
        );
        res.status(201).json({ message: 'User created successfully', id: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Username or email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Login existing user
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const result = await pool.query(
            `SELECT * FROM users WHERE (username = $1 OR email = $1) AND password = $2`,
            [identifier, password]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid username or password.' });
        const row = result.rows[0];
        res.json({ message: 'Login successful', user: { id: row.id, username: row.username, email: row.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get account profile data
app.get('/api/account/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.email,
                   p."fullName", p.phone, p.country, p.address1, p.address2,
                   p.city, p.province, p."postalCode", p.notes
            FROM users u
            LEFT JOIN profiles p ON u.id = p."userId"
            WHERE u.id = $1
        `, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
        res.json(result.rows[0]);
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
            `UPDATE users SET username = $1, email = $2 WHERE id = $3`,
            [username, email, id]
        );
        await pool.query(`
            INSERT INTO profiles ("userId", "fullName", phone, country, address1, address2, city, province, "postalCode", notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT ("userId") DO UPDATE SET
                "fullName"   = EXCLUDED."fullName",
                phone        = EXCLUDED.phone,
                country      = EXCLUDED.country,
                address1     = EXCLUDED.address1,
                address2     = EXCLUDED.address2,
                city         = EXCLUDED.city,
                province     = EXCLUDED.province,
                "postalCode" = EXCLUDED."postalCode",
                notes        = EXCLUDED.notes
        `, [id, fullName || '', phone || '', country || '', address1 || '', address2 || '', city || '', province || '', postalCode || '', notes || '']);
        res.json({ message: 'Profile saved.', user: { id, username, email } });
    } catch (err) {
        if (err.code === '23505') {
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
        const result = await pool.query(`
            INSERT INTO orders (
                "userId", "orderId", date, items, subtotal,
                shipping, discount, total, "paymentType",
                "voucherCode", status, estimate
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
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
        res.status(201).json({ message: 'Order saved.', orderId, id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get orders for a user
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM orders WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
            [userId]
        );
        const orders = result.rows.map(row => ({ ...row, items: JSON.parse(row.items || '[]') }));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get average rating for a product
app.get('/api/ratings/:title', async (req, res) => {
    const { title } = req.params;
    try {
        const result = await pool.query(`
            SELECT AVG("ratingValue") AS average, COUNT(*) AS count
            FROM (
                SELECT DISTINCT ON (COALESCE("userId"::text, id::text)) "ratingValue"
                FROM ratings
                WHERE "productTitle" = $1
                ORDER BY COALESCE("userId"::text, id::text), id DESC
            ) sub
        `, [title]);
        const row = result.rows[0];
        const average = row && row.average ? parseFloat(row.average).toFixed(1) : 4.5;
        const count = row ? parseInt(row.count) : 0;
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
                INSERT INTO ratings ("userId", "productTitle", "ratingValue", comment)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("userId", "productTitle") DO UPDATE SET
                    "ratingValue" = EXCLUDED."ratingValue",
                    comment       = EXCLUDED.comment,
                    "createdAt"   = CURRENT_TIMESTAMP
            `, [userId, productTitle, ratingValue, comment || '']);
            res.json({ message: 'Rating submitted successfully' });
        } else {
            const result = await pool.query(`
                INSERT INTO ratings ("userId", "productTitle", "ratingValue", comment)
                VALUES (NULL, $1, $2, $3)
                RETURNING id
            `, [productTitle, ratingValue, comment || '']);
            res.json({ message: 'Rating submitted successfully', id: result.rows[0].id });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all comments for a product
app.get('/api/comments/:productTitle', async (req, res) => {
    const { productTitle } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM comments WHERE "productTitle" = $1 ORDER BY "createdAt" ASC`,
            [decodeURIComponent(productTitle)]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Post a new comment or reply
app.post('/api/comments', async (req, res) => {
    const { productTitle, text, author, authorId, parentId, date } = req.body;
    if (!productTitle || !text) return res.status(400).json({ error: 'Missing required fields.' });
    try {
        const result = await pool.query(`
            INSERT INTO comments ("productTitle", text, author, "authorId", "parentId", date)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            productTitle,
            text,
            author || 'Guest',
            authorId ? String(authorId) : null,
            parentId || null,
            date || new Date().toLocaleDateString()
        ]);
        res.status(201).json(result.rows[0]);
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
        const result = await pool.query(
            `UPDATE comments SET text = $1 WHERE id = $2 AND "authorId" = $3 RETURNING *`,
            [text, id, String(authorId)]
        );
        if (!result.rows.length) return res.status(403).json({ error: 'Not authorized or comment not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a comment (owner only) — replies auto-deleted via ON DELETE CASCADE
app.delete('/api/comments/:id', async (req, res) => {
    const { id } = req.params;
    const { authorId } = req.body;
    try {
        const result = await pool.query(
            `DELETE FROM comments WHERE id = $1 AND "authorId" = $2 RETURNING id`,
            [id, String(authorId)]
        );
        if (!result.rows.length) return res.status(403).json({ error: 'Not authorized or comment not found.' });
        res.json({ message: 'Comment deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// Simple username-based guard: only the 'admin' account can call these.
// In production, use JWT or session middleware instead.
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_USERNAMES = new Set(['admin']);

async function requireAdmin(req, res, next) {
    // Expect header: X-Admin-Username: admin
    const username = (req.headers['x-admin-username'] || '').toLowerCase();
    if (!ADMIN_USERNAMES.has(username)) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

// Get ALL orders (admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.*, u.username FROM orders o
             LEFT JOIN users u ON o."userId" = u.id
             ORDER BY o."createdAt" DESC`
        );
        const orders = result.rows.map(row => ({ ...row, items: JSON.parse(row.items || '[]') }));
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
        const result = await pool.query(
            `UPDATE orders SET status = $1, estimate = $2 WHERE id = $3 RETURNING id`,
            [status || 'Preparing', estimate || '', id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Order not found.' });
        res.json({ message: 'Order updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ALL comments across all products (admin)
app.get('/api/admin/comments', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM comments ORDER BY "createdAt" DESC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete any comment by ID (admin, bypasses authorId check)
app.delete('/api/admin/comments/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM comments WHERE id = $1 RETURNING id`, [id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Comment not found.' });
        res.json({ message: 'Comment deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ALL users (admin) — passwords excluded
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, email FROM users ORDER BY id ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Add a new product (admin) ────────────────────────────────────────────────
// CHANGED: After a successful DB insert, the new product is also appended
// to products_tmp.json so the flat file stays in sync with the database.
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/products', requireAdmin, async (req, res) => {
    const { title, price, img, description, category } = req.body;
    if (!title || !price || !img || !description || !category) {
        return res.status(400).json({ error: 'All product fields are required.' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO products (title, price, img, description, category)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [title, price, img, description, category]
        );
        const newDbId = result.rows[0].id;

        // ── Sync to products_tmp.json ──────────────────────────────────────
        // Read the current file, calculate the next id (max existing id + 1),
        // push the new product, and write the file back.
        const products = readProductsTmp();
        const maxId = products.reduce((m, p) => Math.max(m, p.id || 0), 0);
        products.push({ id: maxId + 1, title, price, img, description, category });
        writeProductsTmp(products);
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({ message: 'Product added.', id: newDbId });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'A product with this title already exists.' });
        res.status(500).json({ error: err.message });
    }
});

// ── Update a product (admin) ─────────────────────────────────────────────────
// CHANGED: After a successful DB update, the matching entry in
// products_tmp.json is also updated in-place by matching on id.
// ────────────────────────────────────────────────────────────────────────────
app.put('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, price, img, description, category } = req.body;
    try {
        const result = await pool.query(
            `UPDATE products SET title=$1, price=$2, img=$3, description=$4, category=$5
             WHERE id=$6 RETURNING id`,
            [title, price, img, description, category, id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Product not found.' });

        // ── Sync to products_tmp.json ──────────────────────────────────────
        // Find the product by id and overwrite only its fields,
        // preserving the id and any other fields already in the file.
        const products = readProductsTmp();
        const idx = products.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) {
            products[idx] = { ...products[idx], title, price, img, description, category };
            writeProductsTmp(products);
        }
        // ──────────────────────────────────────────────────────────────────

        res.json({ message: 'Product updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Delete a product (admin) ─────────────────────────────────────────────────
// CHANGED: After a successful DB delete, the same product is removed
// from products_tmp.json by filtering out the matching id.
// ────────────────────────────────────────────────────────────────────────────
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM products WHERE id = $1 RETURNING id`, [id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Product not found.' });

        // ── Sync to products_tmp.json ──────────────────────────────────────
        // Remove the product with the matching id from the array and
        // write the trimmed array back to the file.
        const products = readProductsTmp();
        const filtered = products.filter(p => String(p.id) !== String(id));
        writeProductsTmp(filtered);
        // ──────────────────────────────────────────────────────────────────

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
        const result = await pool.query(
            `SELECT u.id, u.email, p.phone FROM users u
             LEFT JOIN profiles p ON u.id = p."userId"
             WHERE u.username = $1 OR u.email = $1`,
            [identifier]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Account not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
    const { identifier, newPassword } = req.body;
    if (!identifier || !newPassword) return res.status(400).json({ error: 'Missing fields.' });
    try {
        const result = await pool.query(
            `UPDATE users SET password = $1 WHERE username = $2 OR email = $2 RETURNING id`,
            [newPassword, identifier]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Account not found.' });
        res.json({ message: 'Password reset successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server after DB is ready
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
