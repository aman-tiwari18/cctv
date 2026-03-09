import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  CircularProgress,
  TextField,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { Visibility, Refresh } from '@mui/icons-material';
import { format } from 'date-fns';
import { executionsAPI } from '../services/api';

const statusColors = {
  PENDING: 'warning',
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
  CANCELLED: 'default',
};

const Executions = () => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
  });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    loadAssignments();
  }, [filters]);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      
      const response = await executionsAPI.getAll(params);
      setAssignments(response.data.data);
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value,
    });
  };

  const handleViewDetails = async (assignment) => {
    try {
      const response = await executionsAPI.getById(assignment.id);
      setSelectedAssignment(response.data.data);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error loading assignment details:', error);
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedAssignment(null);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Script Executions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor script assignment status and results
          </Typography>
        </Box>
        <IconButton onClick={loadAssignments} color="primary">
          <Refresh />
        </IconButton>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2}>
          <TextField
            select
            label="Status"
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="RUNNING">Running</MenuItem>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="FAILED">Failed</MenuItem>
            <MenuItem value="CANCELLED">Cancelled</MenuItem>
          </TextField>
        </Box>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : assignments.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Script Name</strong></TableCell>
                <TableCell><strong>Shift</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Started At</strong></TableCell>
                <TableCell><strong>Completed At</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>#{assignment.id}</TableCell>
                  <TableCell>
                    {assignment.script?.name || '-'}
                    {assignment.script?.category && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {assignment.script.category}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{assignment.shift?.shift_name || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={assignment.status}
                      color={statusColors[assignment.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {assignment.started_at
                      ? format(new Date(assignment.started_at), 'MMM dd, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {assignment.completed_at
                      ? format(new Date(assignment.completed_at), 'MMM dd, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleViewDetails(assignment)}>
                      <Visibility fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No script assignments found
          </Typography>
        </Paper>
      )}

      {/* Details Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Assignment Details</DialogTitle>
        <DialogContent>
          {selectedAssignment && (
            <Box>
              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={selectedAssignment.status}
                  color={statusColors[selectedAssignment.status]}
                  sx={{ mt: 0.5 }}
                />
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Script Name
                </Typography>
                <Typography variant="body1">
                  {selectedAssignment.script?.name || '-'}
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Script Path
                </Typography>
                <Typography variant="body1">
                  {selectedAssignment.script?.script_path || '-'}
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Shift
                </Typography>
                <Typography variant="body1">
                  {selectedAssignment.shift?.shift_name || '-'}
                  {selectedAssignment.shift?.exam?.exam_name && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Exam: {selectedAssignment.shift.exam.exam_name}
                    </Typography>
                  )}
                </Typography>
              </Box>

              {selectedAssignment.started_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Started At
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedAssignment.started_at), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}

              {selectedAssignment.completed_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Completed At
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedAssignment.completed_at), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}

              {selectedAssignment.started_at && selectedAssignment.completed_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Duration
                  </Typography>
                  <Typography variant="body1">
                    {Math.round(
                      (new Date(selectedAssignment.completed_at) - new Date(selectedAssignment.started_at)) / 1000
                    )} seconds
                  </Typography>
                </Box>
              )}

              {selectedAssignment.result_data && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Result Data
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mt: 1 }}>
                    <pre style={{ margin: 0, fontSize: '12px', overflow: 'auto' }}>
                      {JSON.stringify(selectedAssignment.result_data, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}

              {selectedAssignment.error_log && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="error">
                    Error Log
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: '#ffebee', mt: 1 }}>
                    <Typography variant="body2" color="error">
                      {selectedAssignment.error_log}
                    </Typography>
                  </Paper>
                </Box>
              )}

              {selectedAssignment.notes && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Notes
                  </Typography>
                  <Typography variant="body1">
                    {selectedAssignment.notes}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Executions;
