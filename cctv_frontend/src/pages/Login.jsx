import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  Link,
  Divider,
} from '@mui/material';
import {
  VisibilityOutlined,
  VisibilityOffOutlined,
  PersonOutline,
  LockOutlined,
  Security,
  InfoOutlined
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef2fb', // Soft light blue-grey matching screenshot
        px: 2
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Floating Shield Logo */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 3,
            mb: 3,
            display: 'inline-flex',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
          }}
        >
          <Security sx={{ fontSize: 28, color: '#3b82f6' }} />
        </Paper>

        {/* Main Card */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, sm: 5 },
            width: '100%',
            borderRadius: 4,
            boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
            bgcolor: '#ffffff'
          }}
        >
          <Box textAlign="center" mb={4}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827', mb: 1, letterSpacing: '-0.5px' }}>
              CCTV Monitoring System
            </Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', fontWeight: 500 }}>
              Exam Monitoring & Management Platform
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Box mb={3}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Username
              </Typography>
              <TextField
                fullWidth
                name="username"
                placeholder="Enter your username"
                value={formData.username}
                onChange={handleChange}
                required
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutline sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    '&:hover fieldset': { border: 'none' },
                    '&.Mui-focused fieldset': { border: 'none' }, // clean look when focused
                    input: { py: 1.5, px: 0, fontSize: 14, color: '#374151' }
                  }
                }}
              />
            </Box>

            <Box mb={4}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1} px={0.5}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Password
                </Typography>
                {/* <Link component="button" type="button" sx={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>
                  Forgot?
                </Link> */}
              </Box>
              <TextField
                fullWidth
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlined sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: '#9ca3af', mr: 0.5 }}
                      >
                        {showPassword ? <VisibilityOffOutlined sx={{ fontSize: 20 }} /> : <VisibilityOutlined sx={{ fontSize: 20 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    '&:hover fieldset': { border: 'none' },
                    '&.Mui-focused fieldset': { border: 'none' },
                    input: { py: 1.5, px: 0, fontSize: 14, color: '#374151', letterSpacing: formData.password ? 2 : 'inherit' }
                  }
                }}
              />
            </Box>

            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                py: 1.5,
                borderRadius: '12px',
                bgcolor: '#3b82f6',
                color: 'white',
                fontWeight: 600,
                fontSize: 15,
                textTransform: 'none',
                boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)',
                '&:hover': {
                  bgcolor: '#2563eb',
                  boxShadow: '0 6px 20px rgba(59,130,246, 0.4)'
                }
              }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>

          {/* <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} /> */}

          {/* <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                bgcolor: '#f8fafc',
                border: '1px solid #f1f5f9',
                px: 2,
                py: 0.75,
                borderRadius: '20px'
              }}
            >
              <InfoOutlined sx={{ fontSize: 16, color: '#3b82f6' }} />
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>
                Default credentials: <Box component="span" sx={{ color: '#1e293b', fontWeight: 600 }}>admin / admin123</Box>
              </Typography>
            </Box>
          </Box> */}
        </Paper>

        {/* Footer Links & Copyright */}
        {/* <Box sx={{ mt: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <Box sx={{ display: 'flex', gap: 3, mb: 6 }}>
            <Link component="button" sx={{ fontSize: 13, fontWeight: 600, color: '#64748b', textDecoration: 'none', '&:hover': { color: '#3b82f6' } }}>
              Privacy Policy
            </Link>
            <Typography sx={{ color: '#cbd5e1', fontSize: 13 }}>•</Typography>
            <Link component="button" sx={{ fontSize: 13, fontWeight: 600, color: '#64748b', textDecoration: 'none', '&:hover': { color: '#3b82f6' } }}>
              System Status
            </Link>
            <Typography sx={{ color: '#cbd5e1', fontSize: 13 }}>•</Typography>
            <Link component="button" sx={{ fontSize: 13, fontWeight: 600, color: '#64748b', textDecoration: 'none', '&:hover': { color: '#3b82f6' } }}>
              Help Center
            </Link>
          </Box>

          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            © {new Date().getFullYear()} CCTV MONITORING SUITE. SECURE EDITORIAL ACCESS.
          </Typography>
        </Box> */}

      </Box>
    </Box>
  );
};

export default Login;
