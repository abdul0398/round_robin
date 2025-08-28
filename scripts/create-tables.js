const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
    try {
        // Read the SQL schema file
        const schemaPath = path.join(__dirname, 'database-schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Create connection
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: process.env.DB_PORT || 3306,
            multipleStatements: true
        });
        
        console.log('Connected to MySQL server');
        
        // First, create the database
        try {
            await connection.execute('CREATE DATABASE IF NOT EXISTS roundrobin');
            console.log('✓ Database created');
        } catch (err) {
            console.error('Database creation error:', err.message);
        }
        
        // Close the connection and create a new one with the database selected
        await connection.end();
        
        const dbConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'roundrobin',
            port: process.env.DB_PORT || 3306
        });
        
        // Split schema into statements and execute them
        const statements = schema
            .replace(/^.*CREATE DATABASE.*$/gm, '') // Remove database creation lines
            .replace(/^.*USE.*$/gm, '') // Remove USE statements
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (let statement of statements) {
            try {
                await dbConnection.execute(statement);
                const shortStmt = statement.replace(/\s+/g, ' ').substring(0, 60);
                console.log('✓ Executed:', shortStmt + '...');
            } catch (err) {
                if (!err.message.includes('already exists') && !err.message.includes('Duplicate entry')) {
                    console.error('Error executing statement:', statement.substring(0, 60) + '...');
                    console.error('Error:', err.message);
                }
            }
        }
        
        await dbConnection.end();
        console.log('✓ Database schema created successfully!');
        console.log('\nDefault credentials:');
        console.log('Email: admin@jjleads.com');
        console.log('Password: admin123');
        
    } catch (error) {
        console.error('Error creating database schema:', error.message);
        process.exit(1);
    }
}

createTables();