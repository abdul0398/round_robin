const mysql = require('mysql2/promise');
const LeadLogger = require('../utils/LeadLogger');
require('dotenv').config();

async function checkProduction() {
    console.log('🔍 Checking Production Setup...\n');
    
    let allChecks = true;
    
    try {
        // 1. Check database connection
        console.log('1. Database Connection:');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });
        console.log('   ✅ Database connection successful');
        
        // 2. Check required tables exist
        console.log('\n2. Database Tables:');
        const requiredTables = [
            'users', 'round_robins', 'rr_participants', 
            'lead_sources', 'leads', 'sessions',
            'lead_additional_data', 'lead_logs'
        ];
        
        for (const table of requiredTables) {
            try {
                const [rows] = await connection.execute(`SELECT 1 FROM \`${table}\` LIMIT 1`);
                console.log(`   ✅ Table '${table}' exists`);
            } catch (error) {
                console.log(`   ❌ Table '${table}' missing or inaccessible`);
                allChecks = false;
            }
        }
        
        // 3. Check admin user exists
        console.log('\n3. Admin User:');
        const [adminUsers] = await connection.execute(
            'SELECT id, name, email, role FROM users WHERE role = "admin"'
        );
        
        if (adminUsers.length > 0) {
            console.log(`   ✅ Admin user found: ${adminUsers[0].name} (${adminUsers[0].email})`);
        } else {
            console.log('   ❌ No admin user found');
            allChecks = false;
        }
        
        // 4. Check environment variables
        console.log('\n4. Environment Variables:');
        const requiredEnvVars = [
            'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
            'SESSION_SECRET', 'WEBHOOK_BEARER_TOKEN',
            'ADMIN_EMAIL', 'ADMIN_PASSWORD'
        ];
        
        for (const varName of requiredEnvVars) {
            if (process.env[varName]) {
                console.log(`   ✅ ${varName} is set`);
            } else {
                console.log(`   ❌ ${varName} is missing`);
                allChecks = false;
            }
        }
        
        // 5. Check logging system
        console.log('\n5. Logging System:');
        try {
            // Test logging functionality
            await LeadLogger.log({
                roundRobinId: 999999, // Fake ID for test
                eventType: 'error',
                status: 'info',
                message: 'Production setup check - test log entry',
                details: { test: true, timestamp: new Date().toISOString() }
            });
            console.log('   ✅ Logging system functional');
        } catch (error) {
            console.log('   ❌ Logging system error:', error.message);
            allChecks = false;
        }
        
        // 6. Check sample data (only in development)
        if (process.env.NODE_ENV !== 'production') {
            console.log('\n6. Sample Data (Development):');
            const [users] = await connection.execute('SELECT COUNT(*) as count FROM users');
            const [roundRobins] = await connection.execute('SELECT COUNT(*) as count FROM round_robins');
            
            console.log(`   📊 Users: ${users[0].count}`);
            console.log(`   📊 Round Robins: ${roundRobins[0].count}`);
        }
        
        await connection.end();
        
        // Final result
        console.log('\n' + '='.repeat(50));
        if (allChecks) {
            console.log('🎉 All checks passed! System is ready for production.');
            console.log('\n🚀 Start the server with: npm start');
            console.log(`🌐 Access at: http://localhost:${process.env.PORT || 3000}`);
            console.log(`👤 Login: ${process.env.ADMIN_EMAIL}`);
        } else {
            console.log('❌ Some checks failed. Please review the issues above.');
            console.log('💡 Run setup again with: npm run setup');
        }
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Production check failed:', error.message);
        process.exit(1);
    }
}

// Run check if this script is executed directly
if (require.main === module) {
    checkProduction();
}

module.exports = { checkProduction };