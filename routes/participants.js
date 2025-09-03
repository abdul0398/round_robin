const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Participants management page
router.get('/', requireAdminAuth, async (req, res) => {
    try {
        res.render('pages/participants/index', {
            title: 'Participants',
            activeSection: 'participants'
        });
        
    } catch (error) {
        console.error('Participants page error:', error);
        res.render('pages/error', { 
            error: 'Failed to load participants page' 
        });
    }
});

module.exports = router;