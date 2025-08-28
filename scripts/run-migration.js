const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    let connection;
    
    try {
        // Connect to database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'roundrobin',
            multipleStatements: true
        });

        console.log('✓ Connected to database');

        // Execute migration statements one by one
        console.log('🔄 Running migration...');
        
        // Create global participants table
        console.log('  Creating participants table...');
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS participants (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                discord_name VARCHAR(100) NOT NULL,
                discord_webhook TEXT NOT NULL,
                lead_limit INT DEFAULT 15,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        // Add participant_id column
        console.log('  Adding participant_id column...');
        try {
            await connection.execute(`
                ALTER TABLE rr_participants ADD COLUMN participant_id INT NULL AFTER round_robin_id
            `);
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('  participant_id column already exists, skipping...');
            } else {
                throw error;
            }
        }
        
        // Add foreign key constraint
        console.log('  Adding foreign key constraint...');
        try {
            await connection.execute(`
                ALTER TABLE rr_participants ADD CONSTRAINT fk_rr_participants_participant_id 
                FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE SET NULL
            `);
        } catch (error) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log('  Foreign key constraint already exists, skipping...');
            } else {
                throw error;
            }
        }
        
        // Add sample participants
        console.log('  Adding sample participants...');
        await connection.execute(`
            INSERT IGNORE INTO participants (name, discord_name, discord_webhook, lead_limit) VALUES 
            ('Sarah Lim', 'sarah_lim#1234', 'https://discord.com/api/webhooks/123/abc', 20),
            ('Michael Chen', 'mike_chen#5678', 'https://discord.com/api/webhooks/456/def', 15),
            ('Jennifer Wong', 'jenny_w#9012', 'https://discord.com/api/webhooks/789/ghi', 25),
            ('David Tan', 'david_tan#3456', 'https://discord.com/api/webhooks/012/jkl', 18),
            ('Rachel Lee', 'rachel_lee#7890', 'https://discord.com/api/webhooks/345/mno', 22)
        `);
        
        console.log('✓ Migration completed successfully!');
        
        // Check if participant_id column was added
        const [columns] = await connection.execute(`
            SHOW COLUMNS FROM rr_participants WHERE Field = 'participant_id'
        `);
        
        if (columns.length > 0) {
            console.log('✓ participant_id column added to rr_participants table');
        }
        
        // Check participants table
        const [participantCount] = await connection.execute(`
            SELECT COUNT(*) as count FROM participants
        `);
        
        console.log(`✓ Global participants table has ${participantCount[0].count} records`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();