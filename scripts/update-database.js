#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables
require('dotenv').config();

async function executeSQLFile(connection, filePath, description) {
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Split SQL content into individual statements
    const statements = sqlContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
    
    console.log(`${description} (${statements.length} statements)...`);
    
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.toLowerCase().startsWith('select')) {
            // Skip SELECT statements (like status messages)
            continue;
        }
        
        try {
            await connection.execute(statement);
            if (statement.toLowerCase().startsWith('drop table')) {
                const tableName = statement.match(/drop table if exists (\w+)/i)?.[1];
                if (tableName) {
                    console.log(`  ✓ Dropped table: ${tableName}`);
                }
            } else if (statement.toLowerCase().startsWith('create table')) {
                const tableName = statement.match(/create table if not exists (\w+)/i)?.[1];
                if (tableName) {
                    console.log(`  ✓ Created table: ${tableName}`);
                }
            }
        } catch (error) {
            console.warn(`  ⚠ Statement failed (this may be expected): ${statement.substring(0, 50)}...`);
            console.warn(`    Error: ${error.message}`);
        }
    }
}

async function updateDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jj_leads_rr'
    });

    try {
        console.log('🗄️  Connected to database');
        console.log('⚠️  WARNING: This will drop all existing tables and data!');
        
        // Ask for confirmation in production
        if (process.env.NODE_ENV === 'production') {
            console.log('❌ Cannot run database update in production environment');
            process.exit(1);
        }

        // Execute drop tables script
        const dropTablesPath = path.join(__dirname, 'drop-all-tables.sql');
        await executeSQLFile(connection, dropTablesPath, '🗑️  Dropping all existing tables');
        console.log('✅ All tables dropped successfully');

        // Execute create tables script
        const createTablesPath = path.join(__dirname, 'database-schema-clean.sql');
        await executeSQLFile(connection, createTablesPath, '🏗️  Creating new tables with updated schema');
        console.log('✅ New tables created successfully');

        console.log('');
        console.log('🎉 Database update completed successfully!');
        console.log('📋 Summary:');
        console.log('   • All old tables dropped');
        console.log('   • New schema applied');
        console.log('   • Ready for fresh data');
        console.log('');
        console.log('⚠️  Note: All existing data has been lost. You may need to:');
        console.log('   • Recreate admin sessions');
        console.log('   • Re-add participants');
        console.log('   • Recreate round robins');

    } catch (error) {
        console.error('❌ Database update failed:', error.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log('Database Update Script');
    console.log('======================');
    console.log('');
    console.log('This script will:');
    console.log('1. Drop all existing database tables');
    console.log('2. Create new tables using database-schema-clean.sql');
    console.log('');
    console.log('Usage:');
    console.log('  npm run update-db        # Run the database update');
    console.log('  npm run update-db --help # Show this help message');
    console.log('');
    console.log('⚠️  WARNING: This will permanently delete all existing data!');
    console.log('');
    process.exit(0);
}

if (args.includes('--force')) {
    // Skip confirmation when --force flag is used
    updateDatabase();
} else {
    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('⚠️  This will DROP ALL TABLES and DATA. Are you sure? (yes/no): ', (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            updateDatabase();
        } else {
            console.log('❌ Database update cancelled');
            process.exit(0);
        }
        rl.close();
    });
}