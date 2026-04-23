import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Typography,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Search,
  CheckCircle,
  Cancel,
  Person,
  Email,
  Phone,
  Business,
  CalendarToday,
} from '@mui/icons-material';
import { authAPI } from '../services/api';

const UserVerification = () => {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [verifyDialog, setVerifyDialog] = useState({ open: false, user: null });
  const [selectedRole, setSelectedRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });

  console.log('UserVerification component mounted');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        verified: tabValue === 0 ? 'false' : 'true',
        search: searchTerm || undefined,
      };
      console.log('Fetching users with params:', params);
      const response = await authAPI.getAllUsers(params);
      console.log('Users fetched:', response.data);
      setUsers(response.data.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      showAlert('Failed to fetch users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [tabValue, searchTerm]);

  const showAlert = (message, severity = 'success') => {
    setAlert({ show: true, message, severity });
    setTimeout(() => setAlert({ show: false, message: '', severity: 'success' }), 5000);
  };

  const handleVerifyUser = async () => {
    if (!verifyDialog.user || !selectedRole) return;

    try {
      setSubmitting(true);
      await authAPI.verifyUser(verifyDialog.user.id, {
        verified: true,
        role: selectedRole,
      });
      
      showAlert(`User ${verifyDialog.user.full_name || verifyDialog.user.email} verified successfully`);
      setVerifyDialog({ open: false, user: null });
      setSelectedRole('');
      fetchUsers();
    } catch (error) {
      console.error('Error verifying user:', error);
      showAlert('Failed to verify user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnverifyUser = async (user) => {
    try {
      await authAPI.verifyUser(user.id, { verified: false });
      showAlert(`User ${user.full_name || user.email} unverified successfully`);
      fetchUsers();
    } catch (error) {
      console.error('Error unverifying user:', error);
      showAlert('Failed to unverify user', 'error');
    }
  };

  const openVerifyDialog = (user) => {
    setVerifyDialog({ open: true, user });
    setSelectedRole(user.role || 'VIEWER');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'ADMIN': return '#ef4444';
      case 'OPERATOR': return '#f59e0b';
      case 'VIEWER': return '#10b981';
      default: return '#6b7280';
    }
  };

  const filteredUsers = users.filter(user => 
    (user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     user.company_name?.toLowerCase().includes(searchTerm.toLowerCase())) ?? false
  );

  return (
    <Box sx={{ p: 3 }}>
      {alert.show && (
        <Alert 
          severity={alert.severity} 
          sx={{ mb: 3 }}
          onClose={() => setAlert({ show: false, message: '', severity: 'success' })}
        >
          {alert.message}
        </Alert>
      )}

      <Paper 
        elevation={0} 
        sx={{ 
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
          <Tabs 
            value={tabValue} 
            onChange={(e, newValue) => setTabValue(newValue)}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#64748b',
                '&.Mui-selected': {
                  color: '#3b82f6',
                },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#3b82f6',
              },
            }}
          >
            <Tab label="Pending Verification" />
            <Tab label="Verified Users" />
          </Tabs>
        </Box>

        <Box sx={{ p: 3 }}>
          <TextField
            fullWidth
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: '#94a3b8', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              mb: 3,
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#f8fafc',
                borderRadius: 2,
                '& fieldset': {
                  borderColor: '#e2e8f0',
                },
                '&:hover fieldset': {
                  borderColor: '#cbd5e1',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#3b82f6',
                },
              },
            }}
          />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={40} sx={{ color: '#3b82f6' }} />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Contact</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Company</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Registered</TableCell>
                    {tabValue === 1 && (
                      <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Verified</TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tabValue === 1 ? 7 : 6} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          {searchTerm ? 'No users found matching your search' : `No ${tabValue === 0 ? 'pending' : 'verified'} users found`}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person sx={{ color: '#94a3b8', fontSize: 20 }} />
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {user.full_name || 'N/A'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {user.username}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                              <Email sx={{ color: '#94a3b8', fontSize: 16 }} />
                              <Typography variant="body2">{user.email}</Typography>
                            </Box>
                            {user.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Phone sx={{ color: '#94a3b8', fontSize: 16 }} />
                                <Typography variant="body2">{user.phone}</Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Business sx={{ color: '#94a3b8', fontSize: 16 }} />
                            <Typography variant="body2">
                              {user.company_name || 'N/A'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={user.role}
                            size="small"
                            sx={{
                              backgroundColor: `${getRoleColor(user.role)}15`,
                              color: getRoleColor(user.role),
                              fontWeight: 600,
                              fontSize: '0.75rem',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarToday sx={{ color: '#94a3b8', fontSize: 16 }} />
                            <Typography variant="body2">
                              {formatDate(user.created_at)}
                            </Typography>
                          </Box>
                        </TableCell>
                        {tabValue === 1 && (
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <CalendarToday sx={{ color: '#94a3b8', fontSize: 16 }} />
                              <Typography variant="body2">
                                {formatDate(user.verified_date)}
                              </Typography>
                            </Box>
                          </TableCell>
                        )}
                        <TableCell>
                          {tabValue === 0 ? (
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<CheckCircle />}
                              onClick={() => openVerifyDialog(user)}
                              sx={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5,
                                px: 2,
                                '&:hover': {
                                  backgroundColor: '#2563eb',
                                },
                              }}
                            >
                              Verify
                            </Button>
                          ) : (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Cancel />}
                              onClick={() => handleUnverifyUser(user)}
                              sx={{
                                borderColor: '#ef4444',
                                color: '#ef4444',
                                textTransform: 'none',
                                fontWeight: 600,
                                borderRadius: 1.5,
                                px: 2,
                                '&:hover': {
                                  borderColor: '#dc2626',
                                  backgroundColor: '#fef2f2',
                                },
                              }}
                            >
                              Unverify
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Paper>

      {/* Verify User Dialog */}
      <Dialog 
        open={verifyDialog.open} 
        onClose={() => setVerifyDialog({ open: false, user: null })}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            bgcolor: '#ffffff',
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            Verify User
          </Typography>
        </DialogTitle>
        <DialogContent>
          {verifyDialog.user && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Verify <strong>{verifyDialog.user.full_name || verifyDialog.user.email}</strong> and assign a role:
              </Typography>
              
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  label="Role"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                    },
                  }}
                >
                  <MenuItem value="VIEWER">VIEWER</MenuItem>
                  <MenuItem value="OPERATOR">OPERATOR</MenuItem>
                  <MenuItem value="ADMIN">ADMIN</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button
            onClick={() => setVerifyDialog({ open: false, user: null })}
            sx={{
              color: '#64748b',
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerifyUser}
            disabled={!selectedRole || submitting}
            variant="contained"
            sx={{
              backgroundColor: '#3b82f6',
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
              '&:hover': {
                backgroundColor: '#2563eb',
              },
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Verify User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserVerification;