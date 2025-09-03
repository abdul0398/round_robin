#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables
require('dotenv').config();

async function updateDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jj_leads_rr',
        multipleStatements: true
    });

    try {
        console.log('🗄️  Connected to database');
        console.log('⚠️  WARNING: This will drop all existing tables and data!');
        
        // Ask for confirmation in production
        if (process.env.NODE_ENV === 'production') {
            console.log('❌ Cannot run database update in production environment');
            process.exit(1);
        }

        // Read and execute drop tables script
        const dropTablesPath = path.join(__dirname, 'drop-all-tables.sql');
        const dropTablesSQL = fs.readFileSync(dropTablesPath, 'utf8');
        
        console.log('🗑️  Dropping all existing tables...');
        await connection.execute(dropTablesSQL);
        console.log('✅ All tables dropped successfully');

        // Read and execute create tables script
        const createTablesPath = path.join(__dirname, 'database-schema-clean.sql');
        const createTablesSQL = fs.readFileSync(createTablesPath, 'utf8');
        
        console.log('🏗️  Creating new tables with updated schema...');
        await connection.execute(createTablesSQL);
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