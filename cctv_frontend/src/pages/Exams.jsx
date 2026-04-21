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
  Radio,
  RadioGroup,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Videocam,
  Analytics,
  CalendarMonth,
  EventBusy,
  CalendarTodayOutlined,
  VideocamOutlined,
  LayersOutlined,
  Schedule,
  EditOutlined,
  DeleteOutline,
  AccessTime,
  AccessTimeOutlined,
  StayPrimaryLandscape,
  Close,
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

  const formatDateV1 = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
          startIcon={<Add sx={{ fontSize: 16 }} />}
          onClick={() => handleOpenDialog()}
          disableElevation
          sx={{
            height: 34,
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'none',
            bgcolor: 'primary.main',
            color: '#fff',
            px: 2,
            transition: 'all 0.2s ease',
            '&:hover': { bgcolor: 'primary.dark', transform: 'translateY(-1px)' },
          }}
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
            <Grid item xs={12} sm={6} md={3} key={exam.id} >
              <Box
                sx={{
                  bgcolor: '#fff',
                  border: '1px solid #f8fafc',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  borderRadius: 4,
                  p: 3,
                  py: 3.5,
                  height: '100%',
                  minHeight: 420,
                  maxWidth: 530,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '1.5rem', color: '#0f172a', lineHeight: 1.25, pr: 1, flex: 1 }}>
                    {exam.exam_name}
                  </Typography>
                  <Chip
                    label={exam.link_type}
                    size="small"
                    sx={{
                      fontWeight: 800, fontSize: '0.75rem', height: 26, px: 0.5,
                      borderRadius: '16px', flexShrink: 0,
                      bgcolor: isHLS ? '#3c81f6' : '#e0e7ff', color: isHLS ? '#fff' : '#3c81f6',
                    }}
                  />
                </Box>

                <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.01em', textTransform: 'uppercase', color: '#94a3b8', mb: 1 }}>
                  Exam Body: {exam.exam_body}
                </Typography>

                {!isActive ? (
                  <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 3, p: 2, mb: 2.5, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', mb: 0.5 }}>Status</Typography>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#94a3b8' }}>Archived</Typography>
                  </Box>
                ) : (
                  <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 3, p: 2, mb: 2.5 }}>
                    {exam.start_date && exam.end_date && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.2 }}>
                        <CalendarTodayOutlined sx={{ fontSize: 18, color: '#676e80', flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.97rem', fontWeight: 600, color: '#676e80' }}>
                          {formatDateV1(exam.start_date)} - {formatDateV1(exam.end_date)}
                        </Typography>
                      </Box>
                    )}
                    {/* Stats row */}
                    {dateInfo && (
                      <>
                        <Box sx={{ display: 'flex', gap: 2.5, mb: 0.9 }}>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8' }}>
                            Total Days-{dateInfo.totalDays}
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8' }}>
                            Skipped Days-{dateInfo.skippedDays}
                          </Typography>
                        </Box>
                        {(exam.skip_days?.length > 0 || exam.skip_dates?.length > 0) && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7 }}>
                            {exam.skip_days?.map((day) => (
                              <Chip key={day} label={day.substring(0, 3)} size="small"
                                sx={{ height: 24, fontSize: '0.72rem', fontWeight: 700, color: '#676e80', bgcolor: '#fff', borderRadius: '8px' }} />
                            ))}
                            {exam.skip_dates?.length > 0 && (
                              <Chip label={`+${exam.skip_dates.length} dates`} size="small"
                                sx={{ height: 24, fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', bgcolor: '#dbeafe', borderRadius: '8px' }} />
                            )}
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                )}

                {exam.examShifts?.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {exam.examShifts.map((shift) => (
                      <Chip
                        key={shift.id}
                        icon={<AccessTimeOutlined sx={{ fontSize: '15px !important' }} />}
                        label={`${shift.shift_name} (${shift.start_time?.substring(0, 5)} - ${shift.end_time?.substring(0, 5)})`}
                        sx={{
                          bgcolor: '#fff',
                          color: '#3c81f6',
                          borderRadius: '12px',
                          fontWeight: 600,
                          fontSize: '0.68rem',
                          border: '1px solid #e2e8f0',
                          height: 30,
                          px: 0.5,
                          '& .MuiChip-icon': { color: '#2563eb' },
                        }}
                      />
                    ))}
                  </Box>
                )}

                <Box sx={{ flex: 1 }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Box
                      onClick={() => navigate(`/cameras?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75 } }}
                    >
                      <CameraAltIcon sx={{ fontSize: 20, color: '#64748b' }} />
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#475569' }}>
                        {String(exam.camera_count || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                    <Box
                      onClick={() => navigate(`/shifts?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75 } }}
                    >
                      <Schedule sx={{ fontSize: 18, color: '#64748b' }} />
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#64748b' }}>
                        {String(exam.examShifts?.length || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleOpenDialog(exam)}
                      sx={{ color: '#64748b', '&:hover': { bgcolor: '#f1f5f9' } }}>
                      <EditOutlined sx={{ fontSize: 20 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(exam.id)}
                      sx={{ color: '#64748b', '&:hover': { bgcolor: '#f1f5f9' } }}>
                      <DeleteOutline sx={{ fontSize: 20 }} />
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
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3, width: '100%', maxWidth: '750px' } }}>
        <DialogTitle sx={{ m: 0, p: 2, pb: 1, fontWeight: 800, fontSize: '1.2rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingExam ? 'Edit Exam' : 'Create New Exam'}
          <IconButton onClick={handleCloseDialog} size="small" sx={{ color: '#64748b' }}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Divider sx={{ mx: 0 }} />

        <DialogContent sx={{ p: 3, pt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* BASIC INFORMATION */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 1 }}>
            <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
              BASIC INFORMATION
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Exam Name
              </Typography>
              <TextField
                fullWidth
                name="exam_name"
                value={formData.exam_name}
                onChange={handleChange}
                size="small"
                InputProps={{ sx: { borderRadius: 2, bgcolor: '#f1f5f9', '& fieldset': { border: 'none' } } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Exam Body
              </Typography>
              <TextField
                fullWidth
                name="exam_body"
                value={formData.exam_body}
                onChange={handleChange}
                size="small"
                select
                InputProps={{ sx: { borderRadius: 2, bgcolor: '#f1f5f9', '& fieldset': { border: 'none' } } }}
              >
                <MenuItem value="SSC">SSC</MenuItem>
                <MenuItem value="TCS">TCS</MenuItem>
                <MenuItem value="UPSC">UPSC</MenuItem>
                <MenuItem value="IBPS">IBPS</MenuItem>
                {formData.exam_body && !['SSC', 'TCS', 'UPSC', 'IBPS'].includes(formData.exam_body) && <MenuItem value={formData.exam_body}>{formData.exam_body}</MenuItem>}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Link Type
              </Typography>
              <RadioGroup row name="link_type" value={formData.link_type} onChange={handleChange}>
                <FormControlLabel value="RTSP" control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#3c81f6' } }} />} label={<Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>RTSP</Typography>} />
                <FormControlLabel value="HLS" control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#3c81f6' } }} />} label={<Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>HLS</Typography>} />
              </RadioGroup>
            </Grid>

            <Grid item xs={12}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Description
              </Typography>
              <TextField
                fullWidth
                name="description"
                value={formData.description}
                onChange={handleChange}
                size="small"
                multiline
                rows={2}
                placeholder="Enter requirements..."
                InputProps={{ sx: { borderRadius: 2, bgcolor: '#f1f5f9', '& fieldset': { border: 'none' }, fontSize: '0.9rem' } }}
              />
            </Grid>
          </Grid>

          {/* EXAM DATE RANGE */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 4 }}>
            <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
              EXAM DATE RANGE
            </Typography>
          </Box>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Start Date
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    type="date"
                    size="small"
                    fullWidth
                    value={formData.start_date ? formData.start_date.split('-').reverse().join('-') : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, start_date: val ? val.split('-').reverse().join('-') : '' });
                    }}
                    InputProps={{
                      sx: {
                        borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                        color: 'transparent',
                        paddingRight: '6px',
                        '& fieldset': { border: 'none' },
                        '&::-webkit-calendar-picker-indicator': { cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }
                      }
                    }}
                  />
                  {formData.start_date && (
                    <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>
                      {formData.start_date}
                    </Box>
                  )}
                  {!formData.start_date && (
                    <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>
                      dd-mm-yyyy
                    </Box>
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  End Date
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    type="date"
                    size="small"
                    fullWidth
                    value={formData.end_date ? formData.end_date.split('-').reverse().join('-') : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, end_date: val ? val.split('-').reverse().join('-') : '' });
                    }}
                    InputProps={{
                      sx: {
                        borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                        color: 'transparent',
                        paddingRight: '6px',
                        '& fieldset': { border: 'none' },
                        '&::-webkit-calendar-picker-indicator': { cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }
                      }
                    }}
                  />
                  {formData.end_date && (
                    <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>
                      {formData.end_date}
                    </Box>
                  )}
                  {!formData.end_date && (
                    <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>
                      dd-mm-yyyy
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>
          </LocalizationProvider>

          {/* SKIP DAYS & DATES */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 4 }}>
            <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
              SKIP DAYS & DATES
            </Typography>
          </Box>
          <Box mb={2}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 1, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Skip Weekdays
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {ALL_DAYS.map((day) => {
                const isSelected = formData.skip_days.includes(day);
                return (
                  <Box
                    key={day}
                    onClick={() => handleSkipDayToggle(day)}
                    sx={{
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      border: isSelected ? 'none' : '1px solid #cbd5e1',
                      bgcolor: isSelected ? '#eff6ff' : 'transparent',
                      color: isSelected ? '#3c81f6' : '#64748b',
                      fontWeight: 700, fontSize: '0.75rem',
                      transition: 'all 0.2s',
                    }}
                  >
                    {day.substring(0, 1)}
                  </Box>
                )
              })}
            </Box>
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Skip Specific Dates
            </Typography>
            <Box display="flex" gap={1} alignItems="center" mb={1}>
              <Box sx={{ position: 'relative', flex: 1 }}>
                <TextField
                  type="date"
                  size="small"
                  fullWidth
                  value={newSkipDate ? newSkipDate.split('-').reverse().join('-') : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewSkipDate(val ? val.split('-').reverse().join('-') : '');
                  }}
                  InputProps={{
                    sx: {
                      borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                      color: 'transparent',
                      paddingRight: '6px',
                      '& fieldset': { border: 'none' },
                      '&::-webkit-calendar-picker-indicator': { cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }
                    }
                  }}
                />
                {newSkipDate && (
                  <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>
                    {newSkipDate}
                  </Box>
                )}
                {!newSkipDate && (
                  <Box sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>
                    Select date (dd-mm-yyyy)
                  </Box>
                )}
              </Box>
              <Button
                variant="contained"
                onClick={handleAddSkipDate}
                disabled={!newSkipDate}
                sx={{
                  bgcolor: '#e2e8f0', color: '#3b82f6', fontWeight: 700, borderRadius: 2, px: 3, py: 1,
                  boxShadow: 'none', '&:hover': { bgcolor: '#cbd5e1', boxShadow: 'none' },
                  '&.Mui-disabled': { bgcolor: '#f1f5f9', color: '#94a3b8' }, textTransform: 'none'
                }}
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
                  sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600, borderRadius: '8px' }}
                  onDelete={() => handleRemoveSkipDate(date)}
                  deleteIcon={<Close sx={{ color: '#94a3b8 !important', fontSize: '14px !important' }} />}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
                EXAM SHIFTS
              </Typography>
            </Box>
            <Button
              onClick={addShift}
              startIcon={<Add sx={{ fontSize: 16 }} />}
              sx={{ color: '#3c81f6', fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
            >
              Add Shift
            </Button>
          </Box>

          {formData.shifts.map((shift, index) => (
            <Box
              key={index}
              sx={{ p: 1.5, mb: 1.5, bgcolor: '#f8fafc', borderRadius: 3, display: 'flex', gap: 2, alignItems: 'center' }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Shift Name
                </Typography>
                <TextField
                  value={shift.shift_name}
                  onChange={(e) => handleShiftChange(index, 'shift_name', e.target.value)}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { borderRadius: 2, fontSize: '0.9rem', bgcolor: '#ffffff', '& fieldset': { border: 'none' } } }}
                />
              </Box>
              <Box sx={{ width: 130 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Start
                </Typography>
                <TextField
                  type="time"
                  value={shift.start_time}
                  onChange={(e) => handleShiftChange(index, 'start_time', e.target.value)}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { borderRadius: 2, bgcolor: '#ffffff', fontSize: '0.8rem', '& fieldset': { border: 'none' } } }}
                />
              </Box>
              <Box sx={{ width: 130 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  End
                </Typography>
                <TextField
                  type="time"
                  value={shift.end_time}
                  onChange={(e) => handleShiftChange(index, 'end_time', e.target.value)}
                  size="small"
                  fullWidth
                  InputProps={{ sx: { borderRadius: 2, fontSize: '0.8rem', bgcolor: '#ffffff', '& fieldset': { border: 'none' } } }}
                />
              </Box>
              <IconButton
                onClick={() => removeShift(index)}
                disabled={formData.shifts.length <= 1}
                size="small"
                sx={{ color: '#ef4444', mt: 2 }}
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </DialogContent>
        <Box sx={{ p: 3, pt: 2, display: 'flex', justifyContent: 'flex-end', gap: 2, bgcolor: '#f8fafc', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          <Button onClick={handleCloseDialog} sx={{ color: '#475569', fontWeight: 700, textTransform: 'none', fontSize: 13 }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="contained" sx={{ bgcolor: '#3c81f6', color: '#fff', fontWeight: 700, borderRadius: 2, px: 4, textTransform: 'none', fontSize: 13, boxShadow: 'none', '&:hover': { bgcolor: '#2563eb', boxShadow: 'none' } }}>
            {editingExam ? 'Update' : 'Create'}
          </Button>
        </Box>
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
