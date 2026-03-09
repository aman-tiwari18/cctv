import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Typography,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Snackbar,
  Paper,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Videocam,
  Schedule,
  Analytics,
  CalendarMonth,
  EventBusy,
  Close,
  AccessTime,
} from '@mui/icons-material';
import { examsAPI } from '../services/api';

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const Exams = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [formData, setFormData] = useState({
    exam_name: '',
    exam_body: '',
    link_type: 'RTSP',
    description: '',
    start_date: '',
    end_date: '',
    skip_days: [],
    skip_dates: [],
    shifts: [],
  });
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [newSkipDate, setNewSkipDate] = useState('');

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      setExams(response.data.data);
    } catch (error) {
      console.error('Error loading exams:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (exam = null) => {
    if (exam) {
      setEditingExam(exam);
      setFormData({
        exam_name: exam.exam_name,
        exam_body: exam.exam_body,
        link_type: exam.link_type,
        description: exam.description || '',
        start_date: exam.start_date || '',
        end_date: exam.end_date || '',
        skip_days: exam.skip_days || [],
        skip_dates: exam.skip_dates || [],
        shifts: exam.examShifts?.map(s => ({
          shift_name: s.shift_name,
          start_time: s.start_time?.substring(0, 5) || '',
          end_time: s.end_time?.substring(0, 5) || '',
        })) || [],
      });
    } else {
      setEditingExam(null);
      setFormData({
        exam_name: '',
        exam_body: '',
        link_type: 'RTSP',
        description: '',
        start_date: '',
        end_date: '',
        skip_days: ['Saturday', 'Sunday'],
        skip_dates: [],
        shifts: [
          { shift_name: 'Shift 1', start_time: '09:00', end_time: '12:00' },
        ],
      });
    }
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingExam(null);
    setError('');
    setNewSkipDate('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Skip days toggle
  const handleSkipDayToggle = (day) => {
    setFormData((prev) => {
      const newSkipDays = prev.skip_days.includes(day)
        ? prev.skip_days.filter((d) => d !== day)
        : [...prev.skip_days, day];
      return { ...prev, skip_days: newSkipDays };
    });
  };

  // Skip dates management
  const handleAddSkipDate = () => {
    if (newSkipDate && !formData.skip_dates.includes(newSkipDate)) {
      setFormData((prev) => ({
        ...prev,
        skip_dates: [...prev.skip_dates, newSkipDate].sort(),
      }));
      setNewSkipDate('');
    }
  };

  const handleRemoveSkipDate = (date) => {
    setFormData((prev) => ({
      ...prev,
      skip_dates: prev.skip_dates.filter((d) => d !== date),
    }));
  };

  // Shift management
  const handleShiftChange = (index, field, value) => {
    const newShifts = [...formData.shifts];
    newShifts[index] = { ...newShifts[index], [field]: value };
    setFormData({ ...formData, shifts: newShifts });
  };

  const addShift = () => {
    const shiftNumber = formData.shifts.length + 1;
    setFormData({
      ...formData,
      shifts: [
        ...formData.shifts,
        { shift_name: `Shift ${shiftNumber}`, start_time: '', end_time: '' },
      ],
    });
  };

  const removeShift = (index) => {
    const newShifts = formData.shifts.filter((_, i) => i !== index);
    setFormData({ ...formData, shifts: newShifts });
  };

  const handleSubmit = async () => {
    try {
      if (editingExam) {
        await examsAPI.update(editingExam.id, formData);
      } else {
        await examsAPI.create(formData);
      }
      handleCloseDialog();
      loadExams();
      setSnackbar({
        open: true,
        message: editingExam ? 'Exam updated successfully' : 'Exam created successfully',
        severity: 'success',
      });
    } catch (error) {
      setError(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this exam?')) {
      try {
        await examsAPI.delete(id);
        loadExams();
        setSnackbar({ open: true, message: 'Exam deleted', severity: 'success' });
      } catch (error) {
        alert('Failed to delete exam');
      }
    }
  };

  // Calculate valid exam dates count
  const getExamDateInfo = (exam) => {
    if (!exam.start_date || !exam.end_date) return null;
    const skipDays = exam.skip_days || [];
    const skipDates = (exam.skip_dates || []).map(d => d.toString());
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let totalDays = 0;
    let validDays = 0;
    const current = new Date(exam.start_date);
    const end = new Date(exam.end_date);

    while (current <= end) {
      totalDays++;
      const dateStr = current.toISOString().split('T')[0];
      const dayName = dayNames[current.getDay()];
      if (!skipDays.includes(dayName) && !skipDates.includes(dateStr)) {
        validDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    return { totalDays, validDays, skippedDays: totalDays - validDays };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Exams
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage exam configurations, date ranges, shifts, and monitoring settings
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
          size="large"
        >
          Add Exam
        </Button>
      </Box>

      <Grid container spacing={3}>
        {exams.map((exam) => {
          const dateInfo = getExamDateInfo(exam);
          return (
            <Grid item xs={12} sm={6} md={4} key={exam.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Typography variant="h6" fontWeight="bold">
                      {exam.exam_name}
                    </Typography>
                    <Chip
                      label={exam.link_type}
                      size="small"
                      color={exam.link_type === 'RTSP' ? 'primary' : 'secondary'}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Exam Body:</strong> {exam.exam_body}
                  </Typography>
                  {exam.description && (
                    <Typography variant="body2" color="text.secondary" mt={1}>
                      {exam.description}
                    </Typography>
                  )}

                  {/* Date Range Info */}
                  {exam.start_date && exam.end_date && (
                    <Box mt={2} p={1.5} sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                        <CalendarMonth fontSize="small" color="primary" />
                        <Typography variant="body2" fontWeight="bold">
                          {formatDate(exam.start_date)} — {formatDate(exam.end_date)}
                        </Typography>
                      </Box>
                      {dateInfo && (
                        <Typography variant="caption" color="text.secondary">
                          {dateInfo.validDays} exam days • {dateInfo.skippedDays} days skipped
                        </Typography>
                      )}
                      {exam.skip_days?.length > 0 && (
                        <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                          {exam.skip_days.map((day) => (
                            <Chip
                              key={day}
                              label={day.substring(0, 3)}
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          ))}
                          {exam.skip_dates?.length > 0 && (
                            <Chip
                              label={`+${exam.skip_dates.length} dates`}
                              size="small"
                              variant="outlined"
                              color="error"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Shifts Info */}
                  {exam.examShifts?.length > 0 && (
                    <Box mt={1.5} display="flex" flexWrap="wrap" gap={0.5}>
                      {exam.examShifts.map((shift) => (
                        <Chip
                          key={shift.id}
                          icon={<AccessTime sx={{ fontSize: '0.85rem !important' }} />}
                          label={`${shift.shift_name}: ${shift.start_time?.substring(0, 5)} - ${shift.end_time?.substring(0, 5)}`}
                          size="small"
                          color="info"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      ))}
                    </Box>
                  )}

                  <Box mt={2} display="flex" gap={2}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Videocam fontSize="small" color="action" />
                      <Typography variant="caption">
                        {exam.camera_count || 0} cameras
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Schedule fontSize="small" color="action" />
                      <Typography variant="caption">
                        {exam.examShifts?.length || 0} shifts
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Analytics fontSize="small" color="action" />
                      <Typography variant="caption">
                        {exam.analytics_task_count || 0} tasks
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => navigate(`/cameras?exam=${exam.id}`)}
                  >
                    Cameras
                  </Button>
                  <Button
                    size="small"
                    onClick={() => navigate(`/shifts?exam=${exam.id}`)}
                  >
                    Shifts
                  </Button>
                  <Box flexGrow={1} />
                  <IconButton size="small" onClick={() => handleOpenDialog(exam)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(exam.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {exams.length === 0 && (
        <Box textAlign="center" py={8}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No exams found
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Create your first exam to get started
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>
            Add Exam
          </Button>
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingExam ? 'Edit Exam' : 'Create New Exam'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Basic Info Section */}
          <Typography variant="subtitle2" color="primary" sx={{ mt: 1, mb: 0.5 }}>
            Basic Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Exam Name"
                name="exam_name"
                value={formData.exam_name}
                onChange={handleChange}
                margin="dense"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Exam Body"
                name="exam_body"
                value={formData.exam_body}
                onChange={handleChange}
                margin="dense"
                required
                placeholder="e.g., SSC, TCS, UPSC"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Link Type"
                name="link_type"
                value={formData.link_type}
                onChange={handleChange}
                margin="dense"
                required
              >
                <MenuItem value="RTSP">RTSP</MenuItem>
                <MenuItem value="HLS">HLS</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                margin="dense"
                multiline
                rows={1}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Date Range Section */}
          <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>
            <CalendarMonth fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Exam Date Range
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Set the start and end dates for the exam period
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                margin="dense"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="End Date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                margin="dense"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Skip Days Section */}
          <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>
            <EventBusy fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Skip Days & Dates
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Select recurring days to skip and add specific dates to exclude
          </Typography>

          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.85rem' }}>
              Skip Weekdays
            </FormLabel>
            <FormGroup row>
              {ALL_DAYS.map((day) => (
                <FormControlLabel
                  key={day}
                  control={
                    <Checkbox
                      checked={formData.skip_days.includes(day)}
                      onChange={() => handleSkipDayToggle(day)}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{day.substring(0, 3)}</Typography>}
                />
              ))}
            </FormGroup>
          </FormControl>

          <Box mt={1.5}>
            <Typography variant="body2" color="text.secondary" mb={0.5}>
              Skip Specific Dates
            </Typography>
            <Box display="flex" gap={1} alignItems="center" mb={1}>
              <TextField
                type="date"
                size="small"
                value={newSkipDate}
                onChange={(e) => setNewSkipDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleAddSkipDate}
                disabled={!newSkipDate}
              >
                Add
              </Button>
            </Box>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {formData.skip_dates.map((date) => (
                <Chip
                  key={date}
                  label={formatDate(date)}
                  size="small"
                  color="error"
                  variant="outlined"
                  onDelete={() => handleRemoveSkipDate(date)}
                  deleteIcon={<Close fontSize="small" />}
                />
              ))}
              {formData.skip_dates.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No specific dates to skip
                </Typography>
              )}
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Shifts Section */}
          <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>
            <AccessTime fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Exam Shifts
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Define shifts that will apply to every exam date
          </Typography>

          {formData.shifts.map((shift, index) => (
            <Paper
              key={index}
              variant="outlined"
              sx={{ p: 1.5, mb: 1.5, display: 'flex', gap: 2, alignItems: 'center' }}
            >
              <TextField
                label="Shift Name"
                value={shift.shift_name}
                onChange={(e) => handleShiftChange(index, 'shift_name', e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <TextField
                type="time"
                label="Start Time"
                value={shift.start_time}
                onChange={(e) => handleShiftChange(index, 'start_time', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 140 }}
              />
              <TextField
                type="time"
                label="End Time"
                value={shift.end_time}
                onChange={(e) => handleShiftChange(index, 'end_time', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 140 }}
              />
              <IconButton
                onClick={() => removeShift(index)}
                disabled={formData.shifts.length <= 1}
                size="small"
                color="error"
              >
                <Delete fontSize="small" />
              </IconButton>
            </Paper>
          ))}
          <Button startIcon={<Add />} onClick={addShift} size="small">
            Add Shift
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingExam ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Exams;
