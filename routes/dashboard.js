const express = require('express');
const RoundRobin = require('../models/RoundRobin');
const RoundRobinSimple = require('../models/RoundRobinSimple');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Dashboard page
router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userId = null; // Single admin sees all data
        
        // Get dashboard statistics with fallback
        let stats = {
            totalRRs: 0,
            activeRRs: 0,
            totalLeads: 0,
            totalParticipants: 0,
            todayLeads: 0
        };
        
        try {
            stats = await RoundRobinSimple.getDashboardStatsSimple(userId);
        } catch (statsError) {
            console.error('Dashboard stats error:', statsError);
        }
        
        // Get recent round robins with fallback
        let roundRobins = [];
        try {
            const result = await RoundRobinSimple.findAllSimple(userId);
            roundRobins = result.roundRobins.slice(0, 6) || [];
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