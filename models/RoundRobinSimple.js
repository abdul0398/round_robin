const { pool } = require('../config/database');

class RoundRobinSimple {
    // Get all round robins with basic info only
    static async findAllSimple(userId = null) {
        try {
            let query = `SELECT rr.*, u.name as created_by_name FROM round_robins rr
                         LEFT JOIN users u ON rr.created_by = u.id`;
            let params = [];
            
            if (userId) {
                query += ' WHERE rr.created_by = ?';
                params.push(parseInt(userId));
            }
            
            query += ' ORDER BY rr.created_at DESC';
            
            const [rows] = await pool.execute(query, params);
            
            // Get participant counts separately
            for (let rr of rows) {
                const [participantRows] = await pool.execute(
                    'SELECT COUNT(*) as count FROM rr_participants WHERE round_robin_id = ?',
                    [rr.id]
                );
                rr.participant_count = participantRows[0].count;
            }
            
            return {
                roundRobins: rows,
                total: rows.length,
                page: 1,
                pages: 1
            };
        } catch (error) {
            throw error;
        }
    }
    
    // Get dashboard statistics simply
    static async getDashboardStatsSimple(userId = null) {
        try {
            let query = 'SELECT COUNT(*) as total_rrs FROM round_robins';
            let params = [];
            
            if (userId) {
                query += ' WHERE created_by = ?';
                params.push(parseInt(userId));
            }
            
            const [rrRows] = await pool.execute(query, params);
            
            // Get launched RRs
            let launchedQuery = 'SELECT COUNT(*) as active_rrs FROM round_robins WHERE is_launched = TRUE';
            let launchedParams = [];
            
            if (userId) {
                launchedQuery += ' AND created_by = ?';
                launchedParams.push(parseInt(userId));
            }
            
            const [launchedRows] = await pool.execute(launchedQuery, launchedParams);
            
            // Get total participants
            const [participantRows] = await pool.execute('SELECT COUNT(*) as total_participants FROM rr_participants');
            
            // Get total leads
            const [leadRows] = await pool.execute('SELECT COUNT(*) as total_leads FROM leads');
            
            return {
                totalRRs: rrRows[0].total_rrs || 0,
                activeRRs: launchedRows[0].active_rrs || 0,
                totalLeads: leadRows[0].total_leads || 0,
                totalParticipants: participantRows[0].total_participants || 0,
                todayLeads: 0 // Skip today's calculation for now
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = RoundRobinSimple;