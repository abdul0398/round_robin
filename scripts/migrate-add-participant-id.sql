-- Migration: Add participant_id column and global participants table
-- Run this to update existing database with new architecture

USE roundrobin;

-- First, create the global participants table if it doesn't exist
CREATE TABLE IF NOT EXISTS participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    discord_name VARCHAR(100) NOT NULL,
    discord_webhook TEXT NOT NULL,
    lead_limit INT DEFAULT 15,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add participant_id column to rr_participants table
ALTER TABLE rr_participants ADD COLUMN participant_id INT NULL AFTER round_robin_id;

-- Add foreign key constraint for participant_id
ALTER TABLE rr_participants ADD CONSTRAINT fk_rr_participants_participant_id 
    FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE SET NULL;

-- Optional: Populate some sample participants if the table is empty
INSERT IGNORE INTO participants (name, discord_name, discord_webhook, lead_limit) VALUES 
('Sarah Lim', 'sarah_lim#1234', 'https://discord.com/api/webhooks/123/abc', 20),
('Michael Chen', 'mike_chen#5678', 'https://discord.com/api/webhooks/456/def', 15),
('Jennifer Wong', 'jenny_w#9012', 'https://discord.com/api/webhooks/789/ghi', 25),
('David Tan', 'david_tan#3456', 'https://discord.com/api/webhooks/012/jkl', 18),
('Rachel Lee', 'rachel_lee#7890', 'https://discord.com/api/webhooks/345/mno', 22);

SELECT 'Migration completed successfully!' as status;