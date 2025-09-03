const { pool } = require("../config/database");

class MasterUrl {
  // Get all URLs for dropdown
  static async findAll() {
    try {
      const [rows] = await pool.execute(
        `SELECT id, url, domain, display_name, usage_count 
         FROM master_urls 
         ORDER BY usage_count DESC, display_name ASC`
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Add a new URL or increment usage count if exists
  static async addUrl(url) {
    try {
      // Extract domain from URL
      const domain = this.extractDomain(url);
      
      // Generate display name from domain
      const displayName = this.generateDisplayName(domain);

      const [result] = await pool.execute(
        `INSERT INTO master_urls (url, domain, display_name, usage_count) 
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE 
         usage_count = usage_count + 1, 
         updated_at = CURRENT_TIMESTAMP`,
        [url, domain, displayName]
      );

      // Return the URL data (either newly created or updated)
      const [urlData] = await pool.execute(
        `SELECT id, url, domain, display_name, usage_count 
         FROM master_urls WHERE url = ?`,
        [url]
      );

      return urlData[0];
    } catch (error) {
      throw error;
    }
  }

  // Get popular URLs (most used)
  static async getPopularUrls(limit = 10) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, url, domain, display_name, usage_count 
         FROM master_urls 
         ORDER BY usage_count DESC 
         LIMIT ?`,
        [limit]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Search URLs by domain or display name
  static async searchUrls(query) {
    try {
      const searchTerm = `%${query}%`;
      const [rows] = await pool.execute(
        `SELECT id, url, domain, display_name, usage_count 
         FROM master_urls 
         WHERE domain LIKE ? OR display_name LIKE ? OR url LIKE ?
         ORDER BY usage_count DESC 
         LIMIT 20`,
        [searchTerm, searchTerm, searchTerm]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Helper method to extract domain from URL
  static extractDomain(url) {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  // Helper method to generate display name from domain
  static generateDisplayName(domain) {
    if (!domain) return "Unknown Site";
    
    // Remove common prefixes and suffixes
    let displayName = domain
      .replace(/^www\./, '')
      .replace(/\.com$/, '')
      .replace(/\.sg$/, '')
      .replace(/\.co$/, '');
    
    // Capitalize first letter of each word
    displayName = displayName
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return displayName;
  }

  // Delete URL (admin only)
  static async deleteUrl(id) {
    try {
      const [result] = await pool.execute(
        "DELETE FROM master_urls WHERE id = ?",
        [id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = MasterUrl;