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
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    from_date: '',
    to_date: '',
  });
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    loadExecutions();
  }, [filters]);

  const loadExecutions = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      
      const response = await executionsAPI.getAll(params);
      setExecutions(response.data.data);
    } catch (error) {
      console.error('Error loading executions:', error);
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

  const handleViewDetails = async (execution) => {
    try {
      const response = await executionsAPI.getById(execution.id);
      setSelectedExecution(response.data.data);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error loading execution details:', error);
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedExecution(null);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Script Executions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor script execution status and results
          </Typography>
        </Box>
        <IconButton onClick={loadExecutions} color="primary">
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
          <TextField
            type="date"
            label="From Date"
            name="from_date"
            value={filters.from_date}
            onChange={handleFilterChange}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label="To Date"
            name="to_date"
            value={filters.to_date}
            onChange={handleFilterChange}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : executions.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Task Name</strong></TableCell>
                <TableCell><strong>Camera</strong></TableCell>
                <TableCell><strong>Scheduled Time</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Duration</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {executions.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell>#{execution.id}</TableCell>
                  <TableCell>{execution.task_name || '-'}</TableCell>
                  <TableCell>{execution.camera_id || '-'}</TableCell>
                  <TableCell>
                    {execution.scheduled_time
                      ? format(new Date(execution.scheduled_time), 'MMM dd, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={execution.status}
                      color={statusColors[execution.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {execution.actual_start_time && execution.actual_end_time
                      ? `${Math.round(
                          (new Date(execution.actual_end_time) -
                            new Date(execution.actual_start_time)) /
                            1000 /
                            60
                        )} min`
                      : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleViewDetails(execution)}>
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
            No executions found
          </Typography>
        </Paper>
      )}

      {/* Details Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Execution Details</DialogTitle>
        <DialogContent>
          {selectedExecution && (
            <Box>
              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={selectedExecution.status}
                  color={statusColors[selectedExecution.status]}
                  sx={{ mt: 0.5 }}
                />
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Task Name
                </Typography>
                <Typography variant="body1">{selectedExecution.task_name || '-'}</Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Script Path
                </Typography>
                <Typography variant="body1">{selectedExecution.script_path || '-'}</Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Camera ID
                </Typography>
                <Typography variant="body1">{selectedExecution.camera_id || '-'}</Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Stream URL
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {selectedExecution.stream_url || '-'}
                </Typography>
              </Box>

              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">
                  Scheduled Time
                </Typography>
                <Typography variant="body1">
                  {selectedExecution.scheduled_time
                    ? format(new Date(selectedExecution.scheduled_time), 'MMM dd, yyyy HH:mm:ss')
                    : '-'}
                </Typography>
              </Box>

              {selectedExecution.actual_start_time && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Actual Start Time
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedExecution.actual_start_time), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}

              {selectedExecution.actual_end_time && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Actual End Time
                  </Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedExecution.actual_end_time), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}

              {selectedExecution.result_data && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Result Data
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mt: 1 }}>
                    <pre style={{ margin: 0, fontSize: '12px', overflow: 'auto' }}>
                      {JSON.stringify(selectedExecution.result_data, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}

              {selectedExecution.error_log && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="error">
                    Error Log
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: '#ffebee', mt: 1 }}>
                    <Typography variant="body2" color="error">
                      {selectedExecution.error_log}
                    </Typography>
                  </Paper>
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
