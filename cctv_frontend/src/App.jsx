import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import Cameras from './pages/Cameras';
import Shifts from './pages/Shifts';
import Analytics from './pages/Analytics';
import Executions from './pages/Executions';
import Detections from './pages/Detections';
import ClientDetections from './pages/ClientDetections';

// Create Material-UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#2563eb',
      light: '#dbeafe',
      dark: '#1d4ed8',
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
        {/* <BrowserRouter> */}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="exams" element={<Exams />} />
            <Route path="cameras" element={<Cameras />} />
            <Route path="shifts" element={<Shifts />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="executions" element={<Executions />} />
            <Route path="detections" element={<Detections />} />
            <Route path="client-detections" element={<ClientDetections />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {/* </BrowserRouter> */}
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
