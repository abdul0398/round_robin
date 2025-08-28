const { pool } = require('../config/database');

class Participant {
    // Create a new participant
    static async create(participantData) {
        const { name, discordName, discordWebhook } = participantData;
        
        try {
            const [result] = await pool.execute(
                `INSERT INTO participants (name, discord_name, discord_webhook) 
                 VALUES (?, ?, ?)`,
                [name, discordName, discordWebhook]
            );
            
            return result.insertId;
        } catch (error) {
            throw error;
        }
    }
    
    // Find participant by ID
    static async findById(id) {
        try {
            const [rows] = await pool.execute(
                'SELECT * FROM participants WHERE id = ? AND is_active = TRUE',
                [parseInt(id)]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw error;
        }
    }
    
    // Get all participants with pagination
    static async findAll(page = 1, limit = 20) {
        try {
            const pageInt = parseInt(page) || 1;
            const limitInt = parseInt(limit) || 20;
            const offsetInt = (pageInt - 1) * limitInt;
            
            const [rows] = await pool.execute(
                `SELECT * FROM participants 
                 WHERE is_active = TRUE 
                 ORDER BY created_at DESC 
                 LIMIT ${limitInt} OFFSET ${offsetInt}`
            );
            
            const [countRows] = await pool.execute(
                'SELECT COUNT(*) as total FROM participants WHERE is_active = TRUE'
            );
            
            return {
                participants: rows,
                total: countRows[0].total,
                page: pageInt,
                pages: Math.ceil(countRows[0].total / limitInt)
            };
        } catch (error) {
            throw error;
        }
    }
    
    // Update participant
    static async update(id, participantData) {
        const { name, discordName, discordWebhook } = participantData;
        
        try {
            const [result] = await pool.execute(
                `UPDATE participants 
                 SET name = ?, discord_name = ?, discord_webhook = ?, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [name, discordName, discordWebhook, parseInt(id)]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }
    
    // Soft delete participant
    static async delete(id) {
        try {
            const [result] = await pool.execute(
                'UPDATE participants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [parseInt(id)]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }
    
    // Get active participants for round robin selection
    static async findActive() {
        try {
            const [rows] = await pool.execute(
                `SELECT id, name, discord_name, discord_webhook 
                 FROM participants 
                 WHERE is_active = TRUE 
                 ORDER BY name`
            );
            
            return rows;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Participant;