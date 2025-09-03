const { pool } = require("../config/database");
const bcrypt = require("bcryptjs");

class User {
  // Create a new user
  static async create(userData) {
    const { email, password } = userData;

    try {
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const [result] = await pool.execute(
        `INSERT INTO users (email, password)
                 VALUES (?, ?)`,
        [email, hashedPassword]
      );

      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [
        email,
      ]);

      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw error;
    }
  }

  // Find user by ID
  static async findById(id) {
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM users WHERE id = ? AND is_active = TRUE",
        [id]
      );

      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw error;
    }
  }

  // Get all users with pagination
  static async findAll(page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      const [rows] = await pool.execute(
        `SELECT id, name, email, role, discord_name, discord_webhook, 
                        is_active, created_at, updated_at 
                 FROM users 
                 WHERE is_active = TRUE 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [countRows] = await pool.execute(
        "SELECT COUNT(*) as total FROM users WHERE is_active = TRUE"
      );

      return {
        users: rows,
        total: countRows[0].total,
        page,
        pages: Math.ceil(countRows[0].total / limit),
      };
    } catch (error) {
      throw error;
    }
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      throw error;
    }
  }

  // Update user
  static async update(id, userData) {
    const { name, email, role, discordName, discordWebhook } = userData;

    try {
      const [result] = await pool.execute(
        `UPDATE users 
                 SET name = ?, email = ?, role = ?, discord_name = ?, 
                     discord_webhook = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [name, email, role, discordName || null, discordWebhook || null, id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Update password
  static async updatePassword(id, newPassword) {
    try {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      const [result] = await pool.execute(
        "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [hashedPassword, id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Soft delete user
  static async delete(id) {
    try {
      const [result] = await pool.execute(
        "UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Get users for round robin selection (active agents only)
  static async findAgents() {
    try {
      const [rows] = await pool.execute(
        `SELECT id, name, email, discord_name, discord_webhook 
                 FROM users 
                 WHERE is_active = TRUE AND role IN ('agent', 'manager')
                 ORDER BY name`
      );

      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
