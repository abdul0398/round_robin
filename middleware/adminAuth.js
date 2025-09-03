// Simple admin authentication middleware for simplified system

// Check if admin is logged in
const requireAdminAuth = (req, res, next) => {
    if (req.session && req.session.isAdminAuthenticated) {
        return next();
    }
    
    // Redirect to admin login
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    
    res.redirect('/admin/login');
};

// Load admin session data
const loadAdminSession = (req, res, next) => {
    res.locals.isAdminAuthenticated = req.session && req.session.isAdminAuthenticated || false;
    next();
};

module.exports = {
    requireAdminAuth,
    loadAdminSession
};