const express = require('express');
const RoundRobin = require('../models/RoundRobin');
const Participant = require('../models/Participant');
const MasterUrl = require('../models/MasterUrl');
const { requireBearerToken } = require('../middleware/bearerAuth');
const { requireAdminAuth } = require('../middleware/adminAuth');
const LeadLogger = require('../utils/LeadLogger');

const router = express.Router();

// API to get participants for round robin creation
router.get('/participants', async (req, res) => {
    try {
        const participants = await Participant.findActive();
        res.json(participants);
        
    } catch (error) {
        console.error('API participants error:', error);
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

// API to get all participants with pagination
router.get('/participants/all', requireAdminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        const result = await Participant.findAll(page, limit);
        res.json(result);
        
    } catch (error) {
        console.error('API participants all error:', error);
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

// API to create a new participant
router.post('/participants', requireAdminAuth, async (req, res) => {
    try {
        const { name, discordName, discordWebhook } = req.body;
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Participant name is required' });
        }
        
        if (!discordName || !discordName.trim()) {
            return res.status(400).json({ error: 'Discord name is required' });
        }
        
        if (!discordWebhook || !discordWebhook.trim()) {
            return res.status(400).json({ error: 'Discord webhook is required' });
        }
        
        // Validate webhook URL format
        try {
            new URL(discordWebhook);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid Discord webhook URL format' });
        }
        
        // Check for unique name
        const existingParticipants = await Participant.findActive();
        const nameExists = existingParticipants.some(p => 
            p.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        
        if (nameExists) {
            return res.status(400).json({ error: 'A participant with this name already exists' });
        }
        
        const participantId = await Participant.create({
            name: name.trim(),
            discordName: discordName.trim(),
            discordWebhook: discordWebhook.trim()
        });
        
        res.json({ 
            success: true, 
            participantId,
            message: 'Participant created successfully' 
        });
        
    } catch (error) {
        console.error('API create participant error:', error);
        res.status(500).json({ error: 'Failed to create participant' });
    }
});

// API to update a participant
router.put('/participants/:id', requireAdminAuth, async (req, res) => {
    try {
        const { name, discordName, discordWebhook } = req.body;
        const participantId = parseInt(req.params.id);
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Participant name is required' });
        }
        
        if (!discordName || !discordName.trim()) {
            return res.status(400).json({ error: 'Discord name is required' });
        }
        
        if (!discordWebhook || !discordWebhook.trim()) {
            return res.status(400).json({ error: 'Discord webhook is required' });
        }
        
        // Validate webhook URL format
        try {
            new URL(discordWebhook);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid Discord webhook URL format' });
        }
        
        // Check if participant exists
        const existingParticipant = await Participant.findById(participantId);
        if (!existingParticipant) {
            return res.status(404).json({ error: 'Participant not found' });
        }
        
        // Check for unique name (excluding current participant)
        const allParticipants = await Participant.findActive();
        const nameExists = allParticipants.some(p => 
            p.id !== participantId && 
            p.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        
        if (nameExists) {
            return res.status(400).json({ error: 'A participant with this name already exists' });
        }
        
        const success = await Participant.update(participantId, {
            name: name.trim(),
            discordName: discordName.trim(),
            discordWebhook: discordWebhook.trim()
        });
        
        if (success) {
            res.json({ 
                success: true,
                message: 'Participant updated successfully' 
            });
        } else {
            res.status(404).json({ error: 'Participant not found' });
        }
        
    } catch (error) {
        console.error('API update participant error:', error);
        res.status(500).json({ error: 'Failed to update participant' });
    }
});

// API to delete a participant
router.delete('/participants/:id', requireAdminAuth, async (req, res) => {
    try {
        const participantId = parseInt(req.params.id);
        
        // Check if participant exists
        const existingParticipant = await Participant.findById(participantId);
        if (!existingParticipant) {
            return res.status(404).json({ error: 'Participant not found' });
        }
        
        const success = await Participant.delete(participantId);
        
        if (success) {
            res.json({ 
                success: true,
                message: 'Participant deleted successfully' 
            });
        } else {
            res.status(404).json({ error: 'Participant not found' });
        }
        
    } catch (error) {
        console.error('API delete participant error:', error);
        res.status(500).json({ error: 'Failed to delete participant' });
    }
});

// API to get all master URLs for dropdown
router.get('/master-urls', async (req, res) => {
    try {
        const urls = await MasterUrl.findAll();
        res.json(urls);
        
    } catch (error) {
        console.error('API master URLs error:', error);
        res.status(500).json({ error: 'Failed to fetch URLs' });
    }
});

// API to add a new URL to master list
router.post('/master-urls', requireAdminAuth, async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        // Validate URL format
        try {
            new URL(url);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }
        
        const urlData = await MasterUrl.addUrl(url);
        res.json({ 
            success: true, 
            url: urlData,
            message: 'URL added successfully' 
        });
        
    } catch (error) {
        console.error('API add URL error:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'URL already exists' });
        }
        
        res.status(500).json({ error: 'Failed to add URL' });
    }
});

// API to search URLs
router.get('/master-urls/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        
        const urls = await MasterUrl.searchUrls(q);
        res.json(urls);
        
    } catch (error) {
        console.error('API search URLs error:', error);
        res.status(500).json({ error: 'Failed to search URLs' });
    }
});

// API to get popular URLs
router.get('/master-urls/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const urls = await MasterUrl.getPopularUrls(limit);
        res.json(urls);
        
    } catch (error) {
        console.error('API popular URLs error:', error);
        res.status(500).json({ error: 'Failed to fetch popular URLs' });
    }
});

// API to get dashboard stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const stats = await RoundRobin.getDashboardStats();
        res.json({ stats });
        
    } catch (error) {
        console.error('API dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// API to get round robins
router.get('/round-robins', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        const result = await RoundRobin.findAll(page, limit);
        res.json(result);
        
    } catch (error) {
        console.error('API round robins error:', error);
        res.status(500).json({ error: 'Failed to fetch round robins' });
    }
});

// API to get leads for a specific round robin with pagination
router.get('/round-robins/:id/leads', requireAdminAuth, async (req, res) => {
    try {
        const roundRobinId = parseInt(req.params.id);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        // Check if round robin exists
        const roundRobin = await RoundRobin.findById(roundRobinId);
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        const result = await RoundRobin.getLeads(roundRobinId, page, limit);
        res.json(result);
        
    } catch (error) {
        console.error('API round robin leads error:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// API to pause/unpause a participant in a round robin
router.post('/round-robins/:id/participants/:participantId/toggle-pause', requireAdminAuth, async (req, res) => {
    try {
        const roundRobinId = parseInt(req.params.id);
        const participantId = parseInt(req.params.participantId);
        const { isPaused, reason } = req.body;
        
        if (typeof isPaused !== 'boolean') {
            return res.status(400).json({ error: 'isPaused must be a boolean value' });
        }
        
        const result = await RoundRobin.toggleParticipantPause(
            roundRobinId, 
            participantId, 
            isPaused, 
            reason || ''
        );
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json({ error: result.error });
        }
        
    } catch (error) {
        console.error('Toggle participant pause error:', error);
        res.status(500).json({ error: 'Failed to update participant pause status' });
    }
});

// API to mark a lead as junk
router.post('/leads/:id/mark-junk', requireAdminAuth, async (req, res) => {
    try {
        const leadId = parseInt(req.params.id);
        const { reason } = req.body;
        
        const result = await RoundRobin.markLeadAsJunk(leadId, reason || 'Marked as junk by admin');
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Lead marked as junk successfully',
                junkRulesCreated: result.junkRulesCreated
            });
        } else {
            res.status(400).json({ error: result.error });
        }
        
    } catch (error) {
        console.error('Mark lead as junk error:', error);
        res.status(500).json({ error: 'Failed to mark lead as junk' });
    }
});

// API to export leads as CSV for a specific round robin
router.get('/round-robins/:id/leads/export', requireAdminAuth, async (req, res) => {
    try {
        const roundRobinId = parseInt(req.params.id);
        
        // Check if round robin exists
        const roundRobin = await RoundRobin.findById(roundRobinId);
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
        }
        
        // Get all leads (no pagination limit for export)
        const result = await RoundRobin.getLeads(roundRobinId, 1, 999999);
        const leads = result.leads;
        
        if (leads.length === 0) {
            return res.status(400).json({ error: 'No leads to export' });
        }
        
        // Generate CSV content
        const csvHeaders = [
            'Date/Time',
            'Lead Name',
            'Phone',
            'Email', 
            'Assigned To',
            'Source URL',
            'Status',
            'Additional Data'
        ];
        
        let csvContent = csvHeaders.join(',') + '\n';
        
        leads.forEach(lead => {
            // Format additional data as JSON string or key-value pairs
            let additionalDataStr = '';
            if (lead.additional_data && lead.additional_data.length > 0) {
                additionalDataStr = lead.additional_data
                    .map(field => `${field.field_key}: ${field.field_value}`)
                    .join('; ');
            }
            
            // Format date and time in short form: "2:05pm, 12/02/2025"
            const dateObj = new Date(lead.received_at);
            const timeStr = dateObj.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            }).toLowerCase();
            const dateStr = dateObj.toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit', 
                year: 'numeric'
            });
            const shortDateTime = `${timeStr}, ${dateStr}`;
            
            const csvRow = [
                escapeCSV(shortDateTime),
                escapeCSV(lead.name || ''),
                escapeCSV(lead.phone || ''),
                escapeCSV(lead.email || ''),
                escapeCSV(lead.participant_name || ''),
                escapeCSV(lead.source_url || ''),
                escapeCSV(lead.status || ''),
                escapeCSV(additionalDataStr)
            ];
            
            csvContent += csvRow.join(',') + '\n';
        });
        
        // Helper function to escape CSV values
        function escapeCSV(value) {
            if (!value) return '""';
            const stringValue = String(value);
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return `"${stringValue}"`;
        }
        
        // Set headers for file download
        const fileName = `leads_${roundRobin.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        res.send(csvContent);
        
    } catch (error) {
        console.error('API export leads error:', error);
        res.status(500).json({ error: 'Failed to export leads' });
    }
});

// API to update participant order
router.post('/round-robins/:id/reorder-participants', async (req, res) => {
    try {
        const { participantIds } = req.body;
        
        const roundRobin = await RoundRobin.findById(req.params.id);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
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
router.get('/webhook/info/:roundRobinId', async (req, res) => {
    try {
        const { roundRobinId } = req.params;
        
        const roundRobin = await RoundRobin.findById(roundRobinId);
        
        if (!roundRobin) {
            return res.status(404).json({ error: 'Round robin not found' });
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
router.get('/logs/lead/:leadId', async (req, res) => {
    try {
        const logs = await LeadLogger.getLeadLogs(req.params.leadId);
        res.json({ logs });
    } catch (error) {
        console.error('Get lead logs error:', error);
        res.status(500).json({ error: 'Failed to get lead logs' });
    }
});

// API to get round robin logs
router.get('/logs/round-robin/:roundRobinId', async (req, res) => {
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
router.get('/logs/errors', async (req, res) => {
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
router.get('/logs/discord-stats/:roundRobinId?', async (req, res) => {
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