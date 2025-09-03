const express = require("express");
const RoundRobin = require("../models/RoundRobin");
const Participant = require("../models/Participant");
const { requireAdminAuth } = require("../middleware/adminAuth");

const router = express.Router();

// List all round robins
router.get("/", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;

    const { roundRobins, total, pages } = await RoundRobin.findAll(page, 10);

    res.render("pages/round-robins/index", {
      title: "Round Robins",
      roundRobins,
      pagination: { page, pages, total },
    });
  } catch (error) {
    console.error("Round robins list error:", error);
    res.render("pages/error", {
      error: "Failed to load round robins",
    });
  }
});

// Create round robin page
router.get("/create", requireAdminAuth, async (req, res) => {
  try {
    const participants = await Participant.findActive();

    res.render("pages/round-robins/create", {
      title: "Create Round Robin",
      participants,
    });
  } catch (error) {
    console.error("Create RR page error:", error);
    res.render("pages/error", {
      error: "Failed to load create page",
    });
  }
});

// Create round robin POST
router.post("/", requireAdminAuth, async (req, res) => {
  try {
    const { name, description, participants = [], leadSources = [] } = req.body;

    // Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Round robin name is required" });
    }

    if (!participants || participants.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one participant is required" });
    }

    if (!leadSources || leadSources.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one lead source URL is required" });
    }

    // Parse participants - they should already be in the correct format from the frontend
    const parsedParticipants = participants.map((participant, index) => ({
      participantId: participant.participantId || null,
      name: participant.name,
      discordName: participant.discordName || null,
      discordWebhook: participant.discordWebhook || null,
      leadLimit: parseInt(participant.leadLimit) || 15,
      isExternal: participant.isExternal || false,
    }));

    const roundRobinId = await RoundRobin.create({
      name: name.trim(),
      description: description ? description.trim() : null,
      participants: parsedParticipants,
      leadSources: leadSources || [],
    });

    // Check if it's JSON request
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("application/json")
    ) {
      res.json({ success: true, roundRobinId });
    } else {
      res.redirect(`/round-robins/${roundRobinId}`);
    }
  } catch (error) {
    console.error("Create round robin error:", error);

    // Check if it's JSON request
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("application/json")
    ) {
      res
        .status(500)
        .json({ error: "Failed to create round robin. Please try again." });
    } else {
      const participants = await Participant.findActive();
      res.render("pages/round-robins/create", {
        title: "Create Round Robin",
        participants,
        error: "Failed to create round robin. Please try again.",
      });
    }
  }
});

// View specific round robin
router.get("/:id", requireAdminAuth, async (req, res) => {
  try {
    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.render("pages/error", {
        error: "Round robin not found",
      });
    }
    res.render("pages/round-robins/show", {
      title: roundRobin.name,
      roundRobin,
    });
  } catch (error) {
    console.error("Show round robin error:", error);
    res.render("pages/error", {
      error: "Failed to load round robin",
    });
  }
});

// Edit round robin page
router.get("/:id/edit", requireAdminAuth, async (req, res) => {
  try {
    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.render("pages/error", {
        error: "Round robin not found",
      });
    }

    // Get available participants for dropdown
    const participants = await Participant.findActive();

    res.render("pages/round-robins/edit", {
      title: `Edit: ${roundRobin.name}`,
      activeSection: "manage-rr",
      roundRobin,
      participants,
      error: null,
    });
  } catch (error) {
    console.error("Edit round robin page error:", error);
    res.render("pages/error", {
      error: "Failed to load edit page",
    });
  }
});

// Update round robin
router.post("/:id/edit", requireAdminAuth, async (req, res) => {
  try {
    const { name, description, participants = [], leadSources = [] } = req.body;

    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.status(404).json({ error: "Round robin not found" });
    }

    // Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Round robin name is required" });
    }

    if (!participants || participants.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one participant is required" });
    }

    if (!leadSources || leadSources.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one lead source URL is required" });
    }

    // Parse participants
    const parsedParticipants = participants.map((participant, index) => ({
      participantId: participant.participantId || null,
      name: participant.name,
      discordName: participant.discordName || null,
      discordWebhook: participant.discordWebhook || null,
      leadLimit: parseInt(participant.leadLimit) || 15,
      isExternal: participant.isExternal || false,
    }));

    await RoundRobin.updateFull(req.params.id, {
      name: name.trim(),
      description: description ? description.trim() : null,
      participants: parsedParticipants,
      leadSources: leadSources || [],
    });

    // Check if it's JSON request
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("application/json")
    ) {
      res.json({ success: true });
    } else {
      res.redirect(`/round-robins/${req.params.id}`);
    }
  } catch (error) {
    console.error("Update round robin error:", error);

    // Check if it's JSON request
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("application/json")
    ) {
      res
        .status(500)
        .json({ error: "Failed to update round robin. Please try again." });
    } else {
      const participants = await Participant.findActive();
      res.render("pages/round-robins/edit", {
        title: "Edit Round Robin",
        activeSection: "manage-rr",
        participants,
        error: "Failed to update round robin. Please try again.",
      });
    }
  }
});

// Launch round robin
router.post("/:id/launch", requireAdminAuth, async (req, res) => {
  try {
    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.status(404).json({ error: "Round robin not found" });
    }

    if (roundRobin.is_launched) {
      return res.status(400).json({ error: "Round robin is already launched" });
    }

    await RoundRobin.launch(req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error("Launch round robin error:", error);
    res.status(500).json({ error: "Failed to launch round robin" });
  }
});

// Simulate lead (for testing)
router.post("/:id/simulate-lead", requireAdminAuth, async (req, res) => {
  try {
    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.status(404).json({ error: "Round robin not found" });
    }

    if (!roundRobin.is_launched) {
      return res
        .status(400)
        .json({ error: "Round robin must be launched first" });
    }

    // Generate sample lead data
    const sampleNames = [
      "David Lee",
      "Sarah Ng",
      "Michael Chua",
      "Jessica Tan",
      "Robert Lim",
    ];
    const samplePhones = [
      "91112222",
      "93334444",
      "95556666",
      "97778888",
      "99990000",
    ];
    const sampleEmails = [
      "lead1@email.com",
      "lead2@email.com",
      "lead3@email.com",
      "lead4@email.com",
      "lead5@email.com",
    ];

    const randomIndex = Math.floor(Math.random() * sampleNames.length);
    const randomSource =
      roundRobin.leadSources && roundRobin.leadSources.length > 0
        ? roundRobin.leadSources[
            Math.floor(Math.random() * roundRobin.leadSources.length)
          ].url
        : "https://propertyguru.com.sg";

    const leadData = {
      name: sampleNames[randomIndex],
      phone: samplePhones[randomIndex],
      email: sampleEmails[randomIndex],
      sourceUrl: randomSource,
    };

    const result = await RoundRobin.distributeLead(req.params.id, leadData);

    res.json({
      success: true,
      assignedTo: result.assignedTo.name,
      leadData,
    });
  } catch (error) {
    console.error("Simulate lead error:", error);
    res.status(500).json({ error: "Failed to simulate lead" });
  }
});

// Update round robin
router.put("/:id", requireAdminAuth, async (req, res) => {
  try {
    const { name, description } = req.body;

    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.status(404).json({ error: "Round robin not found" });
    }

    await RoundRobin.update(req.params.id, { name, description });

    res.json({ success: true });
  } catch (error) {
    console.error("Update round robin error:", error);
    res.status(500).json({ error: "Failed to update round robin" });
  }
});

// Delete round robin
router.delete("/:id", requireAdminAuth, async (req, res) => {
  try {
    const roundRobin = await RoundRobin.findById(req.params.id);

    if (!roundRobin) {
      return res.status(404).json({ error: "Round robin not found" });
    }

    await RoundRobin.delete(req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete round robin error:", error);
    res.status(500).json({ error: "Failed to delete round robin" });
  }
});

module.exports = router;
