const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
require('dotenv').config();

const { pool, testConnection } = require('./config/database');
const { loadUser } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const roundRobinRoutes = require('./routes/roundRobins');
const userRoutes = require('./routes/users');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Session store configuration
const sessionStore = new MySQLStore({}, pool);

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Session configuration
app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        secure: false, // Set to true in production with HTTPS
        httpOnly: true
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Load user middleware (makes user available in all views)
app.use(loadUser);

// Routes
app.use('/auth', authRoutes);
app.use('/', dashboardRoutes);
app.use('/round-robins', roundRobinRoutes);
app.use('/users', userRoutes);
app.use('/api', apiRoutes);

// Root redirect
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).render('pages/error', { 
        error: 'Something went wrong. Please try again.',
        currentUser: res.locals.currentUser 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('pages/error', { 
        error: 'Page not found',
        currentUser: res.locals.currentUser 
    });
});

// Start server
async function startServer() {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('Failed to connect to database. Please check your configuration.');
            process.exit(1);
        }
        
        app.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
            console.log('✓ Database connected successfully');
            console.log('\n📝 To set up the database, run: npm run create-tables');
            console.log('🔐 Default login: admin@jjleads.com / admin123');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();