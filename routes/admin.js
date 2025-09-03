const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Admin login page
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdminAuthenticated) {
        return res.redirect('/dashboard');
    }
    
    res.render('pages/admin/login', {
        title: 'Admin Login',
        error: null
    });
});

// Admin login POST
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Check credentials against environment variables
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    console.log('Login attempt:', { 
        provided_username: username, 
        provided_password: password?.slice(0, 3) + '***',
        expected_username: adminUsername,
        expected_password: adminPassword?.slice(0, 3) + '***'
    });
    
    if (username === adminUsername && password === adminPassword) {
        req.session.isAdminAuthenticated = true;
        console.log('Login successful for:', username);
        res.redirect('/dashboard');
    } else {
        console.log('Login failed - credentials mismatch');
        res.render('pages/admin/login', {
            title: 'Admin Login',
            error: 'Invalid username or password'
        });
    }
});

// Admin logout
router.post('/logout', requireAdminAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/admin/login');
    });
});

module.exports = router;