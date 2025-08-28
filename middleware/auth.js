const { pool } = require('../config/database');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    
    // Redirect to login page with return URL
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
};

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/auth/login');
        }
        
        const [rows] = await pool.execute(
            'SELECT role FROM users WHERE id = ? AND is_active = TRUE',
            [req.session.userId]
        );
        
        if (rows.length === 0 || rows[0].role !== 'admin') {
            return res.status(403).render('pages/error', { 
                error: 'Access denied. Admin privileges required.' 
            });
        }
        
        next();
    } catch (error) {
        console.error('Error checking admin role:', error);
        return res.status(500).render('pages/error', { 
            error: 'Internal server error' 
        });
    }
};

// Middleware to check if user is admin or manager
const requireManagerOrAdmin = async (req, res, next) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/auth/login');
        }
        
        const [rows] = await pool.execute(
            'SELECT role FROM users WHERE id = ? AND is_active = TRUE',
            [req.session.userId]
        );
        
        if (rows.length === 0 || !['admin', 'manager'].includes(rows[0].role)) {
            return res.status(403).render('pages/error', { 
                error: 'Access denied. Manager or Admin privileges required.' 
            });
        }
        
        next();
    } catch (error) {
        console.error('Error checking manager/admin role:', error);
        return res.status(500).render('pages/error', { 
            error: 'Internal server error' 
        });
    }
};

// Middleware to load user data into res.locals (admin only)
const loadUser = async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            const [rows] = await pool.execute(
                'SELECT id, name, email, role, discord_name FROM users WHERE id = ? AND is_active = TRUE AND role = ?',
                [req.session.userId, 'admin']
            );
            
            if (rows.length > 0) {
                res.locals.currentUser = rows[0];
                res.locals.isAuthenticated = true;
            } else {
                // If user exists but is not admin, destroy session
                req.session.destroy();
                res.locals.currentUser = null;
                res.locals.isAuthenticated = false;
            }
        }
        
        if (!res.locals.currentUser) {
            res.locals.currentUser = null;
            res.locals.isAuthenticated = false;
        }
        
        next();
    } catch (error) {
        console.error('Error loading user:', error);
        res.locals.currentUser = null;
        res.locals.isAuthenticated = false;
        next();
    }
};

// Middleware to redirect authenticated users away from login/register pages
const redirectIfAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    next();
};

module.exports = {
    requireAuth,
    requireAdmin,
    requireManagerOrAdmin,
    loadUser,
    redirectIfAuthenticated
};