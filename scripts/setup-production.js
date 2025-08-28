const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
require("dotenv").config();

async function setupProduction() {
  console.log("🚀 Setting up JJ Leads Round Robin System...\n");

  try {
    // Validate environment variables
    const requiredEnvVars = [
      "DB_HOST",
      "DB_USER",
      "DB_PASSWORD",
      "DB_NAME",
      "SESSION_SECRET",
      "WEBHOOK_BEARER_TOKEN",
      "ADMIN_NAME",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );
    if (missingVars.length > 0) {
      console.error("❌ Missing required environment variables:");
      missingVars.forEach((varName) => console.error(`   - ${varName}`));
      console.error(
        "\n💡 Please check your .env file and ensure all variables are set."
      );
      process.exit(1);
    }

    console.log("✅ Environment variables validated");

    // Create connection without database selection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 3306,
      multipleStatements: true,
    });

    console.log("✅ Connected to MySQL server");

    // Create database
    try {
      await connection.execute(
        `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``
      );
      console.log(`✅ Database '${process.env.DB_NAME}' created/verified`);
    } catch (err) {
      console.error("❌ Database creation error:", err.message);
      process.exit(1);
    }

    // Close connection and reconnect with database selected
    await connection.end();

    const dbConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
    });

    console.log(`✅ Connected to database '${process.env.DB_NAME}'`);

    // Read and execute main schema
    const schemaPath = path.join(__dirname, "database-schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // Split schema into statements and execute them
    const lines = schema.split("\n");
    const nonCommentLines = lines.filter(
      (line) => !line.trim().startsWith("--")
    );
    const cleanedSchema = nonCommentLines.join("\n");
    const statements = cleanedSchema
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute`);

    console.log("📋 Creating database tables...");

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        console.log(`   Executing statement ${i + 1}/${statements.length}...`);
        await dbConnection.execute(statement);
        const shortStmt = statement.replace(/\s+/g, " ").substring(0, 50);
        console.log(`   ✅ ${shortStmt}...`);
      } catch (err) {
        console.error(
          `   ❌ Error executing statement ${i + 1}: ${statement.substring(
            0,
            100
          )}...`
        );
        console.error(`      Error: ${err.message}`);
        if (
          !err.message.includes("already exists") &&
          !err.message.includes("Duplicate entry")
        ) {
          throw err; // Stop execution on real errors
        }
        console.log(
          `   ⚠️  Continuing despite error (table might already exist)`
        );
      }
    }

    // Execute additional table creation scripts
    const additionalScripts = [
      "add-lead-additional-data.sql",
      "create-lead-logs-table.sql",
    ];

    console.log("📋 Creating additional tables...");

    for (const scriptName of additionalScripts) {
      const scriptPath = path.join(__dirname, scriptName);
      if (fs.existsSync(scriptPath)) {
        try {
          const scriptContent = fs.readFileSync(scriptPath, "utf8");
          const scriptStatements = scriptContent
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

          for (const statement of scriptStatements) {
            await dbConnection.execute(statement);
          }
          console.log(`   ✅ ${scriptName}`);
        } catch (err) {
          if (!err.message.includes("already exists")) {
            console.error(`   ⚠️  ${scriptName}: ${err.message}`);
          }
        }
      }
    }

    // Create admin user
    console.log("👤 Creating admin user...");

    try {
      // First, let's verify the users table exists
      const [tableCheck] = await dbConnection.execute(
        'SHOW TABLES LIKE "users"'
      );
      if (tableCheck.length === 0) {
        throw new Error("Users table was not created successfully");
      }
      console.log("   ✅ Users table verified");

      // Check if admin user already exists
      const [existingAdmin] = await dbConnection.execute(
        "SELECT id FROM users WHERE email = ?",
        [process.env.ADMIN_EMAIL]
      );

      if (existingAdmin.length > 0) {
        console.log("   ⚠️  Admin user already exists, skipping creation");
      } else {
        // Hash the admin password
        console.log("   🔐 Hashing admin password...");
        const hashedPassword = await bcrypt.hash(
          process.env.ADMIN_PASSWORD,
          10
        );
        console.log("   ✅ Password hashed successfully");

        console.log("   📝 Inserting admin user...");
        await dbConnection.execute(
          "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)",
          [
            process.env.ADMIN_NAME,
            process.env.ADMIN_EMAIL,
            hashedPassword,
            "admin",
            true,
          ]
        );
        console.log("   ✅ Admin user created successfully");
      }
    } catch (adminError) {
      console.error("   ❌ Error creating admin user:", adminError.message);
      throw adminError;
    }

    await dbConnection.end();

    console.log("\n🎉 Setup completed successfully!\n");
    console.log("📝 Setup Summary:");
    console.log(`   • Database: ${process.env.DB_NAME}`);
    console.log(`   • Admin Email: ${process.env.ADMIN_EMAIL}`);
    console.log(`   • Server Port: ${process.env.PORT || 3000}`);
    console.log(`   • Environment: ${process.env.NODE_ENV || "development"}`);

    if (process.env.NODE_ENV === "development") {
      console.log("\n🧪 Sample users created for development testing");
    }

    console.log("\n🚀 You can now start the server with: npm start");
    console.log(
      `🌐 Access the application at: http://localhost:${
        process.env.PORT || 3000
      }`
    );
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    console.error("\n🔍 Please check:");
    console.error("   • Database credentials are correct");
    console.error("   • MySQL server is running");
    console.error("   • Database user has CREATE privileges");
    process.exit(1);
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupProduction();
}

module.exports = { setupProduction };
