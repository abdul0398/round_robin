const RoundRobin = require('../models/RoundRobin');
const User = require('../models/User');
require('dotenv').config();

async function testCreateRR() {
    try {
        console.log('Testing round robin creation...');
        
        // Get some test users first
        const users = await User.findAgents();
        console.log('✓ Found users:', users.map(u => u.name).join(', '));
        
        // Create a test round robin
        const roundRobinId = await RoundRobin.create({
            name: 'Test Round Robin',
            description: 'This is a test round robin',
            createdBy: 1, // Admin user
            participants: [
                {
                    userId: users[0].id,
                    name: users[0].name,
                    discordName: users[0].discord_name,
                    discordWebhook: users[0].discord_webhook,
                    leadLimit: 10,
                    isExternal: false
                },
                {
                    userId: users[1].id,
                    name: users[1].name,
                    discordName: users[1].discord_name,
                    discordWebhook: users[1].discord_webhook,
                    leadLimit: 15,
                    isExternal: false
                }
            ],
            leadSources: [
                'https://propertyguru.com.sg',
                'https://99.co'
            ]
        });
        
        console.log('✓ Round Robin created with ID:', roundRobinId);
        
        // Test finding the round robin
        const rr = await RoundRobin.findById(roundRobinId);
        console.log('✓ Round Robin found:', rr.name);
        console.log('✓ Participants:', rr.participants.length);
        console.log('✓ Lead sources:', rr.leadSources.length);
        
        // Test findAll
        const { roundRobins } = await RoundRobin.findAll(null, 1, 10);
        console.log('✓ FindAll returned:', roundRobins.length, 'round robins');
        
        // Test dashboard stats
        const stats = await RoundRobin.getDashboardStats();
        console.log('✓ Dashboard stats:', stats);
        
        console.log('✅ All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
    
    process.exit(0);
}

testCreateRR();