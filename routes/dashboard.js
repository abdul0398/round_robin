const express = require('express');
const RoundRobin = require('../models/RoundRobin');
const RoundRobinSimple = require('../models/RoundRobinSimple');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Dashboard page
router.get('/dashboard', requireAdminAuth, async (req, res) => {
    try {
        // Get dashboard statistics with fallback
        let stats = {
            totalRRs: 0,
            activeRRs: 0,
            totalLeads: 0,
            totalParticipants: 0,
            todayLeads: 0
        };
        
        try {
            stats = await RoundRobin.getDashboardStats();
        } catch (statsError) {
            console.error('Dashboard stats error:', statsError);
        }
        
        // Get recent round robins with fallback
        let roundRobins = [];
        try {
            const result = await RoundRobin.findAll(1, 6);
            roundRobins = result.roundRobins || [];
        } catch (rrError) {
            console.error('Dashboard round robins error:', rrError);
        }
        
        res.render('pages/dashboard', {
            title: 'Dashboard',
            activeSection: 'dashboard',
            stats,
            roundRobins
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('pages/dashboard', {
            title: 'Dashboard',
            activeSection: 'dashboard',
            stats: {
                totalRRs: 0,
                activeRRs: 0,
                totalLeads: 0,
                totalParticipants: 0,
                todayLeads: 0
            },
            roundRobins: []
        });
    }
});

module.exports = router;