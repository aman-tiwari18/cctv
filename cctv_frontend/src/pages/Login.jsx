import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { PersonOutline, LockOutlined, VisibilityOutlined, VisibilityOffOutlined, Security } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import CameraIcon from '../components/CameraIcon';

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
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef2fb',
        px: 2
      }}
    >
      {/* Shield Icon */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          borderRadius: 3,
          mb: 3,
          display: 'inline-flex',
          bgcolor: 'white',
        }}
      >
        <CameraIcon sx={{ fontSize: 28, color: '#3b82f6' }} />
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 5,
          width: '100%',
          maxWidth: 450,
          borderRadius: 4,
          bgcolor: '#ffffff',
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
                  '&.Mui-focused fieldset': { border: 'none' },
                  input: { py: 1.5, px: 0, fontSize: 14, color: '#374151' }
                }
              }}
            />
          </Box>

          <Box mb={4}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
              Password
            </Typography>
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
              boxShadow: 'none',
              '&:hover': {
                bgcolor: '#2563eb',
                boxShadow: 'none',
              },
              '&:disabled': {
                bgcolor: '#93c5fd',
              },
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 2,
            flexWrap: 'wrap',
            mt: 3,
          }}
        >
          <Link
            component={RouterLink}
            to="/forgot-password"
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: '#64748b',
              textDecoration: 'none',
              '&:hover': {
                color: '#3b82f6',
              },
            }}
          >
            Forgot Password?
          </Link>
          <Link
            component={RouterLink}
            to="/register"
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: '#64748b',
              textDecoration: 'none',
              '&:hover': {
                color: '#3b82f6',
              },
            }}
          >
            Register New User
          </Link>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
