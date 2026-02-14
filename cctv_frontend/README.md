# CCTV Frontend

React frontend application for the CCTV Exam Monitoring System.

## Features

- 🔐 **Authentication** - JWT-based login with role-based access
- 📊 **Dashboard** - Real-time statistics and charts
- 🎓 **Exam Management** - Create and manage exams
- 📹 **Camera Management** - Manage camera links with Excel upload
- 📅 **Schedule Management** - Manage exam schedules with Excel upload
- 📈 **Analytics Tasks** - Configure monitoring scripts with Excel upload
- ▶️ **Execution Monitoring** - Track script execution status and results
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **Material-UI (MUI)** - Component library
- **React Router** - Routing
- **Axios** - HTTP client
- **Recharts** - Charts and graphs
- **date-fns** - Date formatting

## Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   
   The `.env` file is already configured to connect to `http://localhost:3000/api`
   
   If your backend is running on a different URL, update `.env`:
   ```
   VITE_API_BASE_URL=http://your-backend-url/api
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5173`

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` folder.

## Project Structure

```
src/
├── components/
│   ├── Layout.jsx           # Main layout with sidebar
│   └── ProtectedRoute.jsx   # Route protection
├── contexts/
│   └── AuthContext.jsx      # Authentication context
├── pages/
│   ├── Login.jsx            # Login page
│   ├── Dashboard.jsx        # Dashboard with stats
│   ├── Exams.jsx            # Exam management
│   ├── Cameras.jsx          # Camera management
│   ├── Schedules.jsx        # Schedule management
│   ├── Analytics.jsx        # Analytics tasks
│   └── Executions.jsx       # Execution monitoring
├── services/
│   └── api.js               # API service layer
├── App.jsx                  # Main app component
└── main.jsx                 # Entry point
```

## Usage

### Login

Default credentials:
- Username: `admin`
- Password: `admin123`

### Managing Exams

1. Navigate to **Exams** page
2. Click **Add Exam** button
3. Fill in exam details (name, body, link type)
4. Click **Create**

### Uploading Camera Links

1. Navigate to **Cameras** page
2. Select an exam from dropdown
3. Click **Upload Excel** button
4. Choose Excel file with columns: `camera_id`, `stream_url`, `location`
5. Click **Upload**

### Uploading Schedules

1. Navigate to **Schedules** page
2. Select an exam from dropdown
3. Click **Upload Excel** button
4. Choose Excel file with Date column and shift time range columns
5. Click **Upload**

### Uploading Analytics Tasks

1. Navigate to **Analytics Tasks** page
2. Select an exam from dropdown
3. Click **Upload Excel** button
4. Choose Excel file with columns: `task_name`, `script_path`, `frequency_minutes`, etc.
5. Click **Upload**

### Monitoring Executions

1. Navigate to **Executions** page
2. Use filters to find specific executions
3. Click eye icon to view execution details
4. View results, error logs, and execution times

## API Integration

The frontend automatically connects to the backend API. All API calls include JWT authentication tokens.

API endpoints are configured in `src/services/api.js`:
- Authentication
- Exams CRUD
- Cameras CRUD + Excel upload
- Schedules CRUD + Excel upload
- Analytics CRUD + Excel upload
- Executions monitoring

## Development

### Adding New Pages

1. Create page component in `src/pages/`
2. Add route in `src/App.jsx`
3. Add menu item in `src/components/Layout.jsx`

### Customizing Theme

Edit the theme in `src/App.jsx`:

```javascript
const theme = createTheme({
  palette: {
    primary: {
      main: '#667eea',
    },
    // ... more theme options
  },
});
```

## Troubleshooting

**API connection fails:**
- Ensure backend is running on `http://localhost:3000`
- Check `.env` file for correct API URL
- Check browser console for errors

**Login fails:**
- Verify backend is running
- Check credentials
- Clear browser localStorage and try again

**Excel upload fails:**
- Verify Excel file format matches expected columns
- Check file size (default limit: 5MB)
- Check backend logs for errors

## License

ISC
