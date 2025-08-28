const express = require('express');
const User = require('../models/User');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Login page
router.get('/login', redirectIfAuthenticated, (req, res) => {
    res.render('pages/login', { error: null });
});

// Login POST
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Find admin user by email
        const user = await User.findByEmail(email);
        
        if (!user || user.role !== 'admin') {
            return res.render('pages/login', { 
                error: 'Access denied. Admin access only.' 
            });
        }
        
        // Verify password
        const isValidPassword = await User.verifyPassword(password, user.password);
        
        if (!isValidPassword) {
            return res.render('pages/login', { 
                error: 'Invalid email or password' 
            });
        }
        
        // Set session
        req.session.userId = user.id;
        req.session.userRole = user.role;
        
        // Redirect to intended page or dashboard
        const returnTo = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;
        res.redirect(returnTo);
        
    } catch (error) {
        console.error('Login error:', error);
        res.render('pages/login', { 
            error: 'An error occurred. Please try again.' 
        });
    }
});

// Redirect register attempts to login
router.get('/register', (req, res) => {
    res.redirect('/auth/login');
});

router.post('/register', (req, res) => {
    res.redirect('/auth/login');
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login');
    });
});

// GET logout (for convenience)
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login');
    });
});

module.exports = router;