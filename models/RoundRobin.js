const { pool } = require("../config/database");
const LeadLogger = require("../utils/LeadLogger");

class RoundRobin {
  // Create a new round robin
  static async create(rrData) {
    const {
      name,
      description,
      createdBy,
      participants = [],
      leadSources = [],
    } = rrData;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Insert round robin
      const [rrResult] = await connection.execute(
        `INSERT INTO round_robins (name, description, created_by) 
                 VALUES (?, ?, ?)`,
        [name, description || null, createdBy]
      );

      const roundRobinId = rrResult.insertId;

      // Insert participants
      if (participants.length > 0) {
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          await connection.execute(
            `INSERT INTO rr_participants 
                         (round_robin_id, user_id, name, discord_name, discord_webhook, 
                          lead_limit, queue_position, is_external) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              roundRobinId,
              participant.userId || null,
              participant.name,
              participant.discordName || null,
              participant.discordWebhook || null,
              participant.leadLimit || 15,
              i,
              participant.isExternal || false,
            ]
          );
        }
      }

      // Insert lead sources
      if (leadSources.length > 0) {
        for (const source of leadSources) {
          const domain = this.extractDomain(source);
          await connection.execute(
            `INSERT INTO lead_sources (round_robin_id, url, domain) 
                         VALUES (?, ?, ?)`,
            [roundRobinId, source, domain]
          );
        }
      }

      await connection.commit();
      return roundRobinId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get all round robins with stats
  static async findAll(userId = null, page = 1, limit = 10) {
    try {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit) || 10;
      const offsetInt = (pageInt - 1) * limitInt;

      let whereClause = "";
      let params = [];

      if (userId) {
        whereClause = "WHERE rr.created_by = ?";
        params.push(parseInt(userId));
      }

      const [rows] = await pool.execute(
        `SELECT rr.*, 
                        u.name as created_by_name,
                        COUNT(DISTINCT p.id) as participant_count,
                        COUNT(DISTINCT s.id) as source_count,
                        COALESCE(rr.current_position, 0) as current_position
                 FROM round_robins rr
                 LEFT JOIN users u ON rr.created_by = u.id
                 LEFT JOIN rr_participants p ON rr.id = p.round_robin_id
                 LEFT JOIN lead_sources s ON rr.id = s.round_robin_id
                 ${whereClause}
                 GROUP BY rr.id
                 ORDER BY rr.created_at DESC
                 LIMIT ${limitInt} OFFSET ${offsetInt}`,
        params
      );

      const [countRows] = await pool.execute(
        `SELECT COUNT(DISTINCT rr.id) as total FROM round_robins rr ${whereClause}`,
        userId ? [parseInt(userId)] : []
      );

      return {
        roundRobins: rows,
        total: countRows[0].total,
        page: pageInt,
        pages: Math.ceil(countRows[0].total / limitInt),
      };
    } catch (error) {
      throw error;
    }
  }

  // Find round robin by ID with full details
  static async findById(id) {
    try {
      // Get round robin basic info
      const [rrRows] = await pool.execute(
        `SELECT rr.*, u.name as created_by_name 
                 FROM round_robins rr
                 LEFT JOIN users u ON rr.created_by = u.id
                 WHERE rr.id = ?`,
        [id]
      );

      if (rrRows.length === 0) return null;

      const roundRobin = rrRows[0];

      // Get participants
      const [participants] = await pool.execute(
        `SELECT * FROM rr_participants 
                 WHERE round_robin_id = ? 
                 ORDER BY queue_position`,
        [id]
      );

      // Get lead sources
      const [sources] = await pool.execute(
        `SELECT * FROM lead_sources 
                 WHERE round_robin_id = ? AND is_active = TRUE`,
        [id]
      );

      // Get recent leads
      const [leads] = await pool.execute(
        `SELECT l.*, p.name as participant_name 
                 FROM leads l
                 JOIN rr_participants p ON l.participant_id = p.id
                 WHERE l.round_robin_id = ?
                 ORDER BY l.received_at DESC
                 LIMIT 50`,
        [id]
      );

      roundRobin.participants = participants;
      roundRobin.leadSources = sources;
      roundRobin.leads = leads;

      return roundRobin;
    } catch (error) {
      throw error;
    }
  }

  // Launch round robin
  static async launch(id) {
    try {
      const [result] = await pool.execute(
        `UPDATE round_robins 
                 SET is_launched = TRUE, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Distribute a lead to the next participant
  static async distributeLead(roundRobinId, leadData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get current round robin state
      const [rrRows] = await connection.execute(
        "SELECT * FROM round_robins WHERE id = ? AND is_launched = TRUE",
        [roundRobinId]
      );

      if (rrRows.length === 0) {
        throw new Error("Round robin not found or not launched");
      }

      const rr = rrRows[0];

      // Get participants in order
      const [participants] = await connection.execute(
        "SELECT * FROM rr_participants WHERE round_robin_id = ? ORDER BY queue_position",
        [roundRobinId]
      );

      if (participants.length === 0) {
        throw new Error("No participants found in round robin");
      }

      // Get current participant
      const currentParticipant = participants[rr.current_position];

      // Insert the lead
      const [leadResult] = await connection.execute(
        `INSERT INTO leads 
                 (round_robin_id, participant_id, name, phone, email, source_url, source_domain, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roundRobinId,
          currentParticipant.id,
          leadData.name || null,
          leadData.phone || null,
          leadData.email || null,
          leadData.sourceUrl || null,
          this.extractDomain(leadData.sourceUrl || ""),
          leadData.status || "sent",
        ]
      );

      // Update participant lead count
      await connection.execute(
        "UPDATE rr_participants SET leads_received = leads_received + 1 WHERE id = ?",
        [currentParticipant.id]
      );

      // Update round robin position and total leads
      const nextPosition = (rr.current_position + 1) % participants.length;
      await connection.execute(
        `UPDATE round_robins 
                 SET current_position = ?, total_leads = total_leads + 1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [nextPosition, roundRobinId]
      );

      await connection.commit();

      const leadId = leadResult.insertId;
      
      // Log lead assignment
      await LeadLogger.logLeadAssigned(leadId, roundRobinId, currentParticipant.id, currentParticipant.name);

      // Send to Discord webhook (don't fail the lead distribution if Discord fails)
      let discordResult = null;
      try {
        discordResult = await this.sendToDiscord(
          currentParticipant,
          leadData,
          [],
          leadId,
          roundRobinId
        );
      } catch (discordError) {
        await LeadLogger.logError(leadId, roundRobinId, currentParticipant.id, discordError, {
          context: 'discord_notification',
          leadData: { name: leadData.name, email: leadData.email }
        });
        discordResult = { success: false, reason: discordError.message };
      }

      return {
        leadId: leadId,
        assignedTo: currentParticipant,
        nextPosition,
        discordNotification: discordResult,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Update round robin
  static async update(id, updateData) {
    const { name, description } = updateData;

    try {
      const [result] = await pool.execute(
        `UPDATE round_robins 
                 SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [name, description || null, id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Update round robin with participants and lead sources
  static async updateFull(id, updateData) {
    const {
      name,
      description,
      participants = [],
      leadSources = [],
    } = updateData;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Update round robin basic info
      await connection.execute(
        `UPDATE round_robins 
                 SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [name, description || null, id]
      );

      // Delete existing participants and lead sources
      await connection.execute(
        "DELETE FROM rr_participants WHERE round_robin_id = ?",
        [id]
      );
      await connection.execute(
        "DELETE FROM lead_sources WHERE round_robin_id = ?",
        [id]
      );

      // Insert updated participants
      if (participants.length > 0) {
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          await connection.execute(
            `INSERT INTO rr_participants 
                         (round_robin_id, user_id, name, discord_name, discord_webhook, 
                          lead_limit, queue_position, is_external) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              participant.userId || null,
              participant.name,
              participant.discordName || null,
              participant.discordWebhook || null,
              participant.leadLimit || 15,
              i,
              participant.isExternal || false,
            ]
          );
        }
      }

      // Insert updated lead sources
      if (leadSources.length > 0) {
        for (const source of leadSources) {
          const domain = this.extractDomain(source);
          await connection.execute(
            `INSERT INTO lead_sources (round_robin_id, url, domain) 
                         VALUES (?, ?, ?)`,
            [id, source, domain]
          );
        }
      }

      await connection.commit();

      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Delete round robin (cascade will handle related records)
  static async delete(id) {
    try {
      const [result] = await pool.execute(
        "DELETE FROM round_robins WHERE id = ?",
        [id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }

  // Update participant queue positions
  static async updateParticipantOrder(roundRobinId, participantIds) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      for (let i = 0; i < participantIds.length; i++) {
        await connection.execute(
          "UPDATE rr_participants SET queue_position = ? WHERE id = ? AND round_robin_id = ?",
          [i, participantIds[i], roundRobinId]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(userId = null) {
    try {
      let whereClause = "";
      let params = [];

      if (userId) {
        whereClause = "WHERE rr.created_by = ?";
        params.push(parseInt(userId));
      }

      // Get basic stats
      const [statsRows] = await pool.execute(
        `SELECT 
                    COUNT(DISTINCT rr.id) as total_rrs,
                    COUNT(DISTINCT CASE WHEN rr.is_launched = TRUE THEN rr.id END) as active_rrs,
                    COALESCE(SUM(rr.total_leads), 0) as total_leads,
                    COUNT(DISTINCT p.id) as total_participants
                 FROM round_robins rr
                 LEFT JOIN rr_participants p ON rr.id = p.round_robin_id
                 ${whereClause}`,
        params
      );

      // Get today's leads
      const [todayRows] = await pool.execute(
        `SELECT COUNT(*) as today_leads
                 FROM leads l
                 JOIN round_robins rr ON l.round_robin_id = rr.id
                 WHERE DATE(l.received_at) = CURDATE()
                 ${whereClause ? "AND rr.created_by = ?" : ""}`,
        userId ? [parseInt(userId)] : []
      );

      return {
        totalRRs: statsRows[0].total_rrs,
        activeRRs: statsRows[0].active_rrs,
        totalLeads: statsRows[0].total_leads,
        totalParticipants: statsRows[0].total_participants,
        todayLeads: todayRows[0].today_leads,
      };
    } catch (error) {
      throw error;
    }
  }

  // Send lead to Discord webhook
  static async sendToDiscord(participantData, leadData, additionalData = [], leadId = null, roundRobinId = null) {
    const startTime = Date.now();
    
    // Log Discord attempt
    if (leadId && roundRobinId) {
      await LeadLogger.logDiscordAttempt(
        leadId, 
        roundRobinId, 
        participantData.id, 
        participantData.name, 
        participantData.discord_webhook
      );
    }

    if (!participantData.discord_webhook) {
      const error = new Error("No Discord webhook configured");
      if (leadId && roundRobinId) {
        await LeadLogger.logDiscordFailure(
          leadId, 
          roundRobinId, 
          participantData.id, 
          participantData.name, 
          error
        );
      }
      return { success: false, reason: "No webhook configured" };
    }

    try {
      // Create formatted message following the specified pattern
      let message = `New Lead Please take note!\n`;
      message += `===========================\n`;
      message += `Hello ${participantData.name}, you have a new lead:\n`;
      message += `- Name: ${leadData.name}\n`;
      message += `- Email: ${leadData.email}\n`;
      message += `- Mobile Number: https://wa.me/+65${
        leadData.mobile_number || leadData.phone
      }`;

      if (additionalData && additionalData.length > 0) {
        additionalData.forEach((item) => {
          if (
            (Array.isArray(item) || typeof item === "object") &&
            item.key &&
            item.value
          ) {
            message += `\n- ${item.key}: ${item.value}`;
          }
        });
      }

      const discordPayload = {
        content: message,
        username: participantData.discord_name || participantData.name,
      };

      const response = await fetch(participantData.discord_webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(discordPayload),
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        // Log success
        if (leadId && roundRobinId) {
          await LeadLogger.logDiscordSuccess(
            leadId, 
            roundRobinId, 
            participantData.id, 
            participantData.name, 
            responseTime
          );
        }
        return { success: true };
      } else {
        const errorText = await response.text();
        const error = new Error(`HTTP ${response.status}: ${errorText}`);
        
        // Log failure
        if (leadId && roundRobinId) {
          await LeadLogger.logDiscordFailure(
            leadId, 
            roundRobinId, 
            participantData.id, 
            participantData.name, 
            error, 
            responseTime
          );
        }
        
        return {
          success: false,
          reason: `HTTP ${response.status}: ${errorText}`,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Log error
      if (leadId && roundRobinId) {
        await LeadLogger.logDiscordFailure(
          leadId, 
          roundRobinId, 
          participantData.id, 
          participantData.name, 
          error, 
          responseTime
        );
      }
      
      return { success: false, reason: error.message };
    }
  }

  // Distribute lead with additional data from PHP forms
  static async distributeLeadWithAdditionalData(sourceUrl, leadData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Find round robin by source URL
      const roundRobin = await this.findBySourceUrl(sourceUrl);

      if (!roundRobin) {
        throw new Error("No active round robin found for this source URL");
      }

      if (roundRobin.participants.length === 0) {
        throw new Error("No participants found in round robin");
      }

      // Get current participant
      const currentParticipant =
        roundRobin.participants[roundRobin.current_position];

      // Insert the lead
      const [leadResult] = await connection.execute(
        `INSERT INTO leads 
                 (round_robin_id, participant_id, name, phone, email, source_url, source_domain, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roundRobin.id,
          currentParticipant.id,
          leadData.name || null,
          leadData.mobile_number || leadData.phone || null,
          leadData.email || null,
          leadData.source_url || sourceUrl,
          this.extractDomain(leadData.source_url || sourceUrl),
          "sent",
        ]
      );

      const leadId = leadResult.insertId;

      // Insert additional data if provided
      if (leadData.additional_data && Array.isArray(leadData.additional_data)) {
        for (const item of leadData.additional_data) {
          if (item.key && item.value) {
            await connection.execute(
              `INSERT INTO lead_additional_data (lead_id, field_key, field_value) 
                             VALUES (?, ?, ?)`,
              [leadId, item.key, item.value]
            );
          }
        }
      }

      // Update participant lead count
      await connection.execute(
        "UPDATE rr_participants SET leads_received = leads_received + 1 WHERE id = ?",
        [currentParticipant.id]
      );

      // Update round robin position and total leads
      const nextPosition =
        (roundRobin.current_position + 1) % roundRobin.participants.length;
      await connection.execute(
        `UPDATE round_robins 
                 SET current_position = ?, total_leads = total_leads + 1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [nextPosition, roundRobin.id]
      );

      await connection.commit();
      
      // Log lead assignment
      await LeadLogger.logLeadAssigned(leadId, roundRobin.id, currentParticipant.id, currentParticipant.name);

      // Send to Discord webhook (don't fail the lead distribution if Discord fails)
      let discordResult = null;
      try {
        discordResult = await this.sendToDiscord(
          currentParticipant,
          leadData,
          leadData.additional_data,
          leadId,
          roundRobin.id
        );
      } catch (discordError) {
        await LeadLogger.logError(leadId, roundRobin.id, currentParticipant.id, discordError, {
          context: 'discord_notification_with_additional_data',
          leadData: { 
            name: leadData.name, 
            email: leadData.email,
            additionalDataCount: leadData.additional_data?.length || 0
          }
        });
        discordResult = { success: false, reason: discordError.message };
      }

      return {
        success: true,
        leadId: leadId,
        assignedTo: {
          id: currentParticipant.id,
          name: currentParticipant.name,
          discordName: currentParticipant.discord_name,
          discordWebhook: currentParticipant.discord_webhook,
        },
        roundRobin: {
          id: roundRobin.id,
          name: roundRobin.name,
          newPosition: nextPosition,
        },
        discordNotification: discordResult,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Find round robin by source URL
  static async findBySourceUrl(sourceUrl) {
    try {
      const domain = this.extractDomain(sourceUrl);

      const [rows] = await pool.execute(
        `SELECT DISTINCT rr.*, u.name as created_by_name 
                 FROM round_robins rr
                 LEFT JOIN users u ON rr.created_by = u.id
                 LEFT JOIN lead_sources ls ON rr.id = ls.round_robin_id
                 WHERE (ls.url = ? OR ls.domain = ?) 
                   AND rr.is_launched = TRUE 
                   AND ls.is_active = TRUE`,
        [sourceUrl, domain]
      );

      if (rows.length === 0) return null;

      const roundRobin = rows[0];

      // Get participants
      const [participants] = await pool.execute(
        `SELECT * FROM rr_participants 
                 WHERE round_robin_id = ? 
                 ORDER BY queue_position`,
        [roundRobin.id]
      );

      // Get lead sources
      const [sources] = await pool.execute(
        `SELECT * FROM lead_sources 
                 WHERE round_robin_id = ? AND is_active = TRUE`,
        [roundRobin.id]
      );

      roundRobin.participants = participants;
      roundRobin.leadSources = sources;

      return roundRobin;
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
}

module.exports = RoundRobin;
