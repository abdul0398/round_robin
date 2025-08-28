# 🚀 JJ Leads Round Robin System - Production Deployment Guide

## Prerequisites

- Node.js (v18 or higher)
- MySQL Database (v8.0 or higher)
- Git (for cloning the repository)

## Quick Setup

### 1. Clone and Install

```bash
git clone <your-repository-url>
cd roundrobin
npm install
```

### 2. Environment Configuration

Copy the production environment template:

```bash
cp .env.production .env
```

Edit `.env` with your production values:

```env
# Database Configuration
DB_HOST=your_production_db_host
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_NAME=roundrobin_prod
DB_PORT=3306

# Application Configuration
SESSION_SECRET=your_super_secure_session_secret_here_change_this
PORT=3000
NODE_ENV=production

# Webhook Configuration  
WEBHOOK_BEARER_TOKEN=your_secure_webhook_token_change_this

# Admin User Configuration
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_secure_admin_password_change_this
```

### 3. Database Setup

Run the automated setup:

```bash
npm run setup
```

This will:
- ✅ Create the database
- ✅ Create all required tables
- ✅ Set up indexes and relationships
- ✅ Create the admin user
- ✅ Initialize logging system

### 4. Verify Setup

Check everything is working:

```bash
npm run check
```

### 5. Start Production Server

```bash
npm start
```

Access your application at: `http://localhost:3000`

---

## Manual Database Setup (Alternative)

If you prefer manual setup or the automated script fails:

### Step 1: Create Database

```sql
CREATE DATABASE roundrobin_prod;
USE roundrobin_prod;
```

### Step 2: Run Schema Scripts

```bash
mysql -u your_user -p roundrobin_prod < scripts/database-schema.sql
mysql -u your_user -p roundrobin_prod < scripts/add-lead-additional-data.sql  
mysql -u your_user -p roundrobin_prod < scripts/create-lead-logs-table.sql
```

### Step 3: Create Admin User

```sql
INSERT INTO users (name, email, password, role, is_active) VALUES 
('Administrator', 'admin@yourdomain.com', '$2a$10$hash_your_password_here', 'admin', TRUE);
```

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` or IP address |
| `DB_USER` | Database username | `roundrobin_user` |
| `DB_PASSWORD` | Database password | Strong password |
| `DB_NAME` | Database name | `roundrobin_prod` |
| `DB_PORT` | Database port | `3306` |
| `SESSION_SECRET` | Session encryption key | Random 32+ character string |
| `PORT` | Application port | `3000` |
| `NODE_ENV` | Environment mode | `production` |
| `WEBHOOK_BEARER_TOKEN` | API authentication token | Secure random token |
| `ADMIN_NAME` | Default admin name | `Administrator` |
| `ADMIN_EMAIL` | Admin login email | `admin@yourdomain.com` |
| `ADMIN_PASSWORD` | Admin login password | Strong password |

---

## Security Checklist

### Before Production:

- [ ] Change all default passwords and tokens
- [ ] Use strong, unique `SESSION_SECRET` 
- [ ] Use strong, unique `WEBHOOK_BEARER_TOKEN`
- [ ] Set `NODE_ENV=production`
- [ ] Restrict database user permissions
- [ ] Enable HTTPS if possible
- [ ] Configure firewall rules
- [ ] Regular backups scheduled

### Recommended Token Generation:

```bash
# For SESSION_SECRET (32+ characters)
openssl rand -hex 32

# For WEBHOOK_BEARER_TOKEN
openssl rand -base64 32
```

---

## Process Management (Production)

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name "jj-leads-rr"

# Make PM2 auto-restart on system reboot
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs jj-leads-rr
```

### Using systemd

Create `/etc/systemd/system/jj-leads-rr.service`:

```ini
[Unit]
Description=JJ Leads Round Robin System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/roundrobin
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable jj-leads-rr
sudo systemctl start jj-leads-rr
sudo systemctl status jj-leads-rr
```

---

## Database Backup

### Automated Daily Backup Script

Create `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/roundrobin"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="roundrobin_prod"

mkdir -p $BACKUP_DIR
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME > "$BACKUP_DIR/backup_$DATE.sql"

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /path/to/backup.sh
```

---

## Troubleshooting

### Common Issues:

**Database Connection Failed:**
- Check MySQL is running
- Verify credentials in `.env`
- Ensure database user has proper permissions

**Port Already in Use:**
```bash
# Find process using port 3000
lsof -ti:3000
# Kill the process
kill -9 <process_id>
```

**Admin Login Issues:**
- Verify admin user exists: `SELECT * FROM users WHERE role='admin';`
- Check password hash is correct
- Try recreating admin user

**Discord Webhooks Not Working:**
- Check `lead_logs` table for error details
- Verify Discord webhook URLs are valid
- Check network connectivity

### Logs Location:

- Application logs: Console output or PM2 logs
- Database logs: MySQL error log
- Lead activity: `lead_logs` table in database

---

## API Endpoints

### Webhook for PHP Integration:

```bash
POST /api/webhook/lead-by-source
Authorization: Bearer your_webhook_token
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile_number": "91234567",
  "source_url": "https://yourdomain.com",
  "additional_data": [
    {"key": "Project", "value": "Marina Bay Condo"},
    {"key": "Floor", "value": "15"}
  ]
}
```

### Management APIs:

- `GET /api/logs/round-robin/:id` - View round robin logs
- `GET /api/logs/errors` - View error logs  
- `GET /api/logs/discord-stats/:id` - Discord performance stats

---

## Support

For issues or questions:
1. Check the logs first (`npm run check`)
2. Review this deployment guide
3. Check the database `lead_logs` table for detailed error information

---

**🎉 Your JJ Leads Round Robin System is ready for production!**