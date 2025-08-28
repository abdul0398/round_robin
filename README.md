# JJ Leads Round Robin System

A full-fledged web application for managing lead distribution through round-robin systems, built with Node.js, Express, MySQL, and EJS templating.

## Features

- **Admin Authentication**: Secure single admin login (no registration)
- **Round Robin Management**: Create and manage multiple round-robin distribution systems
- **Lead Distribution**: Automatic lead assignment to agents in rotation
- **Dashboard**: Real-time statistics and overview
- **External Participant Management**: Add external agents with Discord webhooks
- **Discord Integration**: Webhook support for lead notifications
- **Responsive Design**: Mobile-friendly interface

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Templating**: EJS
- **Authentication**: bcryptjs, express-session
- **Styling**: CSS3 with responsive design

## Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd roundrobin
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Database Setup**:
   - Make sure MySQL is installed and running
   - Create a new database or update the `.env` file with your database credentials
   - Copy `.env.example` to `.env` and update with your settings:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` file with your database credentials

4. **Initialize Database**:
   ```bash
   npm run create-tables
   ```

5. **Start the application**:
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Access the application**:
   - Open your browser to `http://localhost:3000`
   - Default admin credentials:
     - Email: `admin@jjleads.com`
     - Password: `admin123`

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jj_leads_rr
DB_PORT=3306
SESSION_SECRET=your_session_secret_key_here
PORT=3000
```

## Database Schema

The application uses the following main tables:

- **users**: User authentication and profile data
- **round_robins**: Round robin configurations
- **rr_participants**: Participants in each round robin
- **lead_sources**: URL sources for leads
- **leads**: Lead records and assignments
- **sessions**: Session storage

## Access Control

- **Single Admin**: One admin user with full system access
- **External Participants**: Non-system users added to round robins with Discord webhooks
- **No Registration**: Only the predefined admin can access the system

## API Endpoints

### Webhook Integration

- `POST /api/webhook/lead/:roundRobinId`: Accept leads from external sources
- `GET /api/webhook/test/:roundRobinId`: Test webhook endpoint

### Internal APIs

- `GET /api/users`: Get list of users
- `GET /api/dashboard/stats`: Get dashboard statistics
- `GET /api/round-robins`: Get round robins list

## Usage

### Creating a Round Robin

1. Navigate to "Create RR" section
2. Enter round robin name and description
3. Add participants (existing users or external contacts)
4. Set lead limits for each participant
5. Add lead source URLs
6. Create the round robin

### Launching a Round Robin

1. Go to the round robin details page
2. Review participant order (can be reordered by drag & drop)
3. Click "Launch RR" to activate lead distribution
4. Once launched, leads will be distributed automatically

### Lead Distribution

- Leads are distributed in round-robin fashion
- Each participant has a configurable lead limit
- Lead sources can be tracked and managed
- Discord webhooks can notify agents of new leads

## Development

### Project Structure

```
roundrobin/
├── config/          # Database configuration
├── middleware/      # Express middleware
├── models/          # Database models
├── routes/          # Express routes
├── scripts/         # Database setup scripts
├── views/           # EJS templates
│   ├── pages/       # Page templates
│   └── partials/    # Reusable template parts
├── public/          # Static assets
│   ├── css/         # Stylesheets
│   ├── js/          # Client-side JavaScript
│   └── images/      # Images
└── server.js        # Main application file
```

### Adding New Features

1. Create database migrations in `scripts/`
2. Add model methods in `models/`
3. Create routes in `routes/`
4. Add views in `views/pages/`
5. Update client-side JavaScript in `public/js/`

## Deployment

### Production Setup

1. Set environment variables:
   ```env
   NODE_ENV=production
   DB_HOST=your_production_db_host
   DB_USER=your_production_db_user
   DB_PASSWORD=your_production_db_password
   SESSION_SECRET=a_very_secure_random_string
   ```

2. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "jj-leads-rr"
   ```

3. Set up a reverse proxy with Nginx
4. Enable HTTPS for secure sessions

## Security Considerations

- Change default admin password immediately
- Use strong session secrets in production
- Enable HTTPS in production
- Regularly update dependencies
- Implement rate limiting for API endpoints
- Validate and sanitize all user inputs

## Troubleshooting

### Common Issues

1. **Database Connection Error**: Check MySQL service and credentials in `.env`
2. **Session Issues**: Verify `SESSION_SECRET` is set and sessions table exists
3. **Port Already in Use**: Change `PORT` in `.env` file

### Logs

Check console output for detailed error messages and debugging information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please check the documentation or create an issue in the repository.