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
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import { EmailOutlined } from '@mui/icons-material';
import { authAPI } from '../services/api';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Email, 2: OTP + Password
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await authAPI.forgotPassword({ email });
      setSuccess('OTP sent to your email');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    }

    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      await authAPI.resetPassword({
        email,
        otp,
        newPassword,
      });

      setSuccess('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    }

    setLoading(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef2fb',
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 5 },
          width: '100%',
          maxWidth: 450,
          borderRadius: 4,
          bgcolor: '#ffffff',
        }}
      >
        <Typography
          variant="h5"
          align="center"
          sx={{
            mb: 1,
            fontWeight: 800,
            color: '#111827',
            letterSpacing: '-0.5px',
          }}
        >
          Forgot Password
        </Typography>

        <Typography
          align="center"
          sx={{
            mb: 4,
            fontSize: 13,
            color: '#6b7280',
            fontWeight: 500,
          }}
        >
          {step === 1 ? 'Enter your email to receive OTP' : 'Enter OTP and new password'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            {success}
          </Alert>
        )}

        {/* Step 1: Email */}
        {step === 1 && (
          <form onSubmit={handleSendOTP}>
            <Box mb={4}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Email
              </Typography>
              <TextField
                fullWidth
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlined sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    input: { py: 1.5, px: 0, fontSize: 14, color: '#374151' }
                  }
                }}
              />
            </Box>

            <Button
              fullWidth
              type="submit"
              disabled={loading}
              sx={{
                py: 1.5,
                mb: 3,
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
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Send OTP'}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Link
                component={RouterLink}
                to="/login"
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
                Back to Login
              </Link>
            </Box>
          </form>
        )}

        {/* Step 2: OTP + New Password */}
        {step === 2 && (
          <form onSubmit={handleResetPassword}>
            <Box mb={3}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                OTP
              </Typography>
              <TextField
                fullWidth
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                autoFocus
                inputProps={{ maxLength: 6 }}
                InputProps={{
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    input: { py: 1.5, px: 2, fontSize: 14, color: '#374151' }
                  }
                }}
              />
            </Box>

            <Box mb={3}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                New Password
              </Typography>
              <TextField
                fullWidth
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                InputProps={{
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    input: { py: 1.5, px: 2, fontSize: 14, color: '#374151' }
                  }
                }}
              />
              <Typography sx={{ fontSize: 11, color: '#6b7280', mt: 0.5, px: 0.5 }}>
                Minimum 6 characters
              </Typography>
            </Box>

            <Box mb={4}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Confirm Password
              </Typography>
              <TextField
                fullWidth
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                InputProps={{
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    input: { py: 1.5, px: 2, fontSize: 14, color: '#374151' }
                  }
                }}
              />
            </Box>

            <Button
              fullWidth
              type="submit"
              disabled={loading}
              sx={{
                py: 1.5,
                mb: 3,
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
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Reset Password'}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Link
                component={RouterLink}
                to="/login"
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
                Back to Login
              </Link>
            </Box>
          </form>
        )}
      </Paper>
    </Box>
  );
};

export default ForgotPassword;
