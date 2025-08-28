const { pool } = require('../config/database');

class LeadLogger {
    /**
     * Log lead-related events
     * @param {Object} logData - The log data
     * @param {number} logData.leadId - Lead ID (optional)
     * @param {number} logData.roundRobinId - Round Robin ID
     * @param {number} logData.participantId - Participant ID (optional)
     * @param {string} logData.eventType - Event type (lead_received, lead_assigned, discord_attempt, etc.)
     * @param {string} logData.status - Status (success, failure, warning, info)
     * @param {string} logData.message - Log message
     * @param {Object} logData.details - Additional details as JSON
     * @param {string} logData.errorDetails - Error details (optional)
     * @param {string} logData.sourceUrl - Source URL (optional)
     * @param {string} logData.ipAddress - IP address (optional)
     * @param {string} logData.userAgent - User agent (optional)
     * @param {number} logData.responseTime - Response time in ms (optional)
     */
    static async log(logData) {
        try {
            const {
                leadId = null,
                roundRobinId,
                participantId = null,
                eventType,
                status = 'info',
                message,
                details = null,
                errorDetails = null,
                sourceUrl = null,
                ipAddress = null,
                userAgent = null,
                responseTime = null
            } = logData;

            const [result] = await pool.execute(
                `INSERT INTO lead_logs 
                 (lead_id, round_robin_id, participant_id, event_type, status, message, 
                  details, error_details, source_url, ip_address, user_agent, response_time_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    leadId,
                    roundRobinId,
                    participantId,
                    eventType,
                    status,
                    message,
                    details ? JSON.stringify(details) : null,
                    errorDetails,
                    sourceUrl,
                    ipAddress,
                    userAgent,
                    responseTime
                ]
            );

            // Also log to console for immediate visibility
            const timestamp = new Date().toISOString();
            const logLevel = status.toUpperCase();
            console.log(`[${timestamp}] [${logLevel}] [${eventType}] ${message}`);
            
            if (details) {
                console.log(`  Details:`, details);
            }
            
            if (errorDetails) {
                console.error(`  Error:`, errorDetails);
            }

            return result.insertId;
        } catch (error) {
            console.error('Failed to log lead event:', error);
            // Don't throw error to avoid breaking the main flow
            return null;
        }
    }

    // Convenience methods for specific event types
    static async logWebhookReceived(roundRobinId, leadData, req = null) {
        return await this.log({
            roundRobinId,
            eventType: 'webhook_received',
            status: 'info',
            message: `Webhook received for lead: ${leadData.name}`,
            details: {
                leadName: leadData.name,
                leadEmail: leadData.email,
                leadPhone: leadData.mobile_number || leadData.phone,
                additionalDataCount: leadData.additional_data?.length || 0
            },
            sourceUrl: leadData.source_url,
            ipAddress: req?.ip || req?.connection?.remoteAddress,
            userAgent: req?.get('User-Agent')
        });
    }

    static async logLeadAssigned(leadId, roundRobinId, participantId, participantName) {
        return await this.log({
            leadId,
            roundRobinId,
            participantId,
            eventType: 'lead_assigned',
            status: 'success',
            message: `Lead assigned to ${participantName}`,
            details: {
                participantName,
                assignedAt: new Date().toISOString()
            }
        });
    }

    static async logDiscordAttempt(leadId, roundRobinId, participantId, participantName, webhookUrl) {
        return await this.log({
            leadId,
            roundRobinId,
            participantId,
            eventType: 'discord_attempt',
            status: 'info',
            message: `Attempting to send Discord notification to ${participantName}`,
            details: {
                participantName,
                webhookUrl: webhookUrl ? 'configured' : 'not_configured',
                attemptedAt: new Date().toISOString()
            }
        });
    }

    static async logDiscordSuccess(leadId, roundRobinId, participantId, participantName, responseTime) {
        return await this.log({
            leadId,
            roundRobinId,
            participantId,
            eventType: 'discord_success',
            status: 'success',
            message: `Discord notification sent successfully to ${participantName}`,
            details: {
                participantName,
                sentAt: new Date().toISOString()
            },
            responseTime
        });
    }

    static async logDiscordFailure(leadId, roundRobinId, participantId, participantName, error, responseTime = null) {
        return await this.log({
            leadId,
            roundRobinId,
            participantId,
            eventType: 'discord_failure',
            status: 'failure',
            message: `Discord notification failed for ${participantName}`,
            details: {
                participantName,
                failedAt: new Date().toISOString(),
                errorType: error.name || 'Unknown'
            },
            errorDetails: error.message || error.toString(),
            responseTime
        });
    }

    static async logError(leadId, roundRobinId, participantId, error, context = {}) {
        return await this.log({
            leadId,
            roundRobinId,
            participantId,
            eventType: 'error',
            status: 'failure',
            message: `Error occurred: ${error.message}`,
            details: {
                errorType: error.name || 'Unknown',
                stack: error.stack,
                context
            },
            errorDetails: error.message || error.toString()
        });
    }

    // Get logs for a specific lead
    static async getLeadLogs(leadId, limit = 50) {
        try {
            const [logs] = await pool.execute(
                `SELECT ll.*, rr.name as round_robin_name, p.name as participant_name
                 FROM lead_logs ll
                 LEFT JOIN round_robins rr ON ll.round_robin_id = rr.id
                 LEFT JOIN rr_participants p ON ll.participant_id = p.id
                 WHERE ll.lead_id = ?
                 ORDER BY ll.created_at DESC
                 LIMIT ?`,
                [leadId, limit]
            );

            return logs.map(log => ({
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            }));
        } catch (error) {
            console.error('Failed to get lead logs:', error);
            return [];
        }
    }

    // Get logs for a specific round robin
    static async getRoundRobinLogs(roundRobinId, limit = 100) {
        try {
            const [logs] = await pool.execute(
                `SELECT ll.*, rr.name as round_robin_name, p.name as participant_name, l.name as lead_name
                 FROM lead_logs ll
                 LEFT JOIN round_robins rr ON ll.round_robin_id = rr.id
                 LEFT JOIN rr_participants p ON ll.participant_id = p.id
                 LEFT JOIN leads l ON ll.lead_id = l.id
                 WHERE ll.round_robin_id = ?
                 ORDER BY ll.created_at DESC
                 LIMIT ?`,
                [roundRobinId, limit]
            );

            return logs.map(log => ({
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            }));
        } catch (error) {
            console.error('Failed to get round robin logs:', error);
            return [];
        }
    }

    // Get error logs
    static async getErrorLogs(limit = 50) {
        try {
            const [logs] = await pool.execute(
                `SELECT ll.*, rr.name as round_robin_name, p.name as participant_name, l.name as lead_name
                 FROM lead_logs ll
                 LEFT JOIN round_robins rr ON ll.round_robin_id = rr.id
                 LEFT JOIN rr_participants p ON ll.participant_id = p.id
                 LEFT JOIN leads l ON ll.lead_id = l.id
                 WHERE ll.status = 'failure'
                 ORDER BY ll.created_at DESC
                 LIMIT ?`,
                [limit]
            );

            return logs.map(log => ({
                ...log,
                details: log.details ? JSON.parse(log.details) : null
            }));
        } catch (error) {
            console.error('Failed to get error logs:', error);
            return [];
        }
    }

    // Get Discord notification statistics
    static async getDiscordStats(roundRobinId = null, days = 7) {
        try {
            let whereClause = "WHERE ll.event_type IN ('discord_success', 'discord_failure')";
            let params = [];

            if (roundRobinId) {
                whereClause += " AND ll.round_robin_id = ?";
                params.push(roundRobinId);
            }

            whereClause += " AND ll.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
            params.push(days);

            const [stats] = await pool.execute(
                `SELECT 
                    COUNT(CASE WHEN ll.event_type = 'discord_success' THEN 1 END) as successful_notifications,
                    COUNT(CASE WHEN ll.event_type = 'discord_failure' THEN 1 END) as failed_notifications,
                    AVG(CASE WHEN ll.event_type = 'discord_success' THEN ll.response_time_ms END) as avg_response_time
                 FROM lead_logs ll
                 ${whereClause}`,
                params
            );

            return {
                successful: parseInt(stats[0].successful_notifications),
                failed: parseInt(stats[0].failed_notifications),
                total: parseInt(stats[0].successful_notifications) + parseInt(stats[0].failed_notifications),
                successRate: stats[0].successful_notifications ? 
                    (stats[0].successful_notifications / (stats[0].successful_notifications + stats[0].failed_notifications) * 100).toFixed(2) : 0,
                avgResponseTime: stats[0].avg_response_time ? Math.round(stats[0].avg_response_time) : null
            };
        } catch (error) {
            console.error('Failed to get Discord stats:', error);
            return { successful: 0, failed: 0, total: 0, successRate: 0, avgResponseTime: null };
        }
    }
}

module.exports = LeadLogger;