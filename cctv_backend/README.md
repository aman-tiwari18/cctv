# CCTV Exam Monitoring Backend

A comprehensive backend system for automated CCTV exam monitoring with schedule management, Excel-based data import, and automated script execution.

## Features

- 📊 **Exam Management** - Manage multiple exam bodies (TCS, SSC, etc.)
- 📹 **Camera Link Management** - Support for RTSP and HLS streams
- 📅 **Schedule Management** - Automated shift scheduling
- 📈 **Analytics Tasks** - Configurable monitoring tasks
- 📤 **Excel Import** - Bulk import via Excel files
- 🔐 **Authentication** - JWT-based authentication with role-based access
- ⚙️ **Auto Scheduling** - Replaces manual systemd scheduling
- 🖥️ **Distributed Architecture** - Separate servers for backend and script execution

## Architecture

```
┌─────────────────────────────────────┐
│   Main Backend (domain/dev)         │
│  - Express API Server                │
│  - MySQL Database                    │
│  - Scheduler Service                 │
│  - Excel Parser                      │
└──────────────┬──────────────────────┘
               │ HTTP Polling
               │
┌──────────────▼──────────────────────┐
│  Script Server (domain/dev1)        │
│  - Poller Service                    │
│  - Script Runner                     │
│  - Monitoring Scripts (user's)       │
└─────────────────────────────────────┘
```

## Prerequisites

- Node.js >= 16.x
- MySQL >= 8.0
- Python (for monitoring scripts)

## Installation

### Main Backend Setup

1. **Clone and navigate to project**
   ```bash
   cd c:\Users\aman\Desktop\cctv_backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update:
   - Database credentials
   - JWT secret
   - Script server URL

4. **Create database and run migrations**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE cctv_monitoring;"
   
   # Run migrations
   npm run migrate
   ```

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

### Script Server Setup

1. **Navigate to script server directory**
   ```bash
   cd script-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update:
   - Main backend URL
   - JWT token (get from login)
   - Scripts directory path

4. **Place your monitoring scripts**
   ```bash
   # Copy your existing monitoring scripts to:
   ./scripts/
   ```

5. **Start the script server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Usage

### 1. Login and Get Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Default credentials:**
- Username: `admin`
- Password: `admin123` (⚠️ Change immediately!)

### 2. Create an Exam

```bash
curl -X POST http://localhost:3000/api/exams \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exam_name": "SSC CGL 2026",
    "exam_body": "SSC",
    "link_type": "RTSP",
    "description": "Staff Selection Commission Combined Graduate Level"
  }'
```

### 3. Upload Camera Links (Excel)

```bash
curl -X POST http://localhost:3000/api/exams/1/cameras/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@camera_links.xlsx"
```

**Excel Format:**
| camera_id | stream_url | location |
|-----------|------------|----------|
| CAM001 | rtsp://... | Room 101 |

### 4. Upload Exam Schedule (Excel)

```bash
curl -X POST http://localhost:3000/api/exams/1/schedules/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@exam_schedule.xlsx"
```

**Excel Format:**
| Date | 09:00:00 to 10:30:00 | 13:00:00 to 14:30:00 |
|------|----------------------|----------------------|
| 2026-02-15 | Yes | Yes |

### 5. Upload Analytics Tasks (Excel)

```bash
curl -X POST http://localhost:3000/api/exams/1/analytics/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@analytics_tasks.xlsx"
```

**Excel Format:**
| task_name | script_path | frequency_minutes | start_time | end_time |
|-----------|-------------|-------------------|------------|----------|
| Intrusion Detection | intrusion_detect.py | 2 | 09:00:00 | 18:00:00 |

## API Endpoints

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

## Project Structure

```
cctv_backend/
├── src/
│   ├── config/
│   │   └── database.js          # MySQL connection
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication
│   │   ├── upload.js            # File upload handling
│   │   └── errorHandler.js     # Error handling
│   ├── models/
│   │   ├── Exam.js              # Exam model
│   │   ├── CameraLink.js        # Camera link model
│   │   ├── ExamSchedule.js      # Schedule model
│   │   ├── AnalyticsTask.js     # Analytics task model
│   │   └── ScriptExecution.js   # Execution tracking model
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── exams.js             # Exam routes
│   │   ├── cameraLinks.js       # Camera routes
│   │   ├── schedules.js         # Schedule routes
│   │   ├── analytics.js         # Analytics routes
│   │   └── executions.js        # Execution routes
│   ├── services/
│   │   ├── excelParser.js       # Excel parsing service
│   │   └── scheduler.js         # Auto scheduling service
│   ├── utils/
│   │   ├── logger.js            # Winston logger
│   │   └── validators.js        # Input validation
│   ├── migrations/
│   │   ├── 001_create_tables.sql
│   │   └── run.js
│   ├── app.js                   # Express app
│   └── server.js                # Server entry point
├── script-server/
│   └── src/
│       ├── poller.js            # Polls main backend
│       ├── scriptRunner.js      # Executes scripts
│       ├── logger.js            # Logger
│       └── server.js            # Entry point
└── package.json
```

## How It Works

1. **Admin uploads exam schedule** via Excel or manual entry
2. **Scheduler service** (runs every minute) checks for upcoming shifts
3. **Execution records** are created 5 minutes before shift starts
4. **Script server** polls for pending executions every 30 seconds
5. **Scripts are executed** with camera URLs and parameters
6. **Results are reported** back to main backend
7. **Status tracking** allows monitoring of all executions

## Environment Variables

### Main Backend (.env)

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cctv_monitoring
JWT_SECRET=your_secret_key
SCRIPT_SERVER_URL=http://domain/dev1
```

### Script Server (.env)

```env
MAIN_BACKEND_URL=http://domain/dev
JWT_TOKEN=your_jwt_token
POLL_INTERVAL_MS=30000
SCRIPTS_DIR=./scripts
```

## Security Notes

- Change default admin password immediately
- Use strong JWT secret in production
- Enable HTTPS in production
- Restrict database access
- Validate all Excel uploads

## Troubleshooting

**Database connection fails:**
- Check MySQL is running
- Verify credentials in `.env`
- Ensure database exists

**Scripts not executing:**
- Check script server is running
- Verify JWT token is valid
- Check scripts directory path
- Ensure Python is installed

**Excel upload fails:**
- Verify column names match expected format
- Check file size limits
- Ensure file is valid Excel format

## License

ISC
