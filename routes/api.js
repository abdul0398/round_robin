const express = require('express');
const RoundRobin = require('../models/RoundRobin');
const Participant = require('../models/Participant');
const { requireAuth } = require('../middleware/auth');
const { requireBearerToken } = require('../middleware/bearerAuth');
const LeadLogger = require('../utils/LeadLogger');

const router = express.Router();

// API to get participants for round robin creation
router.get('/participants', requireAuth, async (req, res) => {
    try {
        const participants = await Participant.findActive();
        res.json(participants);
        
    } catch (error) {
        console.error('API participants error:', error);
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

// API to get dashboard stats
router.get('/dashboard/stats', requireAuth, async (req, res) => {
    try {
        const userId = res.locals.currentUser.role === 'admin' ? null : req.session.userId;
        const stats = await RoundRobin.getDashboardStats(userId);
        res.json({ stats });
        
    } catch (error) {
        console.error('API dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// API to get round robins
router.get('/round-robins', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const userId = res.locals.currentUser.role === 'admin' ? null : req.session.userId;
        
        const result = await RoundRobin.findAll(userId, page, limit);
        res.json(result);
        
    } catch (error) {
        console.error('API round robins error:', error);
        res.status(500).json({ error: 'Failed to fetch round robins' });
    }
});

// API to update participant order
router.post('/round-robins/:id/reorder-participants', requireAuth, async (req, res) => {
    try {
        const { participantIds } = req.body;
        
        const roundRobin = await RoundRobin.findById(req.params.id);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        // Check permission
        if (res.locals.currentUser.role !== 'admin' && roundRobin.created_by !== req.session.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Note: Reordering is allowed even for launched round robins
        // This will affect the lead distribution sequence
        
        await RoundRobin.updateParticipantOrder(req.params.id, participantIds);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('API reorder participants error:', error);
        res.status(500).json({ error: 'Failed to reorder participants' });
    }
});

// API to receive webhook leads (external integration) - with Bearer authentication
router.post('/webhook/lead/:roundRobinId', requireBearerToken, async (req, res) => {
    try {
        const { roundRobinId } = req.params;
        const leadData = req.body;
        
        // Enhanced validation
        if (!leadData.name || !leadData.email || !leadData.phone) {
            const missing = [];
            if (!leadData.name) missing.push('name');
            if (!leadData.email) missing.push('email');
            if (!leadData.phone) missing.push('phone');
            
            return res.status(400).json({ 
                error: 'Lead data is incomplete',
                message: `Missing required fields: ${missing.join(', ')}`,
                required_fields: ['name', 'email', 'phone'],
                received_data: Object.keys(leadData)
            });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(leadData.email)) {
            return res.status(400).json({ 
                error: 'Invalid email format',
                message: 'Please provide a valid email address'
            });
        }
        
        const roundRobin = await RoundRobin.findById(roundRobinId);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        if (!roundRobin.is_launched) {
            return res.status(400).json({ error: 'Round robin is not active' });
        }
        
        const result = await RoundRobin.distributeLead(roundRobinId, {
            name: leadData.name,
            phone: leadData.phone,
            email: leadData.email,
            sourceUrl: leadData.source_url || req.headers.referer,
            status: 'sent'
        });
        
        console.log(`Lead distributed to ${result.assignedTo.name}:`, leadData);
        
        res.json({ 
            success: true, 
            assignedTo: result.assignedTo.name,
            discordNotified: result.discordNotification?.success || false,
            message: 'Lead distributed successfully'
        });
        
    } catch (error) {
        console.error('Webhook lead error:', error);
        res.status(500).json({ error: 'Failed to process lead' });
    }
});

// API to get webhook information and authentication details
router.get('/webhook/info/:roundRobinId', requireAuth, async (req, res) => {
    try {
        const { roundRobinId } = req.params;
        
        const roundRobin = await RoundRobin.findById(roundRobinId);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        // Check permission
        if (res.locals.currentUser.role !== 'admin' && roundRobin.created_by !== req.session.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const webhookInfo = {
            roundRobin: {
                id: roundRobin.id,
                name: roundRobin.name,
                isLaunched: roundRobin.is_launched,
                participantCount: roundRobin.participants.length
            },
            webhooks: {
                byRoundRobinId: {
                    url: `${req.protocol}://${req.get('host')}/api/webhook/lead/${roundRobinId}`,
                    method: 'POST',
                    description: 'Send leads to specific round robin by ID',
                    authentication: {
                        type: 'Bearer Token',
                        header: 'Authorization',
                        format: 'Bearer <token>',
                        token: process.env.WEBHOOK_BEARER_TOKEN
                    },
                    payload: {
                        required_fields: ['name', 'email', 'phone'],
                        optional_fields: ['source_url', 'message', 'additional_info'],
                        example: {
                            name: 'John Doe',
                            email: 'john.doe@example.com',
                            phone: '+65 9123 4567',
                            source_url: 'https://propertyguru.com.sg',
                            message: 'Interested in 3-bedroom condo',
                            additional_info: 'Budget: $800K - $1.2M'
                        }
                    }
                },
                bySourceUrl: {
                    url: `${req.protocol}://${req.get('host')}/api/webhook/lead-by-source`,
                    method: 'POST',
                    description: 'Send leads and auto-find round robin by source URL (for PHP forms)',
                    authentication: {
                        type: 'Bearer Token',
                        header: 'Authorization',
                        format: 'Bearer <token>',
                        token: process.env.WEBHOOK_BEARER_TOKEN
                    },
                    payload: {
                        required_fields: ['name', 'email', 'mobile_number', 'source_url'],
                        optional_fields: ['additional_data'],
                        example: {
                            name: 'John Doe',
                            email: 'john.doe@example.com',
                            mobile_number: '91234567',
                            source_url: 'https://findmypropertyvalaution.homes/',
                            additional_data: [
                                { key: 'Project', value: 'Condo Marina Bay' },
                                { key: 'Floor - Unit number', value: '15 - 08' },
                                { key: 'Looking to sell your property', value: 'Yes' }
                            ]
                        }
                    }
                }
            },
            responses: {
                success: {
                    status: 200,
                    body: {
                        success: true,
                        assignedTo: 'Participant Name',
                        roundRobin: 'Round Robin Name',
                        message: 'Lead distributed successfully'
                    }
                },
                errors: {
                    '401': 'Missing or invalid Bearer token',
                    '400': 'Invalid lead data or inactive round robin',
                    '404': 'Round robin not found / No RR found for source URL',
                    '500': 'Server error'
                }
            }
        };
        
        res.json(webhookInfo);
        
    } catch (error) {
        console.error('Webhook info error:', error);
        res.status(500).json({ error: 'Failed to get webhook information' });
    }
});

// API to receive leads from PHP forms - finds RR by source_url
router.post('/webhook/lead-by-source', requireBearerToken, async (req, res) => {
    try {
        const leadData = req.body;
        
        // Log webhook received
        const roundRobin = await RoundRobin.findBySourceUrl(leadData.source_url);
        if (roundRobin) {
            await LeadLogger.logWebhookReceived(roundRobin.id, leadData, req);
        }
        
        // Enhanced validation for PHP form structure
        if (!leadData.name || !leadData.email || !leadData.mobile_number || !leadData.source_url) {
            const missing = [];
            if (!leadData.name) missing.push('name');
            if (!leadData.email) missing.push('email');
            if (!leadData.mobile_number) missing.push('mobile_number');
            if (!leadData.source_url) missing.push('source_url');
            
            if (roundRobin) {
                await LeadLogger.log({
                    roundRobinId: roundRobin.id,
                    eventType: 'error',
                    status: 'failure',
                    message: `Incomplete lead data received: missing ${missing.join(', ')}`,
                    details: { missingFields: missing, receivedFields: Object.keys(leadData) },
                    sourceUrl: leadData.source_url,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                });
            }
            
            return res.status(400).json({ 
                error: 'Lead data is incomplete',
                message: `Missing required fields: ${missing.join(', ')}`,
                required_fields: ['name', 'email', 'mobile_number', 'source_url'],
                received_data: Object.keys(leadData)
            });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(leadData.email)) {
            if (roundRobin) {
                await LeadLogger.log({
                    roundRobinId: roundRobin.id,
                    eventType: 'error',
                    status: 'failure',
                    message: `Invalid email format: ${leadData.email}`,
                    details: { email: leadData.email, leadName: leadData.name },
                    sourceUrl: leadData.source_url,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent')
                });
            }
            
            return res.status(400).json({ 
                error: 'Invalid email format',
                message: 'Please provide a valid email address'
            });
        }
        
        const result = await RoundRobin.distributeLeadWithAdditionalData(leadData.source_url, leadData);
        
        console.log(`Lead distributed to ${result.assignedTo.name}:`, {
            name: leadData.name,
            email: leadData.email,
            phone: leadData.mobile_number,
            source: leadData.source_url,
            additionalFields: leadData.additional_data?.length || 0
        });
        
        res.json({ 
            success: true, 
            leadId: result.leadId,
            assignedTo: result.assignedTo.name,
            roundRobin: result.roundRobin.name,
            discordNotified: result.discordNotification?.success || false,
            message: 'Lead distributed successfully'
        });
        
    } catch (error) {
        console.error('Webhook lead-by-source error:', error);
        
        // Log the error
        try {
            const roundRobin = await RoundRobin.findBySourceUrl(req.body.source_url);
            if (roundRobin) {
                await LeadLogger.logError(null, roundRobin.id, null, error, {
                    context: 'webhook_lead_by_source',
                    leadData: req.body,
                    sourceUrl: req.body.source_url
                });
            }
        } catch (logError) {
            console.error('Failed to log webhook error:', logError);
        }
        
        if (error.message.includes('No active round robin found')) {
            return res.status(404).json({ 
                error: 'No active round robin found for this source URL',
                source_url: req.body.source_url 
            });
        }
        res.status(500).json({ error: 'Failed to process lead' });
    }
});

// API to test webhook functionality
router.get('/webhook/test/:roundRobinId', async (req, res) => {
    try {
        const { roundRobinId } = req.params;
        
        const roundRobin = await RoundRobin.findById(roundRobinId);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        res.json({
            success: true,
            roundRobin: {
                id: roundRobin.id,
                name: roundRobin.name,
                isLaunched: roundRobin.is_launched,
                participantCount: roundRobin.participants.length
            },
            webhookUrl: `${req.protocol}://${req.get('host')}/api/webhook/lead/${roundRobinId}`,
            message: 'Webhook endpoint is ready to receive leads'
        });
        
    } catch (error) {
        console.error('Webhook test error:', error);
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});

// API to get lead logs
router.get('/logs/lead/:leadId', requireAuth, async (req, res) => {
    try {
        const logs = await LeadLogger.getLeadLogs(req.params.leadId);
        res.json({ logs });
    } catch (error) {
        console.error('Get lead logs error:', error);
        res.status(500).json({ error: 'Failed to get lead logs' });
    }
});

// API to get round robin logs
router.get('/logs/round-robin/:roundRobinId', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await LeadLogger.getRoundRobinLogs(req.params.roundRobinId, limit);
        res.json({ logs });
    } catch (error) {
        console.error('Get round robin logs error:', error);
        res.status(500).json({ error: 'Failed to get round robin logs' });
    }
});

// API to get error logs
router.get('/logs/errors', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await LeadLogger.getErrorLogs(limit);
        res.json({ logs });
    } catch (error) {
        console.error('Get error logs error:', error);
        res.status(500).json({ error: 'Failed to get error logs' });
    }
});

// API to get Discord statistics
router.get('/logs/discord-stats/:roundRobinId?', requireAuth, async (req, res) => {
    try {
        const roundRobinId = req.params.roundRobinId || null;
        const days = parseInt(req.query.days) || 7;
        const stats = await LeadLogger.getDiscordStats(roundRobinId, days);
        res.json({ stats });
    } catch (error) {
        console.error('Get Discord stats error:', error);
        res.status(500).json({ error: 'Failed to get Discord stats' });
    }
});

module.exports = router;