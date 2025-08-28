const { pool } = require('../config/database');
require('dotenv').config();

async function testSimple() {
    try {
        // Test simple queries first
        console.log('Testing simple query...');
        
        const [rows] = await pool.execute('SELECT COUNT(*) as count FROM round_robins');
        console.log('✓ Round robins count:', rows[0].count);
        
        // Test query with parameters
        console.log('Testing query with parameters...');
        const [users] = await pool.execute('SELECT * FROM users LIMIT ?', [2]);
        console.log('✓ Users found:', users.length);
        
        // Test the problematic query step by step
        console.log('Testing problematic query...');
        const limit = 10;
        const offset = 0;
        
        const [rrRows] = await pool.execute(
            `SELECT rr.*, 
                    u.name as created_by_name,
                    COUNT(DISTINCT p.id) as participant_count,
                    COUNT(DISTINCT s.id) as source_count,
                    COALESCE(rr.current_position, 0) as current_position
             FROM round_robins rr
             LEFT JOIN users u ON rr.created_by = u.id
             LEFT JOIN rr_participants p ON rr.id = p.round_robin_id
             LEFT JOIN lead_sources s ON rr.id = s.round_robin_id
             GROUP BY rr.id
             ORDER BY rr.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        
        console.log('✓ Complex query worked, found:', rrRows.length, 'round robins');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('SQL State:', error.sqlState);
        console.error('Error code:', error.code);
    }
    
    process.exit(0);
}

testSimple();