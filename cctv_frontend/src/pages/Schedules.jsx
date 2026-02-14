import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  CloudUpload,
  Upload,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { schedulesAPI, examsAPI } from '../services/api';

const Schedules = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');
  
  const [schedules, setSchedules] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(examId || '');
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [formData, setFormData] = useState({
    exam_date: '',
    notes: '',
    shifts: [
      { shift_name: 'Morning Shift', start_time: '09:00', end_time: '12:00' },
    ],
  });
  const [error, setError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExam) {
      loadSchedules();
    }
  }, [selectedExam]);

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      setExams(response.data.data);
      if (examId && response.data.data.length > 0) {
        setSelectedExam(examId);
      }
    } catch (error) {
      console.error('Error loading exams:', error);
    }
  };

  const loadSchedules = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const response = await schedulesAPI.getByExam(selectedExam, { 
        is_active: true,
        include_shifts: true 
      });
      setSchedules(response.data.data);
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormData({
        exam_date: schedule.exam_date,
        notes: schedule.notes || '',
        shifts: schedule.shifts || [],
      });
    } else {
      setEditingSchedule(null);
      setFormData({
        exam_date: '',
        notes: '',
        shifts: [
          { shift_name: 'Morning Shift', start_time: '09:00', end_time: '12:00' },
        ],
      });
    }
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingSchedule(null);
    setError('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleShiftChange = (index, field, value) => {
    const newShifts = [...formData.shifts];
    newShifts[index][field] = value;
    setFormData({ ...formData, shifts: newShifts });
  };

  const addShift = () => {
    setFormData({
      ...formData,
      shifts: [
        ...formData.shifts,
        { shift_name: '', start_time: '', end_time: '' },
      ],
    });
  };

  const removeShift = (index) => {
    const newShifts = formData.shifts.filter((_, i) => i !== index);
    setFormData({ ...formData, shifts: newShifts });
  };

  const handleSubmit = async () => {
    if (!selectedExam) {
      setError('Please select an exam first');
      return;
    }
    
    try {
      if (editingSchedule) {
        await schedulesAPI.update(editingSchedule.id, formData);
      } else {
        await schedulesAPI.create(selectedExam, formData);
      }
      handleCloseDialog();
      loadSchedules();
    } catch (error) {
      setError(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      try {
        await schedulesAPI.delete(id);
        loadSchedules();
      } catch (error) {
        alert('Failed to delete schedule');
      }
    }
  };

  const handleFileChange = (e) => {
    setUploadFile(e.target.files[0]);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!uploadFile || !selectedExam) {
      setError('Please select a file and exam');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await schedulesAPI.uploadExcel(selectedExam, uploadFile);
      setUploadResult(response.data);
      setOpenUploadDialog(false);
      setUploadFile(null);
      loadSchedules();
    } catch (error) {
      setError(error.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Exam Schedules
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage exam dates and shift timings
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<CloudUpload />}
            onClick={() => setOpenUploadDialog(true)}
            disabled={!selectedExam}
          >
            Upload Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!selectedExam}
          >
            Add Schedule
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          select
          label="Select Exam"
          value={selectedExam}
          onChange={(e) => setSelectedExam(e.target.value)}
          fullWidth
        >
          <MenuItem value="">Select an exam</MenuItem>
          {exams.map((exam) => (
            <MenuItem key={exam.id} value={exam.id}>
              {exam.exam_name} ({exam.exam_body})
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {uploadResult && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setUploadResult(null)}>
          Successfully imported {uploadResult.count} schedules
          {uploadResult.errors?.length > 0 && ` (${uploadResult.errors.length} errors)`}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : schedules.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Exam Date</strong></TableCell>
                <TableCell><strong>Shifts</strong></TableCell>
                <TableCell><strong>Notes</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    {format(new Date(schedule.exam_date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {schedule.shifts?.map((shift, idx) => (
                        <Chip
                          key={idx}
                          label={`${shift.shift_name}: ${shift.start_time} - ${shift.end_time}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{schedule.notes || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenDialog(schedule)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(schedule.id)}>
                      <Delete fontSize="small" />
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
            {selectedExam ? 'No schedules found. Add schedules or upload an Excel file.' : 'Please select an exam to view schedules.'}
          </Typography>
        </Paper>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            type="date"
            label="Exam Date"
            name="exam_date"
            value={formData.exam_date}
            onChange={handleChange}
            margin="normal"
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            margin="normal"
            multiline
            rows={2}
          />
          
          <Typography variant="subtitle1" mt={2} mb={1}>
            Shifts
          </Typography>
          {formData.shifts.map((shift, index) => (
            <Box key={index} display="flex" gap={2} mb={2}>
              <TextField
                label="Shift Name"
                value={shift.shift_name}
                onChange={(e) => handleShiftChange(index, 'shift_name', e.target.value)}
                fullWidth
              />
              <TextField
                type="time"
                label="Start Time"
                value={shift.start_time}
                onChange={(e) => handleShiftChange(index, 'start_time', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="time"
                label="End Time"
                value={shift.end_time}
                onChange={(e) => handleShiftChange(index, 'end_time', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <IconButton onClick={() => removeShift(index)} disabled={formData.shifts.length === 1}>
                <Delete />
              </IconButton>
            </Box>
          ))}
          <Button startIcon={<Add />} onClick={addShift}>
            Add Shift
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingSchedule ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={openUploadDialog} onClose={() => setOpenUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Exam Schedules Excel</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload an Excel file with Date column and shift time range columns (e.g., "09:00:00 to 12:00:00")
          </Typography>
          <Button
            variant="outlined"
            component="label"
            fullWidth
            startIcon={<Upload />}
          >
            {uploadFile ? uploadFile.name : 'Choose Excel File'}
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUploadDialog(false)}>Cancel</Button>
          <Button onClick={handleUpload} variant="contained" disabled={!uploadFile || loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Schedules;
