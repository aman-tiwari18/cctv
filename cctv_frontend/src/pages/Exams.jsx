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
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
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
        start_date: exam.start_date ? formatDateDDMMYYYY(exam.start_date) : '',
        end_date: exam.end_date ? formatDateDDMMYYYY(exam.end_date) : '',
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
    if (!newSkipDate) return;
    const parsedDate = parseDDMMYYYYToISO(newSkipDate);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate);
    if (!validDate || formData.skip_dates.includes(parsedDate)) return;

    setFormData((prev) => ({
      ...prev,
      skip_dates: [...prev.skip_dates, parsedDate].sort(),
    }));
    setNewSkipDate('');
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
      const payload = {
        ...formData,
        start_date: parseDDMMYYYYToISO(formData.start_date),
        end_date: parseDDMMYYYYToISO(formData.end_date),
      };

      if (editingExam) {
        await examsAPI.update(editingExam.id, payload);
      } else {
        await examsAPI.create(payload);
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

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const parseDDMMYYYYToISO = (value) => {
    if (!value) return '';
    const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
    if (!match) return value;
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  };

  const parseDDMMYYYYToDate = (value) => {
    if (!value) return null;
    const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    return new Date(yyyy, mm - 1, dd);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
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
          const isHLS = exam.link_type === 'HLS';
          const isActive = exam.is_active !== false;

          return (
            <Grid item xs={12} sm={6} md={3} key={exam.id}>
              <Box
                sx={{
                  bgcolor: '#fff',
                  border: '1px solid #e8ecf1',
                  borderRadius: 3,
                  p: 2,
                  height: '100%',
                  minHeight: 400,
                  maxWidth: 385,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.4 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a', lineHeight: 1.3, pr: 1, flex: 1 }}>
                    {exam.exam_name}
                  </Typography>
                  <Chip
                    label={exam.link_type}
                    size="small"
                    sx={{
                      fontWeight: 700, fontSize: '0.68rem', height: 20,
                      borderRadius: '6px', flexShrink: 0,
                      bgcolor: isHLS ? '#1d4ed8' : '#a4b4ff', color: isHLS ? '#fff' : '#3a4e95',
                    }}
                  />
                </Box>

                {/* ── Row 2: EXAM BODY ── */}
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', mb: 1.2 }}>
                  Exam Body: {exam.exam_body}
                </Typography>

                {/* ── Row 3: Date range ── */}
                {exam.start_date && exam.end_date && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.2 }}>
                    <CalendarMonth sx={{ fontSize: 15, color: '#3b82f6', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.77rem', fontWeight: 600, color: '#334155' }}>
                      {formatDate(exam.start_date)} - {formatDate(exam.end_date)}
                    </Typography>
                  </Box>
                )}


                {!isActive ? (
                  <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, p: 1.2, mb: 1.2, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', mb: 0.3 }}>Status</Typography>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#94a3b8' }}>Archived</Typography>
                  </Box>
                ) : dateInfo ? (
                  <Box sx={{ bgcolor: '#f8fafc', borderRadius: 2, p: 1.2, mb: 1.2 }}>
                    <Box sx={{ display: 'flex', gap: 2, mb: 0.8 }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Total Days-{dateInfo.totalDays}
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Skipped Days-{dateInfo.skippedDays}
                      </Typography>
                    </Box>
                    {(exam.skip_days?.length > 0 || exam.skip_dates?.length > 0) && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {exam.skip_days?.map((day) => (
                          <Chip key={day} label={day.substring(0, 3)} size="small"
                            sx={{ height: 20, fontSize: '0.64rem', fontWeight: 600, color: '#475569', bgcolor: '#fff' }} />
                        ))}
                        {exam.skip_dates?.length > 0 && (
                          <Chip label={`+${exam.skip_dates.length} dates`} size="small"
                            sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, color: '#3b82f6', bgcolor: '#eff6ff' }} />
                        )}
                      </Box>
                    )}
                  </Box>
                ) : null}

                {/* ── Shift Schedule ── each shift in its own grey box */}
                {exam.examShifts?.length > 0 && (
                  <Box sx={{ mb: 1.2 }}>
                    <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', mb: 0.8 }}>
                      Shift Schedule
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {exam.examShifts.map((shift) => (
                        <Box
                          key={shift.id}
                          sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            bgcolor: '#f8fafc', borderRadius: 1.5, px: 1.2, py: 1,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                            <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <AccessTime sx={{ fontSize: 12, color: '#64748b' }} />
                            </Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>{shift.shift_name}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                <Box sx={{ flex: 1 }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.2, pt: 1.2, borderTop: '1px solid #f1f5f9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      onClick={() => navigate(`/cameras?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.4, cursor: 'pointer', '&:hover': { opacity: 0.75 } }}
                    >
                      <CameraAltIcon sx={{ fontSize: 15, color: '#3b82f6' }} />
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                        {String(exam.camera_count || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                    {/* Clickable shift count → /shifts */}
                    <Box
                      onClick={() => navigate(`/shifts?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.4, cursor: 'pointer', '&:hover': { opacity: 0.75 } }}
                    >
                      <Schedule sx={{ fontSize: 15, color: '#2563eb' }} />
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                        {String(exam.examShifts?.length || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton size="small" onClick={() => handleOpenDialog(exam)}
                      sx={{ color: '#2563eb', '&:hover': { bgcolor: '#eff6ff' } }}>
                      <Edit sx={{ fontSize: 17 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(exam.id)}
                      sx={{ color: '#94a3b8', '&:hover': { bgcolor: '#f1f5f9' } }}>
                      <Delete sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Box>
                </Box>
              </Box>
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
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Start Date"
                  value={parseDDMMYYYYToDate(formData.start_date)}
                  onChange={(date) => setFormData({ ...formData, start_date: formatDateDDMMYYYY(date) })}
                  inputFormat="dd-MM-yyyy"
                  mask="__-__-____"
                  renderInput={(params) => (
                    <TextField fullWidth margin="dense" size="small" {...params} />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="End Date"
                  value={parseDDMMYYYYToDate(formData.end_date)}
                  onChange={(date) => setFormData({ ...formData, end_date: formatDateDDMMYYYY(date) })}
                  inputFormat="dd-MM-yyyy"
                  mask="__-__-____"
                  renderInput={(params) => (
                    <TextField fullWidth margin="dense" size="small" {...params} />
                  )}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>

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
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Skip Date"
                  value={parseDDMMYYYYToDate(newSkipDate)}
                  onChange={(date) => setNewSkipDate(formatDateDDMMYYYY(date))}
                  inputFormat="dd-MM-yyyy"
                  mask="__-__-____"
                  renderInput={(params) => (
                    <TextField size="small" sx={{ minWidth: 180 }} {...params} />
                  )}
                />
              </LocalizationProvider>
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
