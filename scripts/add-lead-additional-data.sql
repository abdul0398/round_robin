-- Add table for storing additional lead data
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