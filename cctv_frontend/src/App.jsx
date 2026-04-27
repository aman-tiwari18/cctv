import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DetectionCountsProvider } from './contexts/DetectionCountsContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import Cameras from './pages/Cameras';
import Shifts from './pages/Shifts';
import Analytics from './pages/Analytics';
import Executions from './pages/Executions';
import Detections from './pages/Detections';
import ClientDetections from './pages/ClientDetections';
import ClientDetectionDashboard from './pages/ClientDetectionDashboard';
import ClientExams from './pages/ClientExams';
import ClientCameras from './pages/ClientCameras';
import UserVerification from './pages/UserVerification';

// Role-based route wrapper
const RoleBasedRoute = ({ AdminComp, ViewerComp, OperatorComp }) => {
  const { user } = useAuth();
  if (user?.role === 'OPERATOR') {
    return OperatorComp ? <OperatorComp /> : <Navigate to="/detections" replace />;
  }
  if (user?.role === 'VIEWER') {
    return ViewerComp ? <ViewerComp /> : <Navigate to="/" replace />;
  }
  return <AdminComp />;
};

// Create Material-UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#3c81f6',
      light: '#dbeafe',
      dark: '#1e40af',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#64748b',
      light: '#e2e8f0',
      dark: '#475569',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f7fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
    },
    buttonrtsp: {
      bg: '#a4b5fe',
      text: '#384b91'
    },
    divider: 'rgba(71, 85, 105, 0.2)',
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#f4f7fb',
          color: '#0f172a',
        },
        'input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator': {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        },
        'input[type="date"]::-moz-calendar-picker-indicator': {
          display: 'none',
        },
        'input[type="time"]::-moz-time-picker-indicator': {
          display: 'none',
        },
        'input[type="date"]': {
          position: 'relative',
          cursor: 'pointer',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'18\' height=\'18\'%3E%3Cpath fill=\'%2364748b\' d=\'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2zM19 20H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          backgroundSize: '18px 18px',
        },
        'input[type="time"]': {
          position: 'relative',
          cursor: 'pointer',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'18\' height=\'18\'%3E%3Cpath fill=\'%2364748b\' d=\'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          backgroundSize: '18px 18px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#ffffff',
          border: '1px solid rgba(71, 85, 105, 0.14)',
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(71, 85, 105, 0.18)',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <DetectionCountsProvider>
          <SocketProvider>
            {/* <BrowserRouter> */}
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<RoleBasedRoute AdminComp={Dashboard} ViewerComp={ClientDetectionDashboard} />} />
                <Route path="exams" element={<RoleBasedRoute AdminComp={Exams} ViewerComp={ClientExams} />} />
                <Route path="cameras" element={<RoleBasedRoute AdminComp={Cameras} ViewerComp={ClientCameras} />} />
                <Route path="shifts" element={<RoleBasedRoute AdminComp={Shifts} />} />
                <Route path="analytics" element={<RoleBasedRoute AdminComp={Analytics} />} />
                <Route path="executions" element={<RoleBasedRoute AdminComp={Executions} />} />
                <Route path="detections" element={<RoleBasedRoute AdminComp={Detections} ViewerComp={ClientDetections} OperatorComp={Detections} />} />
                <Route path="user-verification" element={<UserVerification />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {/* </BrowserRouter> */}
          </SocketProvider>
        </DetectionCountsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
