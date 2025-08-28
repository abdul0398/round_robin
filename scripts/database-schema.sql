-- JJ Leads Round Robin Database Schema
-- Users table for authentication and management
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'agent', 'manager') DEFAULT 'agent',
    discord_name VARCHAR(50),
    discord_webhook TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Global Participants table for lead recipients (not for authentication)
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

-- Round Robins table
CREATE TABLE IF NOT EXISTS round_robins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_launched BOOLEAN DEFAULT FALSE,
    current_position INT DEFAULT 0,
    total_leads INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- RR Participants (agents in the round robin)
CREATE TABLE IF NOT EXISTS rr_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    round_robin_id INT NOT NULL,
    participant_id INT,
    user_id INT,
    name VARCHAR(100) NOT NULL,
    discord_name VARCHAR(50),
    discord_webhook TEXT,
    lead_limit INT DEFAULT 15,
    leads_received INT DEFAULT 0,
    queue_position INT NOT NULL,
    is_external BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_robin_id) REFERENCES round_robins (id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants (id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    INDEX idx_rr_queue (
        round_robin_id,
        queue_position
    )
);

-- Lead Sources (URLs)
CREATE TABLE IF NOT EXISTS lead_sources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    round_robin_id INT NOT NULL,
    url VARCHAR(500) NOT NULL,
    domain VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_robin_id) REFERENCES round_robins (id) ON DELETE CASCADE,
    INDEX idx_rr_sources (round_robin_id)
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id INT PRIMARY KEY AUTO_INCREMENT,
    round_robin_id INT NOT NULL,
    participant_id INT NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    source_url VARCHAR(500),
    source_domain VARCHAR(100),
    status ENUM(
        'sent',
        'junk',
        'spam',
        'pending'
    ) DEFAULT 'sent',
    status_reason TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round_robin_id) REFERENCES round_robins (id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES rr_participants (id) ON DELETE CASCADE,
    INDEX idx_rr_leads (round_robin_id),
    INDEX idx_participant_leads (participant_id),
    INDEX idx_lead_status (status),
    INDEX idx_received_date (received_at)
);

-- Lead Additional Data table
CREATE TABLE IF NOT EXISTS lead_additional_data (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lead_id INT NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    INDEX idx_lead_data (lead_id),
    INDEX idx_field_key (field_key)
);

-- Lead Logs table for comprehensive logging
CREATE TABLE IF NOT EXISTS lead_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lead_id INT,
    round_robin_id INT,
    participant_id INT,
    event_type ENUM('lead_received', 'lead_assigned', 'discord_attempt', 'discord_success', 'discord_failure', 'error', 'webhook_received') NOT NULL,
    status ENUM('success', 'failure', 'warning', 'info') DEFAULT 'info',
    message TEXT,
    details JSON,
    error_details TEXT,
    source_url VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    response_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (round_robin_id) REFERENCES round_robins(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES rr_participants(id) ON DELETE SET NULL,
    INDEX idx_lead_logs_lead_id (lead_id),
    INDEX idx_lead_logs_rr_id (round_robin_id),
    INDEX idx_lead_logs_event_type (event_type),
    INDEX idx_lead_logs_status (status),
    INDEX idx_lead_logs_created_at (created_at)
);

-- Sessions table for session storage
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    expires INT(11) UNSIGNED NOT NULL,
    data MEDIUMTEXT COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
) ENGINE = InnoDB;

-- Admin user will be created by the setup script using environment variables