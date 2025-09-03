const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bodyParser = require("body-parser");
const path = require("path");
const methodOverride = require("method-override");
require("dotenv").config();

const { pool, testConnection } = require("./config/database");
const { loadAdminSession } = require("./middleware/adminAuth");

// Import routes
const adminRoutes = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const roundRobinRoutes = require("./routes/roundRobins");
const participantsRoutes = require("./routes/participants");
const apiRoutes = require("./routes/api");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 3000;

// Session store configuration - use admin_sessions table
const sessionStore = new MySQLStore(
  {
    schema: {
      tableName: "admin_sessions",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  },
  pool
);

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

// Session configuration
app.use(
  session({
    key: "session_cookie_name",
    secret: process.env.SESSION_SECRET || "your-secret-key-here",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
    },
  })
);

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Load admin session middleware
app.use(loadAdminSession);

// Routes
app.use("/admin", adminRoutes);
app.use("/", dashboardRoutes);
app.use("/round-robins", roundRobinRoutes);
app.use("/participants", participantsRoutes);
app.use("/api", apiRoutes);

// Root redirect
app.get("/", (req, res) => {
  if (req.session && req.session.isAdminAuthenticated) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/admin/login");
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).render("pages/error", {
    error: "Something went wrong. Please try again.",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render("pages/error", {
    error: "Page not found",
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error(
        "Failed to connect to database. Please check your configuration."
      );
      process.exit(1);
    }
    const data = {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    };
    const existingUser = await User.findByEmail(process.env.ADMIN_EMAIL);

    if (!existingUser) {
      console.log("Admin user already exists.");
      await User.create(data);
    }

    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log("✓ Database connected successfully");
      console.log("\n📝 To set up the database, run: npm run create-tables");
      console.log("🔐 Admin login: /admin/login");
      console.log("👤 Default credentials: admin / admin123");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
