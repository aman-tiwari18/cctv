import React, { useState, useEffect } from 'react';
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
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import { CheckCircle, PersonOutline, EmailOutlined, PhoneOutlined, BusinessOutlined } from '@mui/icons-material';
import { authAPI } from '../services/api';

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Details + OTP, 2: Set Password
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });
  const [otpData, setOtpData] = useState({
    emailOtp: '000000',
  });
  const [verification, setVerification] = useState({
    emailVerified: false,
    emailSent: false,
  });
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  // Fetch available companies on component mount
  useEffect(() => {
    fetchAvailableCompanies();
  }, []);

  const fetchAvailableCompanies = async () => {
    try {
      setLoadingCompanies(true);
      const response = await authAPI.getAvailableCompanies();
      setAvailableCompanies(response.data.data || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
      setError('Failed to load available companies');
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleOtpChange = (e) => {
    setOtpData({
      ...otpData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  // Send OTP
  const handleSendOTP = async (type) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const identifier = type === 'email' ? formData.email : formData.phone;
      await authAPI.sendRegistrationOTP({ identifier, type });
      
      setVerification({
        ...verification,
        [`${type}Sent`]: true,
      });
      setSuccess(`OTP sent to your ${type}`);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to send OTP to ${type}`);
    }

    setLoading(false);
  };

  // Verify OTP
  const handleVerifyOTP = async (type) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const identifier = type === 'email' ? formData.email : formData.phone;
      const otp = otpData.emailOtp;

      if (!otp || otp.length !== 6) {
        setError('Please enter a valid 6-digit OTP');
        setLoading(false);
        return;
      }

      await authAPI.verifyRegistrationOTP({ identifier, otp, type });
      
      setVerification({
        ...verification,
        [`${type}Verified`]: true,
      });
      setSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully!`);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    }

    setLoading(false);
  };

  // Continue to password setup
  const handleContinueToPassword = async () => {
    if (!verification.emailVerified) {
      setError('Please verify your email before continuing');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create account with the actual password from step 2
      // We'll set it in step 2, so just move to step 2
      setStep(2);
      setSuccess('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to proceed');
    }

    setLoading(false);
  };

  // Set password
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      // Create account with the actual password
      await authAPI.signup({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        companyName: formData.companyName,
        password: formData.password, // Use actual password
      });

      setSuccess('Registration complete! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete registration');
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
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 5 },
          width: '100%',
          maxWidth: 500,
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
          Register New User
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
          {step === 1 && 'Enter your details and verify'}
          {step === 2 && 'Set your password'}
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

        {/* Step 1: User Details + OTP Verification */}
        {step === 1 && (
          <Box>
            <Box mb={2.5}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Full Name *
              </Typography>
              <TextField
                fullWidth
                name="name"
                placeholder="Enter your full name"
                value={formData.name}
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
                    input: { py: 1.5, px: 0, fontSize: 14, color: '#374151' }
                  }
                }}
              />
            </Box>

            <Box mb={2.5}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Email *
              </Typography>
              <TextField
                fullWidth
                name="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={verification.emailSent}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlined sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
                    </InputAdornment>
                  ),
                  endAdornment: verification.emailVerified ? (
                    <InputAdornment position="end">
                      <CheckCircle sx={{ color: '#10b981', fontSize: 20, mr: 0.5 }} />
                    </InputAdornment>
                  ) : null,
                  sx: {
                    bgcolor: '#f4f6f8',
                    borderRadius: '10px',
                    '& fieldset': { border: 'none' },
                    input: { py: 1.5, px: 0, fontSize: 14, color: '#374151' }
                  }
                }}
              />
              {!verification.emailVerified && (
                <Box mt={1}>
                  {!verification.emailSent ? (
                    <Button
                      size="small"
                      onClick={() => handleSendOTP('email')}
                      disabled={loading || !formData.email}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#3b82f6',
                      }}
                    >
                      Send OTP
                    </Button>
                  ) : (
                    <Box display="flex" gap={1} alignItems="center">
                      <TextField
                        size="small"
                        name="emailOtp"
                        placeholder="Enter OTP"
                        value={otpData.emailOtp}
                        onChange={handleOtpChange}
                        inputProps={{ maxLength: 6 }}
                        sx={{
                          flex: 1,
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'white',
                            '& fieldset': { borderColor: '#e5e7eb' },
                          }
                        }}
                      />
                      <Button
                        size="small"
                        onClick={() => handleVerifyOTP('email')}
                        disabled={loading || !otpData.emailOtp}
                        sx={{
                          textTransform: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#3b82f6',
                        }}
                      >
                        Verify
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <Box mb={2.5}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Phone
              </Typography>
              <TextField
                fullWidth
                name="phone"
                placeholder="Enter your phone number (optional)"
                value={formData.phone}
                onChange={handleChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneOutlined sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
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

            <Box mb={4}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                Company Name *
              </Typography>
              {loadingCompanies ? (
                <Box display="flex" alignItems="center" justifyContent="center" py={2}>
                  <CircularProgress size={20} />
                  <Typography sx={{ ml: 1, fontSize: 13, color: '#6b7280' }}>
                    Loading companies...
                  </Typography>
                </Box>
              ) : availableCompanies.length === 0 ? (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  No companies available. Please contact administrator.
                </Alert>
              ) : (
                <FormControl fullWidth>
                  <Select
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    displayEmpty
                    required
                    startAdornment={
                      <InputAdornment position="start">
                        <BusinessOutlined sx={{ color: '#9ca3af', fontSize: 20, ml: 0.5 }} />
                      </InputAdornment>
                    }
                    sx={{
                      bgcolor: '#f4f6f8',
                      borderRadius: '10px',
                      '& fieldset': { border: 'none' },
                      '& .MuiSelect-select': { py: 1.5, px: 0, fontSize: 14, color: '#374151' },
                    }}
                  >
                    <MenuItem value="" disabled>
                      <Typography sx={{ color: '#9ca3af', fontSize: 14 }}>
                        Select your company
                      </Typography>
                    </MenuItem>
                    {availableCompanies.map((company) => (
                      <MenuItem key={company} value={company}>
                        {company}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            <Button
              fullWidth
              onClick={handleContinueToPassword}
              disabled={!verification.emailVerified || !formData.companyName || loading}
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
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Continue'}
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
                Already have an account? Login
              </Link>
            </Box>
          </Box>
        )}

        {/* Step 2: Set Password */}
        {step === 2 && (
          <form onSubmit={handleSetPassword}>
            <Box mb={3}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', mb: 1, px: 0.5 }}>
                New Password *
              </Typography>
              <TextField
                fullWidth
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                autoFocus
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
                Confirm Password *
              </Typography>
              <TextField
                fullWidth
                name="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange}
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
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Complete Registration'}
            </Button>
          </form>
        )}
      </Paper>
    </Box>
  );
};

export default Register;
