const { pool } = require("../config/database");
const LeadLogger = require("../utils/LeadLogger");
const Participant = require("./Participant");
const crypto = require("crypto");

class RoundRobin {
  // Create a new round robin
  static async create(rrData) {
    const { name, description, participants = [], leadSources = [] } = rrData;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Generate webhook secret
      const webhookSecret = crypto.randomBytes(32).toString("hex");

      // Insert round robin
      const [rrResult] = await connection.execute(
        `INSERT INTO round_robins (name, description, webhook_secret) 
                 VALUES (?, ?, ?)`,
        [name, description || null, webhookSecret]
      );

      const roundRobinId = rrResult.insertId;

      // Handle participants: create new ones in global participants table first
      if (participants.length > 0) {
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          let participantId = participant.participantId;

          // If this is a new participant (isExternal = true), create it in the global participants table first
          if (participant.isExternal && !participant.participantId) {
            participantId = await Participant.create({
              name: participant.name,
              discordName: participant.discordName,
              discordWebhook: participant.discordWebhook,
            });
          }

          // Now create the round robin participant association
          await connection.execute(
            `INSERT INTO rr_participants 
                         (round_robin_id, participant_id, name, discord_name, discord_webhook, 
                          lead_limit, queue_position, is_external) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              roundRobinId,
              participantId,
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
  static async findAll(page = 1, limit = 10) {
    try {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit) || 10;
      const offsetInt = (pageInt - 1) * limitInt;

      const [rows] = await pool.execute(
        `SELECT rr.*, 
                        COUNT(DISTINCT p.id) as participant_count,
                        COUNT(DISTINCT s.id) as source_count,
                        COALESCE(rr.current_position, 0) as current_position
                 FROM round_robins rr
                 LEFT JOIN rr_participants p ON rr.id = p.round_robin_id AND p.is_active = TRUE
                 LEFT JOIN lead_sources s ON rr.id = s.round_robin_id AND s.is_active = TRUE
                 GROUP BY rr.id
                 ORDER BY rr.created_at DESC
                 LIMIT ${limitInt} OFFSET ${offsetInt}`
      );

      const [countRows] = await pool.execute(
        `SELECT COUNT(DISTINCT rr.id) as total FROM round_robins rr`
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
        `SELECT rr.* FROM round_robins rr WHERE rr.id = ?`,
        [id]
      );

      if (rrRows.length === 0) return null;

      const roundRobin = rrRows[0];

      // Get participants
      const [participants] = await pool.execute(
        `SELECT * FROM rr_participants 
                 WHERE round_robin_id = ? AND is_active = TRUE
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

  // Get leads for a round robin with pagination
  static async getLeads(roundRobinId, page = 1, limit = 20) {
    try {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit) || 20;
      const offsetInt = (pageInt - 1) * limitInt;

      // Get leads with participant information and additional data
      const [leads] = await pool.execute(
        `SELECT l.*, 
                p.name as participant_name,
                p.discord_name as participant_discord,
                COUNT(lad.id) as additional_fields_count
         FROM leads l
         JOIN rr_participants p ON l.participant_id = p.id
         LEFT JOIN lead_additional_data lad ON l.id = lad.lead_id
         WHERE l.round_robin_id = ?
         GROUP BY l.id
         ORDER BY l.received_at DESC
         LIMIT ${limitInt} OFFSET ${offsetInt}`,
        [roundRobinId]
      );

      // Get total count for pagination
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) as total FROM leads WHERE round_robin_id = ?`,
        [roundRobinId]
      );

      // Get additional data for each lead
      for (const lead of leads) {
        const [additionalData] = await pool.execute(
          `SELECT field_key, field_value FROM lead_additional_data 
           WHERE lead_id = ? ORDER BY id`,
          [lead.id]
        );
        lead.additional_data = additionalData;
      }

      return {
        leads,
        total: countRows[0].total,
        page: pageInt,
        pages: Math.ceil(countRows[0].total / limitInt),
        limit: limitInt
      };
    } catch (error) {
      throw error;
    }
  }

  // Mark a lead as junk and add email/phone to junk list
  static async markLeadAsJunk(leadId, reason = 'Marked as junk') {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get the lead details first
      const [leadRows] = await connection.execute(
        'SELECT * FROM leads WHERE id = ?',
        [leadId]
      );
      
      if (leadRows.length === 0) {
        return { success: false, error: 'Lead not found' };
      }
      
      const lead = leadRows[0];
      
      // Update lead status to junk
      await connection.execute(
        'UPDATE leads SET status = ?, status_reason = ? WHERE id = ?',
        ['junk', reason, leadId]
      );
      
      // Create junk rules for email and phone to prevent future leads
      const junkRulesCreated = [];
      
      // Add email to junk list if exists
      if (lead.email && lead.email.trim()) {
        try {
          await connection.execute(
            `INSERT INTO junk_list (type, value, reason, created_by, created_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            ['email', lead.email.trim().toLowerCase(), reason, 'admin']
          );
          junkRulesCreated.push(`email: ${lead.email}`);
        } catch (error) {
          // Ignore duplicate entry errors
          if (error.code !== 'ER_DUP_ENTRY') {
            throw error;
          }
        }
      }
      
      // Add phone to junk list if exists
      if (lead.phone && lead.phone.trim()) {
        try {
          await connection.execute(
            `INSERT INTO junk_list (type, value, reason, created_by, created_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            ['phone', lead.phone.trim(), reason, 'admin']
          );
          junkRulesCreated.push(`phone: ${lead.phone}`);
        } catch (error) {
          // Ignore duplicate entry errors
          if (error.code !== 'ER_DUP_ENTRY') {
            throw error;
          }
        }
      }
      
      await connection.commit();
      
      // Log the junk marking (outside transaction to avoid lock timeout)
      try {
        const LeadLogger = require('../utils/LeadLogger');
        await LeadLogger.log({
          leadId: leadId,
          roundRobinId: lead.round_robin_id,
          participantId: lead.participant_id,
          eventType: 'lead_marked_junk',
          status: 'success',
          message: `Lead marked as junk: ${reason}`,
          details: { 
            reason: reason,
            junkRulesCreated: junkRulesCreated,
            email: lead.email,
            phone: lead.phone
          }
        });
      } catch (logError) {
        console.error('Failed to log junk marking:', logError);
        // Don't fail the operation if logging fails
      }
      
      return { 
        success: true, 
        junkRulesCreated: junkRulesCreated 
      };
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Check if a lead should be marked as junk based on email/phone
  static async checkIfJunk(email, phone) {
    try {
      const conditions = [];
      const params = [];
      
      if (email && email.trim()) {
        conditions.push('(type = ? AND value = ?)');
        params.push('email', email.trim().toLowerCase());
      }
      
      if (phone && phone.trim()) {
        conditions.push('(type = ? AND value = ?)');
        params.push('phone', phone.trim());
      }
      
      if (conditions.length === 0) {
        return { isJunk: false };
      }
      
      const [rows] = await pool.execute(
        `SELECT * FROM junk_list WHERE ${conditions.join(' OR ')} AND is_active = TRUE LIMIT 1`,
        params
      );
      
      if (rows.length > 0) {
        return { 
          isJunk: true, 
          reason: `Automatically marked as junk - ${rows[0].type}: ${rows[0].value}`,
          junkRule: rows[0]
        };
      }
      
      return { isJunk: false };
      
    } catch (error) {
      // If junk_list table doesn't exist yet, return false
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return { isJunk: false };
      }
      throw error;
    }
  }

  // Pause/Unpause a participant in a round robin
  static async toggleParticipantPause(roundRobinId, participantId, isPaused, reason = '') {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check if participant exists in the round robin
      const [participantRows] = await connection.execute(
        'SELECT * FROM rr_participants WHERE round_robin_id = ? AND id = ?',
        [roundRobinId, participantId]
      );
      
      if (participantRows.length === 0) {
        return { success: false, error: 'Participant not found in this round robin' };
      }
      
      const participant = participantRows[0];
      
      // Update participant pause status
      await connection.execute(
        'UPDATE rr_participants SET is_paused = ? WHERE id = ?',
        [isPaused, participantId]
      );
      
      await connection.commit();
      
      // Log the pause/unpause action
      try {
        const LeadLogger = require('../utils/LeadLogger');
        await LeadLogger.log({
          leadId: null,
          roundRobinId: roundRobinId,
          participantId: participantId,
          eventType: isPaused ? 'participant_paused' : 'participant_unpaused',
          status: 'success',
          message: `Participant ${isPaused ? 'paused' : 'unpaused'}: ${participant.name}`,
          details: { 
            reason: reason,
            participantName: participant.name,
            action: isPaused ? 'pause' : 'unpause'
          }
        });
      } catch (logError) {
        console.error('Failed to log participant pause/unpause:', logError);
      }
      
      return { 
        success: true, 
        message: `Participant ${isPaused ? 'paused' : 'unpaused'} successfully`,
        participant: {
          id: participant.id,
          name: participant.name,
          is_paused: isPaused
        }
      };
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get next available (non-paused) participant for lead distribution
  static getNextAvailableParticipant(participants, currentPosition) {
    if (participants.length === 0) {
      return null;
    }
    
    // Start from current position and look for next available participant
    let attempts = 0;
    let position = currentPosition;
    
    while (attempts < participants.length) {
      const participant = participants[position];
      
      // Check if participant is active and not paused
      if (participant.is_active && !participant.is_paused) {
        return {
          participant: participant,
          position: position
        };
      }
      
      // Move to next participant
      position = (position + 1) % participants.length;
      attempts++;
    }
    
    // If all participants are paused, return null
    return null;
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

      // Check if this lead should be marked as junk
      const junkCheck = await this.checkIfJunk(leadData.email, leadData.phone);
      let leadStatus = leadData.status || "sent";
      let statusReason = null;
      
      if (junkCheck.isJunk) {
        leadStatus = "junk";
        statusReason = junkCheck.reason;
      }

      // Get next available (non-paused) participant
      const availableResult = this.getNextAvailableParticipant(participants, rr.current_position);
      
      if (!availableResult) {
        throw new Error("No available participants (all may be paused)");
      }
      
      const currentParticipant = availableResult.participant;
      const actualPosition = availableResult.position;

      // Insert the lead
      const [leadResult] = await connection.execute(
        `INSERT INTO leads 
                 (round_robin_id, participant_id, name, phone, email, source_url, source_domain, status, status_reason) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roundRobinId,
          currentParticipant.id,
          leadData.name || null,
          leadData.phone || null,
          leadData.email || null,
          leadData.sourceUrl || null,
          this.extractDomain(leadData.sourceUrl || ""),
          leadStatus,
          statusReason
        ]
      );

      // Update participant lead count
      await connection.execute(
        "UPDATE rr_participants SET leads_received = leads_received + 1 WHERE id = ?",
        [currentParticipant.id]
      );

      // Update round robin position and total leads
      // Move to next position from where we actually assigned the lead
      const nextPosition = (actualPosition + 1) % participants.length;
      await connection.execute(
        `UPDATE round_robins 
                 SET current_position = ?, total_leads = total_leads + 1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [nextPosition, roundRobinId]
      );

      await connection.commit();

      const leadId = leadResult.insertId;

      // Log lead assignment
      await LeadLogger.logLeadAssigned(
        leadId,
        roundRobinId,
        currentParticipant.id,
        currentParticipant.name
      );

      // Send to Discord webhook (don't fail the lead distribution if Discord fails)
      // Skip Discord notification for junk leads
      let discordResult = null;
      if (leadStatus === "junk") {
        await LeadLogger.log({
          leadId: leadId,
          roundRobinId: roundRobinId,
          participantId: currentParticipant.id,
          eventType: 'lead_marked_junk',
          status: 'info',
          message: `Lead automatically marked as junk - Discord notification skipped`,
          details: { 
            reason: statusReason,
            email: leadData.email,
            phone: leadData.phone
          }
        });
        discordResult = { success: false, reason: "Lead marked as junk - Discord notification skipped" };
      } else {
        try {
          discordResult = await this.sendToDiscord(
            currentParticipant,
            leadData,
            [],
            leadId,
            roundRobinId
          );
        } catch (discordError) {
          await LeadLogger.logError(
            leadId,
            roundRobinId,
            currentParticipant.id,
            discordError,
            {
              context: "discord_notification",
              leadData: { name: leadData.name, email: leadData.email },
            }
          );
          discordResult = { success: false, reason: discordError.message };
        }
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

      // Smart participant update - preserve existing participants with leads

      // Get current participants in the round robin
      const [currentParticipants] = await connection.execute(
        "SELECT id, participant_id, name, discord_name FROM rr_participants WHERE round_robin_id = ?",
        [id]
      );

      // Build a map of existing participants for quick lookup
      const existingParticipantMap = new Map();
      currentParticipants.forEach((p) => {
        const key = p.participant_id
          ? `participant_${p.participant_id}`
          : `external_${p.name}_${p.discord_name}`;
        existingParticipantMap.set(key, p);
      });

      // Track which participants should remain
      const participantsToKeep = new Set();

      // Process each participant in the update
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        let participantId = participant.participantId;

        // If this is a new external participant, create it in the global participants table first
        if (participant.isExternal && !participant.participantId) {
          participantId = await Participant.create({
            name: participant.name,
            discordName: participant.discordName,
            discordWebhook: participant.discordWebhook,
          });
        }

        // Create key for this participant (after potential creation)
        const participantKey = participantId
          ? `participant_${participantId}`
          : `external_${participant.name}_${participant.discordName}`;

        if (existingParticipantMap.has(participantKey)) {
          // Update existing participant
          const existingParticipant =
            existingParticipantMap.get(participantKey);
          participantsToKeep.add(existingParticipant.id);

          await connection.execute(
            `UPDATE rr_participants 
             SET participant_id = ?, name = ?, discord_name = ?, discord_webhook = ?, 
                 lead_limit = ?, queue_position = ?, is_external = ?
             WHERE id = ?`,
            [
              participantId,
              participant.name,
              participant.discordName || null,
              participant.discordWebhook || null,
              participant.leadLimit || 15,
              i,
              participant.isExternal || false,
              existingParticipant.id,
            ]
          );
        } else {
          // Insert new participant
          await connection.execute(
            `INSERT INTO rr_participants 
                         (round_robin_id, participant_id, name, discord_name, discord_webhook, 
                          lead_limit, queue_position, is_external) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              participantId,
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

      // Remove participants that are no longer in the list (but only if they have no leads)
      for (const existingParticipant of currentParticipants) {
        if (!participantsToKeep.has(existingParticipant.id)) {
          // Check if this participant has any leads
          const [leadCount] = await connection.execute(
            "SELECT COUNT(*) as count FROM leads WHERE participant_id = ?",
            [existingParticipant.id]
          );

          if (leadCount[0].count === 0) {
            // Safe to delete - no leads associated
            await connection.execute(
              "DELETE FROM rr_participants WHERE id = ?",
              [existingParticipant.id]
            );
          } else {
            // Mark as inactive instead of deleting to preserve lead history
            await connection.execute(
              "UPDATE rr_participants SET is_active = FALSE WHERE id = ?",
              [existingParticipant.id]
            );
          }
        }
      }

      // Update lead sources (these can be safely deleted and recreated)
      await connection.execute(
        "DELETE FROM lead_sources WHERE round_robin_id = ?",
        [id]
      );

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
  static async getDashboardStats() {
    try {
      // Get basic stats - use REAL counts from leads table instead of cached counters
      const [statsRows] = await pool.execute(
        `SELECT 
                    COUNT(DISTINCT rr.id) as total_rrs,
                    COUNT(DISTINCT CASE WHEN rr.is_launched = TRUE THEN rr.id END) as active_rrs,
                    COALESCE(COUNT(DISTINCT l.id), 0) as total_leads,
                    COUNT(DISTINCT p.id) as total_participants
                 FROM round_robins rr
                 LEFT JOIN rr_participants p ON rr.id = p.round_robin_id AND p.is_active = TRUE
                 LEFT JOIN leads l ON rr.id = l.round_robin_id`
      );

      // Get today's leads
      const [todayRows] = await pool.execute(
        `SELECT COUNT(*) as today_leads
                 FROM leads l
                 WHERE DATE(l.received_at) = CURDATE()`
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
  static async sendToDiscord(
    participantData,
    leadData,
    additionalData = [],
    leadId = null,
    roundRobinId = null
  ) {
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

      // Check if this lead should be marked as junk
      const junkCheck = await this.checkIfJunk(leadData.email, leadData.mobile_number || leadData.phone);
      let leadStatus = "sent";
      let statusReason = null;
      
      if (junkCheck.isJunk) {
        leadStatus = "junk";
        statusReason = junkCheck.reason;
      }

      // Get next available (non-paused) participant
      const availableResult = this.getNextAvailableParticipant(roundRobin.participants, roundRobin.current_position);
      
      if (!availableResult) {
        throw new Error("No available participants (all may be paused)");
      }
      
      const currentParticipant = availableResult.participant;
      const actualPosition = availableResult.position;

      // Insert the lead
      const [leadResult] = await connection.execute(
        `INSERT INTO leads 
                 (round_robin_id, participant_id, name, phone, email, source_url, source_domain, status, status_reason) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roundRobin.id,
          currentParticipant.id,
          leadData.name || null,
          leadData.mobile_number || leadData.phone || null,
          leadData.email || null,
          leadData.source_url || sourceUrl,
          this.extractDomain(leadData.source_url || sourceUrl),
          leadStatus,
          statusReason
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
      // Move to next position from where we actually assigned the lead
      const nextPosition = (actualPosition + 1) % roundRobin.participants.length;
      await connection.execute(
        `UPDATE round_robins 
                 SET current_position = ?, total_leads = total_leads + 1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
        [nextPosition, roundRobin.id]
      );

      await connection.commit();

      // Log lead assignment
      await LeadLogger.logLeadAssigned(
        leadId,
        roundRobin.id,
        currentParticipant.id,
        currentParticipant.name
      );

      // Send to Discord webhook (don't fail the lead distribution if Discord fails)
      // Skip Discord notification for junk leads
      let discordResult = null;
      if (leadStatus === "junk") {
        await LeadLogger.log({
          leadId: leadId,
          roundRobinId: roundRobin.id,
          participantId: currentParticipant.id,
          eventType: 'lead_marked_junk',
          status: 'info',
          message: `Lead automatically marked as junk - Discord notification skipped`,
          details: { 
            reason: statusReason,
            email: leadData.email,
            phone: leadData.mobile_number || leadData.phone
          }
        });
        discordResult = { success: false, reason: "Lead marked as junk - Discord notification skipped" };
      } else {
        try {
          discordResult = await this.sendToDiscord(
            currentParticipant,
            leadData,
            leadData.additional_data,
            leadId,
            roundRobin.id
          );
        } catch (discordError) {
          await LeadLogger.logError(
            leadId,
            roundRobin.id,
            currentParticipant.id,
            discordError,
            {
              context: "discord_notification_with_additional_data",
              leadData: {
                name: leadData.name,
                email: leadData.email,
                additionalDataCount: leadData.additional_data?.length || 0,
              },
            }
          );
          discordResult = { success: false, reason: discordError.message };
        }
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
        `SELECT DISTINCT rr.* 
                 FROM round_robins rr
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
                 WHERE round_robin_id = ? AND is_active = TRUE
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
