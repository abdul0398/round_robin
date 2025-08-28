const User = require('../models/User');
require('dotenv').config();

async function testLogin() {
    try {
        console.log('Testing login with admin@jjleads.com / admin123...');
        
        // Find user
        const user = await User.findByEmail('admin@jjleads.com');
        if (!user) {
            console.log('❌ User not found');
            return;
        }
        
        console.log('✓ User found:', user.name, user.email, user.role);
        
        // Test password
        const isValid = await User.verifyPassword('admin123', user.password);
        console.log('✓ Password valid:', isValid);
        
        if (isValid) {
            console.log('✅ Login test successful!');
        } else {
            console.log('❌ Password verification failed');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
    
    process.exit(0);
}

testLogin();