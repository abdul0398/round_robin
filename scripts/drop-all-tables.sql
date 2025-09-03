-- Drop all tables script for JJ Leads Round Robin
-- This will remove all existing data and tables

-- Disable foreign key checks temporarily to avoid constraint errors
SET FOREIGN_KEY_CHECKS = 0;

-- Drop tables in any order (foreign key checks are disabled)
DROP TABLE IF EXISTS lead_additional_data;
DROP TABLE IF EXISTS lead_logs;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS lead_sources;
DROP TABLE IF EXISTS rr_participants;
DROP TABLE IF EXISTS round_robins;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS master_urls;
DROP TABLE IF EXISTS junk_list;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Confirm tables are dropped
SELECT 'All tables have been dropped successfully.' as status;