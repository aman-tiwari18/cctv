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
  TableSortLabel,
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
  const [assignGpuDialog, setAssignGpuDialog] = useState({ open: false, user: null });
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedGpuId, setSelectedGpuId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });
  // Verified-users table sorting (by assigned gpu_id). orderBy '' = no sort.
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('');

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
      
      showAlert(`User ${verifyDialog.user.full_name || verifyDialog.user.email} updated successfully`);
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

  const openAssignGpuDialog = (user) => {
    setAssignGpuDialog({ open: true, user });
    setSelectedGpuId(user.gpu_id !== null && user.gpu_id !== undefined ? String(user.gpu_id) : '');
  };

  const handleAssignGpu = async () => {
    if (!assignGpuDialog.user) return;
    try {
      setSubmitting(true);
      await authAPI.assignGpu(assignGpuDialog.user.id, {
        gpu_id: selectedGpuId === '' ? null : parseInt(selectedGpuId, 10),
      });
      showAlert(`GPU assigned to ${assignGpuDialog.user.full_name || assignGpuDialog.user.email} successfully`);
      setAssignGpuDialog({ open: false, user: null });
      setSelectedGpuId('');
      fetchUsers();
    } catch (error) {
      console.error('Error assigning GPU:', error);
      showAlert('Failed to assign GPU', 'error');
    } finally {
      setSubmitting(false);
    }
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

  // An account can belong to several companies; `companies` comes from
  // user_companies and falls back to the single legacy column.
  const companiesOf = (user) => (
    user.companies?.length
      ? user.companies
      : (user.company_name ? [{ company_name: user.company_name, verified: user.verified }] : [])
  );

  const filteredUsers = users.filter(user => {
    const q = searchTerm.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      companiesOf(user).some((c) => c.company_name?.toLowerCase().includes(q))
    ) ?? false;
  });

  const handleRequestSort = () => {
    const isAsc = orderBy === 'gpu_id' && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy('gpu_id');
  };

  // Sort the table by the assigned gpu_id when active. Unassigned (null/undefined)
  // operators always sink to the bottom regardless of asc/desc direction.
  const displayedUsers = React.useMemo(() => {
    if (orderBy !== 'gpu_id') return filteredUsers;
    const val = (u) => (u.gpu_id === null || u.gpu_id === undefined ? null : Number(u.gpu_id));
    return [...filteredUsers].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return order === 'asc' ? av - bv : bv - av;
    });
  }, [filteredUsers, orderBy, order]);

  return (
    <Box sx={{ p: { xs: 0, sm: 3 } }}>
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

        <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
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
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 720 }}>
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
                    {tabValue === 1 && (
                      <TableCell sx={{ fontWeight: 600, color: '#374151' }} sortDirection={orderBy === 'gpu_id' ? order : false}>
                        <TableSortLabel
                          active={orderBy === 'gpu_id'}
                          direction={orderBy === 'gpu_id' ? order : 'asc'}
                          onClick={handleRequestSort}
                        >
                          GPU
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tabValue === 1 ? 8 : 6} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          {searchTerm ? 'No users found matching your search' : `No ${tabValue === 0 ? 'pending' : 'verified'} users found`}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedUsers.map((user) => (
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                            <Business sx={{ color: '#94a3b8', fontSize: 16 }} />
                            {companiesOf(user).length === 0 ? (
                              <Typography variant="body2">N/A</Typography>
                            ) : (
                              companiesOf(user).map((c) => (
                                <Chip
                                  key={c.company_name}
                                  label={c.verified ? c.company_name : `${c.company_name} (pending)`}
                                  size="small"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    backgroundColor: c.verified ? '#eef2ff' : '#fef3c7',
                                    color: c.verified ? '#4338ca' : '#b45309',
                                  }}
                                />
                              ))
                            )}
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
                        {tabValue === 1 && (
                          <TableCell>
                            {user.gpu_id !== null && user.gpu_id !== undefined ? (
                              <Chip
                                label={`GPU ${user.gpu_id}`}
                                size="small"
                                sx={{ backgroundColor: '#fff7ed', color: '#b45309', fontWeight: 600, fontSize: '0.75rem' }}
                              />
                            ) : (
                              <Typography variant="body2" color="text.secondary">—</Typography>
                            )}
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
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => openVerifyDialog(user)}
                                sx={{
                                  borderColor: '#3b82f6',
                                  color: '#3b82f6',
                                  textTransform: 'none',
                                  fontWeight: 600,
                                  borderRadius: 1.5,
                                  px: 2,
                                  '&:hover': {
                                    borderColor: '#2563eb',
                                    backgroundColor: '#eff6ff',
                                  },
                                }}
                              >
                                Edit Role
                              </Button>
                              {user.role === 'OPERATOR' && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => openAssignGpuDialog(user)}
                                  sx={{
                                    borderColor: '#f59e0b',
                                    color: '#f59e0b',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    borderRadius: 1.5,
                                    px: 2,
                                    '&:hover': {
                                      borderColor: '#d97706',
                                      backgroundColor: '#fffbeb',
                                    },
                                  }}
                                >
                                  Assign GPU
                                </Button>
                              )}
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
                            </Box>
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
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Update User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign GPU Dialog */}
      <Dialog 
        open={assignGpuDialog.open} 
        onClose={() => setAssignGpuDialog({ open: false, user: null })}
        maxWidth="xs"
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
            Assign GPU
          </Typography>
        </DialogTitle>
        <DialogContent>
          {assignGpuDialog.user && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Assign a GPU ID to operator <strong>{assignGpuDialog.user.full_name || assignGpuDialog.user.email}</strong>:
              </Typography>
              
              <TextField
                fullWidth
                label="GPU ID"
                type="number"
                value={selectedGpuId}
                onChange={(e) => setSelectedGpuId(e.target.value)}
                InputProps={{ inputProps: { min: 0 } }}
                helperText="Enter the GPU ID assigned to this operator"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button
            onClick={() => setAssignGpuDialog({ open: false, user: null })}
            sx={{
              color: '#64748b',
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignGpu}
            disabled={submitting}
            variant="contained"
            sx={{
              backgroundColor: '#f59e0b',
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
              '&:hover': {
                backgroundColor: '#d97706',
              },
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Assign GPU'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserVerification;