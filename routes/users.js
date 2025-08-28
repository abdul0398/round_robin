const express = require('express');
const Participant = require('../models/Participant');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// List all participants
router.get('/', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const { participants, total, pages } = await Participant.findAll(page, 20);
        
        res.render('pages/users/index', {
            title: 'User Management',
            activeSection: 'users',
            users: participants, // Keep the same variable name for the template
            pagination: { page, pages, total }
        });
        
    } catch (error) {
        console.error('Participants list error:', error);
        res.render('pages/error', { 
            error: 'Failed to load participants' 
        });
    }
});

// Create participant page
router.get('/create', requireAuth, (req, res) => {
    res.render('pages/users/create', {
        title: 'Add New Participant',
        activeSection: 'users',
        error: null
    });
});

// Create participant POST
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, discordName, discordWebhook } = req.body;
        
        // Validation
        if (!name || !discordName || !discordWebhook) {
            return res.render('pages/users/create', { 
                title: 'Add New Participant',
                activeSection: 'users',
                error: 'Name, Discord name, and webhook are required' 
            });
        }
        
        // Create participant
        await Participant.create({
            name,
            discordName,
            discordWebhook
        });
        
        res.redirect('/users');
        
    } catch (error) {
        console.error('Create participant error:', error);
        
        res.render('pages/users/create', { 
            title: 'Add New Participant',
            activeSection: 'users',
            error: 'An error occurred while creating the participant. Please try again.' 
        });
    }
});

// View specific participant
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const participant = await Participant.findById(req.params.id);
        
        if (!participant) {
            return res.render('pages/error', { 
                error: 'Participant not found' 
            });
        }
        
        res.render('pages/users/show', {
            title: `Participant: ${participant.name}`,
            activeSection: 'users',
            user: participant // Keep same variable name for template
        });
        
    } catch (error) {
        console.error('Show participant error:', error);
        res.render('pages/error', { 
            error: 'Failed to load participant' 
        });
    }
});

// Edit participant page
router.get('/:id/edit', requireAuth, async (req, res) => {
    try {
        const participant = await Participant.findById(req.params.id);
        
        if (!participant) {
            return res.render('pages/error', { 
                error: 'Participant not found' 
            });
        }
        
        res.render('pages/users/edit', {
            title: `Edit: ${participant.name}`,
            activeSection: 'users',
            participant,
            error: null
        });
        
    } catch (error) {
        console.error('Edit participant page error:', error);
        res.render('pages/error', { 
            error: 'Failed to load edit page' 
        });
    }
});

// Update participant POST
router.post('/:id/edit', requireAuth, async (req, res) => {
    try {
        const { name, discordName, discordWebhook } = req.body;
        
        // Validation
        if (!name || !discordName || !discordWebhook) {
            const participant = await Participant.findById(req.params.id);
            return res.render('pages/users/edit', { 
                title: `Edit: ${participant ? participant.name : 'Participant'}`,
                activeSection: 'users',
                participant: participant || { id: req.params.id, name, discordName, discordWebhook },
                error: 'Name, Discord name, and webhook are required' 
            });
        }
        
        // Update participant
        const success = await Participant.update(req.params.id, {
            name,
            discordName,
            discordWebhook
        });
        
        if (success) {
            res.redirect(`/users/${req.params.id}`);
        } else {
            const participant = await Participant.findById(req.params.id);
            res.render('pages/users/edit', { 
                title: `Edit: ${participant ? participant.name : 'Participant'}`,
                activeSection: 'users',
                participant: participant || { id: req.params.id, name, discordName, discordWebhook },
                error: 'Failed to update participant. Please try again.' 
            });
        }
        
    } catch (error) {
        console.error('Update participant error:', error);
        
        const participant = await Participant.findById(req.params.id);
        res.render('pages/users/edit', { 
            title: `Edit: ${participant ? participant.name : 'Participant'}`,
            activeSection: 'users',
            participant: participant || { id: req.params.id },
            error: 'An error occurred while updating the participant. Please try again.' 
        });
    }
});

// Delete participant DELETE
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const participant = await Participant.findById(req.params.id);
        
        if (!participant) {
            return res.status(404).json({ error: 'Participant not found' });
        }
        
        await Participant.delete(req.params.id);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete participant error:', error);
        res.status(500).json({ error: 'Failed to delete participant' });
    }
});

module.exports = router;