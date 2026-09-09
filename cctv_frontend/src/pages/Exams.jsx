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
  Autocomplete,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Videocam,
  Analytics,
  CalendarMonth,
  EventBusy,
  VideocamOutlined,
  LayersOutlined,
  EditOutlined,
  DeleteOutline,
  AccessTime,
  StayPrimaryLandscape,
  Close,
  UploadFile,
  Download,
  Sms,
} from '@mui/icons-material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import ExamScheduleCalendar from '../components/ExamScheduleCalendar';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { authAPI, examsAPI, shiftScriptsAPI, smsAPI } from '../services/api';

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// today, or the exam's last date — whichever is earlier → "DD-MM-YYYY"
const examDefaultDate = (exam) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = today;
  const end = exam?.end_date ? new Date(exam.end_date) : null;
  if (end && !isNaN(end)) { end.setHours(0, 0, 0, 0); if (end < today) d = end; }
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

// Fallback used only if /auth/companies is unreachable; backend
// src/constants/examBodies.js is the source of truth.
const FALLBACK_EXAM_BODIES = [
  { code: 'EY', label: 'EY(Ernst & Young)' },
  { code: 'SSC', label: 'SSC(Staff Selection Commission)' },
  { code: 'TCS', label: 'TCS(Tata Consultancy Services)' },
  { code: 'NTA', label: 'NTA(National Testing Agency)' },
  { code: 'UPCISB', label: 'UPCISB' },
];

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
    observer_phone: '',
    shifts: [],
  });
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [newSkipDate, setNewSkipDate] = useState('');
  const [examCounts, setExamCounts] = useState({}); // Store script and detection counts
  const [smsClientBodies, setSmsClientBodies] = useState([]);
  const [examBodies, setExamBodies] = useState(FALLBACK_EXAM_BODIES);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  // Observer sheet (TC code -> SMS number). On an existing exam the file uploads
  // straight away; while CREATING there is no exam id yet, so the file is held
  // here and posted right after the exam is created.
  const [observerFile, setObserverFile] = useState(null);
  const [observerSummary, setObserverSummary] = useState(null);
  const [observerBusy, setObserverBusy] = useState(false);

  useEffect(() => {
    loadExams();
    smsAPI.getClients()
      .then((res) => setSmsClientBodies(res?.data?.bodies || []))
      .catch(() => setSmsClientBodies([]));
    examsAPI.getAssignableUsers()
      .then((res) => setAssignableUsers(res?.data?.data || []))
      .catch(() => setAssignableUsers([]));
    authAPI.getAvailableCompanies()
      .then((res) => {
        const bodies = (res?.data?.bodies || []).filter((b) => b.examBody);
        if (bodies.length) setExamBodies(bodies);
      })
      .catch(() => { /* keep fallback list */ });
  }, []);

  const examBodyHasSms = (body) =>
    smsClientBodies.map((b) => String(b).toUpperCase()).includes(String(body || '').toUpperCase());

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      const examsList = response.data.data;
      setExams(examsList);

      // Fetch counts for each exam
      const countsPromises = examsList.map(async (exam) => {
        try {
          // Fetch script counts for all shifts
          let totalScripts = 0;
          if (exam.examShifts && exam.examShifts.length > 0) {
            const scriptCountPromises = exam.examShifts.map(async (shift) => {
              try {
                const scriptResponse = await shiftScriptsAPI.getByShift(shift.id);
                return scriptResponse.data?.data?.length || 0;
              } catch (err) {
                console.error(`Error fetching scripts for shift ${shift.id}:`, err);
                return 0;
              }
            });
            const scriptCounts = await Promise.all(scriptCountPromises);
            totalScripts = scriptCounts.reduce((sum, count) => sum + count, 0);
          }

          // Fetch detection count
          let detectionCount = 0;
          try {
            const detectionResponse = await examsAPI.getDetectionCount(exam.id);
            detectionCount = detectionResponse.data?.data?.detection_count || 0;
          } catch (err) {
            console.error(`Error fetching detections for exam ${exam.id}:`, err);
          }

          return {
            examId: exam.id,
            scriptCount: totalScripts,
            detectionCount: detectionCount,
          };
        } catch (err) {
          console.error(`Error fetching counts for exam ${exam.id}:`, err);
          return {
            examId: exam.id,
            scriptCount: 0,
            detectionCount: 0,
          };
        }
      });

      const counts = await Promise.all(countsPromises);
      const countsMap = counts.reduce((acc, item) => {
        acc[item.examId] = {
          scripts: item.scriptCount,
          detections: item.detectionCount,
        };
        return acc;
      }, {});

      setExamCounts(countsMap);
    } catch (error) {
      console.error('Error loading exams:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = async (exam = null) => {
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
        observer_phone: exam.observer_phone || '',
        shifts: exam.examShifts?.map(s => ({
          id: s.id,                         // keep id so the backend updates in place
          shift_name: s.shift_name,
          start_time: s.start_time?.substring(0, 5) || '',
          end_time: s.end_time?.substring(0, 5) || '',
          _existing: true,                  // marks a saved shift (timing locked)
        })) || [],
      });
      try {
        const res = await examsAPI.getAssignedUsers(exam.id);
        setAssignedUserIds((res?.data?.data || []).map(u => u.id));
      } catch { setAssignedUserIds([]); }
      setObserverFile(null);
      try {
        const res = await examsAPI.getObservers(exam.id);
        setObserverSummary({ numbers: res?.data?.numbers || 0, tcCodes: res?.data?.tcCodes || 0 });
      } catch { setObserverSummary(null); }
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
        observer_phone: '',
        shifts: [
          { shift_name: 'Shift 1', start_time: '09:00', end_time: '12:00' },
        ],
      });
      setAssignedUserIds([]);
      setObserverFile(null);
      setObserverSummary(null);
    }
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingExam(null);
    setError('');
    setNewSkipDate('');
    setObserverFile(null);
    setObserverSummary(null);
  };

  /* ── Observer sheet (TC code -> mobile) ──────────────────────────────────
     The mapping decides who the SMS alert reaches when a client accepts a
     detection: only the number(s) listed against that detection's TC code are
     texted, so a centre absent from the sheet raises no SMS. */

  const uploadObserverSheet = async (examId, file) => {
    const res = await examsAPI.uploadObservers(examId, file);
    const d = res?.data?.data || {};
    setObserverSummary({ numbers: d.numbers || 0, tcCodes: d.tcCodes || 0 });
    return d;
  };

  const handleObserverFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';           // let the same file be re-picked after a failure
    if (!file) return;

    // No exam id yet on the create form — stage it for handleSubmit.
    if (!editingExam) {
      setObserverFile(file);
      setObserverSummary(null);
      return;
    }

    setObserverBusy(true);
    try {
      const d = await uploadObserverSheet(editingExam.id, file);
      setSnackbar({
        open: true,
        message: `Observer numbers updated — ${d.numbers} number(s) across ${d.tcCodes} TC code(s)`,
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err.response?.data?.message || 'Failed to upload observer sheet',
        severity: 'error',
      });
    } finally {
      setObserverBusy(false);
    }
  };

  const handleClearObservers = async () => {
    if (!editingExam) { setObserverFile(null); return; }
    setObserverBusy(true);
    try {
      await examsAPI.deleteObservers(editingExam.id);
      setObserverSummary({ numbers: 0, tcCodes: 0 });
      setObserverFile(null);
      setSnackbar({ open: true, message: 'Observer numbers cleared for this exam', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to clear observer numbers', severity: 'error' });
    } finally {
      setObserverBusy(false);
    }
  };

  const handleDownloadObserverTemplate = async () => {
    try {
      const res = await examsAPI.downloadObserverTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'observer_numbers_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setSnackbar({ open: true, message: 'Failed to download template', severity: 'error' });
    }
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

    // Validate skip date is within exam date range
    if (formData.start_date && formData.end_date) {
      const skipDate = new Date(parsedDate);
      const startDate = parseDDMMYYYYToDate(formData.start_date);
      const endDate = parseDDMMYYYYToDate(formData.end_date);

      if (skipDate < startDate || skipDate > endDate) {
        setError('Skip date must be within the exam date range');
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      skip_dates: [...prev.skip_dates, parsedDate].sort(),
    }));
    setNewSkipDate('');
    setError('');
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

    // Real-time validation for shift times
    if (field === 'start_time' || field === 'end_time') {
      const shift = newShifts[index];
      if (shift.start_time && shift.end_time && shift.start_time >= shift.end_time) {
        setError(`${shift.shift_name}: Start time must be before end time`);
      } else {
        setError('');
      }
    }

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
    const shift = formData.shifts[index];
    // Removing a saved shift cascades — the backend deletes every script already
    // scheduled for it. Make the user confirm.
    if (shift?._existing) {
      const ok = window.confirm(
        `Remove "${shift.shift_name}"?\n\nThis will permanently delete ALL scripts scheduled for this shift ` +
        `(across every date) and its execution history. This cannot be undone.`
      );
      if (!ok) return;
    }
    const newShifts = formData.shifts.filter((_, i) => i !== index);
    setFormData({ ...formData, shifts: newShifts });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.exam_name.trim()) {
      setError('Exam name is required');
      return;
    }
    if (!formData.exam_body) {
      setError('Exam body is required');
      return;
    }
    if (!formData.start_date || !formData.end_date) {
      setError('Start date and end date are required');
      return;
    }

    // Validate start date is not after end date
    const startDate = parseDDMMYYYYToDate(formData.start_date);
    const endDate = parseDDMMYYYYToDate(formData.end_date);
    if (startDate > endDate) {
      setError('Start date cannot be after end date');
      return;
    }

    // Validate shifts
    if (formData.shifts.length === 0) {
      setError('At least one shift is required');
      return;
    }

    for (let i = 0; i < formData.shifts.length; i++) {
      const shift = formData.shifts[i];
      if (!shift.shift_name.trim()) {
        setError(`Shift ${i + 1}: Name is required`);
        return;
      }
      if (!shift.start_time || !shift.end_time) {
        setError(`Shift ${i + 1}: Start time and end time are required`);
        return;
      }
      // Validate shift start time is before end time
      if (shift.start_time >= shift.end_time) {
        setError(`Shift ${i + 1}: Start time must be before end time`);
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        start_date: parseDDMMYYYYToISO(formData.start_date),
        end_date: parseDDMMYYYYToISO(formData.end_date),
        assigned_user_ids: assignedUserIds,
      };

      let observerWarning = '';
      if (editingExam) {
        await examsAPI.update(editingExam.id, payload);
      } else {
        const created = await examsAPI.create(payload);
        // The staged observer sheet needs the new exam's id. A failure here must
        // not read as "the exam wasn't created" — it was; only the sheet missed.
        const newExamId = created?.data?.data?.id;
        if (observerFile && newExamId) {
          try {
            await uploadObserverSheet(newExamId, observerFile);
          } catch (err) {
            observerWarning = ` — but the observer sheet failed to import (${err.response?.data?.message || err.message}). Re-upload it by editing the exam.`;
          }
        }
      }
      handleCloseDialog();
      loadExams();
      setSnackbar({
        open: true,
        message: (editingExam ? 'Exam updated successfully' : 'Exam created successfully') + observerWarning,
        severity: observerWarning ? 'warning' : 'success',
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
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
            flexShrink: 0,
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

          // Check if exam is currently live
          const now = new Date();
          const examStart = exam.start_date ? new Date(exam.start_date) : null;
          const examEnd = exam.end_date ? new Date(exam.end_date) : null;
          const isLive = examStart && examEnd && now >= examStart && now <= examEnd;

          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={exam.id} >
              <Box
                sx={{
                  bgcolor: '#fff',
                  border: '1px solid #f8fafc',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                  borderRadius: 4,
                  p: { xs: 2.5, sm: 3 },
                  py: 3.5,
                  height: { xs: 'auto', sm: '100%' },
                  minHeight: { xs: 'auto', md: 380 },
                  maxWidth: 530,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <Typography title={exam.exam_name} sx={{ fontWeight: 600, fontSize: { xs: '1.15rem', sm: '1.3rem' }, color: '#0f172a', lineHeight: 1.25, flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word' }}>
                    {exam.exam_name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
                    <Chip
                      label={exam.link_type}
                      size="small"
                      sx={{
                        fontWeight: 800, fontSize: '0.75rem', height: 26, px: 0.5,
                        borderRadius: '16px', flexShrink: 0,
                        bgcolor: isHLS ? '#3c81f6' : '#e0e7ff', color: isHLS ? '#fff' : '#3c81f6',
                      }}
                    />
                    {isLive && (
                      <Chip
                        icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }} />}
                        label="LIVE"
                        size="small"
                        sx={{
                          fontWeight: 800, fontSize: '0.7rem', height: 26, px: 1,
                          borderRadius: '16px', flexShrink: 0,
                          bgcolor: '#fff', color: '#06875eff',
                          '& .MuiChip-icon': { ml: 0.5 }
                        }}
                      />
                    )}
                  </Box>
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
                  <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 3, p: { xs: 2, sm: 1.75 }, mb: 2.5 }}>
                    {exam.start_date && exam.end_date && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.2 }}>
                        <ExamScheduleCalendar exam={exam} />
                        <Typography sx={{ fontSize: { xs: '0.95rem', sm: '0.84rem' }, fontWeight: 600, color: '#676e80' }}>
                          {formatDateV1(exam.start_date)} - {formatDateV1(exam.end_date)}
                        </Typography>
                      </Box>
                    )}
                    {/* Stats row */}
                    {dateInfo && (
                      <>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 0.9 }}>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            Total Days-{dateInfo.totalDays}
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>
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
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, mb: 2 }}>
                    {exam.examShifts.map((shift) => (
                      <Chip
                        key={shift.id}
                        icon={<ShiftSvgIcon sx={{ fontSize: '15px !important' }} />}
                        label={`${shift.shift_name} (${shift.start_time?.substring(0, 5)} - ${shift.end_time?.substring(0, 5)})`}
                        sx={{
                          bgcolor: '#fff',
                          color: '#3c81f6',
                          borderRadius: '12px',
                          fontWeight: 600,
                          fontSize: '0.68rem',
                          // border: '1px solid #e2e8f0',
                          height: 30,
                          px: 0.5,
                          '& .MuiChip-icon': { color: '#2563eb' },
                        }}
                      />
                    ))}
                  </Box>
                )}

                <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 2, pt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Box
                      onClick={() => navigate(`/cameras?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
                    >
                      <CameraAltIcon sx={{ fontSize: 18, color: '#8b929cff' }} />
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569', '&:hover': { color: '#3c81f6' } }}>
                        {String(exam.camera_count || 0).padStart(2, '0')}
                      </Typography>
                    </Box>

                    <Box
                      onClick={() => navigate(`/analytics?exam=${exam.id}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
                    >
                      <Analytics sx={{ fontSize: 18, color: '#8b929cff' }} />


                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', '&:hover': { color: '#3c81f6' } }}>
                        {String(examCounts[exam.id]?.scripts || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                    <Box
                      onClick={() => navigate(`/detections?exam_id=${exam.id}&date=${examDefaultDate(exam)}`)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
                    >
                      <ReportProblemIcon sx={{ fontSize: 18, color: '#8b929cff' }} />


                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', '&:hover': { color: '#3c81f6' } }}>
                        {String(examCounts[exam.id]?.detections || 0).padStart(2, '0')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleOpenDialog(exam)}
                      sx={{ color: '#64748b', '&:hover': { bgcolor: '#f1f5f9' } }}>
                      <EditOutlined sx={{ fontSize: 20 }} />
                    </IconButton>
                    {/* <IconButton size="small" onClick={() => handleDelete(exam.id)}
                      sx={{ color: '#64748b', '&:hover': { bgcolor: '#f1f5f9' } }}>
                      <DeleteOutline sx={{ fontSize: 20 }} />
                    </IconButton> */}
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
                {examBodies.map((b) => (
                  <MenuItem key={b.code} value={b.code}>{b.label || b.code}</MenuItem>
                ))}
                {formData.exam_body && !examBodies.some((b) => b.code === formData.exam_body) && <MenuItem value={formData.exam_body}>{formData.exam_body}</MenuItem>}
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Link Type{editingExam ? ' (locked)' : ''}
              </Typography>
              <RadioGroup row name="link_type" value={formData.link_type} onChange={handleChange}>
                <FormControlLabel value="RTSP" disabled={!!editingExam} control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#3c81f6' } }} />} label={<Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>RTSP</Typography>} />
                <FormControlLabel value="HLS" disabled={!!editingExam} control={<Radio size="small" sx={{ '&.Mui-checked': { color: '#3c81f6' } }} />} label={<Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>HLS</Typography>} />
              </RadioGroup>
              {editingExam && (
                <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: -0.5 }}>
                  Link type can't be changed after an exam is created.
                </Typography>
              )}
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

            {examBodyHasSms(formData.exam_body) && (
              <Grid item xs={12} sm={6}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {String(formData.exam_body || '').toUpperCase()} Observer Phone (SMS alerts)
                </Typography>
                <TextField
                  fullWidth
                  name="observer_phone"
                  value={formData.observer_phone}
                  onChange={handleChange}
                  size="small"
                  placeholder="e.g. 919876543210 (comma-separate for multiple)"
                  InputProps={{ sx: { borderRadius: 2, bgcolor: '#f1f5f9', '& fieldset': { border: 'none' } } }}
                />
                <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: 0.5 }}>
                  Recipient for invigilator / close-proximity SMS alerts. Leave blank to use the system default.
                </Typography>
              </Grid>
            )}
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
                      const newStartDate = val ? val.split('-').reverse().join('-') : '';
                      setFormData({ ...formData, start_date: newStartDate });

                      // Clear error if dates are now valid
                      if (newStartDate && formData.end_date) {
                        const start = parseDDMMYYYYToDate(newStartDate);
                        const end = parseDDMMYYYYToDate(formData.end_date);
                        if (start <= end) {
                          setError('');
                        }
                      }
                    }}
                    InputProps={{
                      sx: {
                        borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                        color: 'transparent',
                        paddingRight: '6px',
                        '& fieldset': { border: 'none' },
                        '& input': { color: 'transparent', caretColor: 'transparent' },
                        '& input::-webkit-datetime-edit': { opacity: 0 },
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
                      const newEndDate = val ? val.split('-').reverse().join('-') : '';
                      setFormData({ ...formData, end_date: newEndDate });

                      // Clear error if dates are now valid
                      if (formData.start_date && newEndDate) {
                        const start = parseDDMMYYYYToDate(formData.start_date);
                        const end = parseDDMMYYYYToDate(newEndDate);
                        if (start <= end) {
                          setError('');
                        }
                      }
                    }}
                    inputProps={{
                      min: formData.start_date ? formData.start_date.split('-').reverse().join('-') : undefined
                    }}
                    InputProps={{
                      sx: {
                        borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                        color: 'transparent',
                        paddingRight: '6px',
                        '& fieldset': { border: 'none' },
                        '& input': { color: 'transparent', caretColor: 'transparent' },
                        '& input::-webkit-datetime-edit': { opacity: 0 },
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
              Skip days
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
                  inputProps={{
                    min: formData.start_date ? formData.start_date.split('-').reverse().join('-') : undefined,
                    max: formData.end_date ? formData.end_date.split('-').reverse().join('-') : undefined
                  }}
                  disabled={!formData.start_date || !formData.end_date}
                  InputProps={{
                    sx: {
                      borderRadius: 2, bgcolor: '#f1f5f9', height: 38, fontSize: 14,
                      color: 'transparent',
                      paddingRight: '6px',
                      '& fieldset': { border: 'none' },
                      '& input': { color: 'transparent', caretColor: 'transparent' },
                      '& input::-webkit-datetime-edit': { opacity: 0 },
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
                    {!formData.start_date || !formData.end_date ? 'Set exam dates first' : 'Select date (dd-mm-yyyy)'}
                  </Box>
                )}
              </Box>
              <Button
                variant="contained"
                onClick={handleAddSkipDate}
                disabled={!newSkipDate || !formData.start_date || !formData.end_date}
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
                  Start{shift._existing ? ' 🔒' : ''}
                </Typography>
                <TextField
                  type="time"
                  value={shift.start_time}
                  onChange={(e) => handleShiftChange(index, 'start_time', e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!!shift._existing}
                  title={shift._existing ? "Saved shift timing can't be changed — remove the shift and add a new one to re-time it." : undefined}
                  InputProps={{ sx: { borderRadius: 2, bgcolor: shift._existing ? '#f1f5f9' : '#ffffff', fontSize: '0.8rem', '& fieldset': { border: 'none' } } }}
                />
              </Box>
              <Box sx={{ width: 130 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', mb: 0.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  End{shift._existing ? ' 🔒' : ''}
                </Typography>
                <TextField
                  type="time"
                  value={shift.end_time}
                  onChange={(e) => handleShiftChange(index, 'end_time', e.target.value)}
                  size="small"
                  fullWidth
                  disabled={!!shift._existing}
                  title={shift._existing ? "Saved shift timing can't be changed — remove the shift and add a new one to re-time it." : undefined}
                  InputProps={{ sx: { borderRadius: 2, fontSize: '0.8rem', bgcolor: shift._existing ? '#f1f5f9' : '#ffffff', '& fieldset': { border: 'none' } } }}
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
          {/* SMS OBSERVER NUMBERS — TC code -> mobile mapping, uploaded as Excel.
              Only the numbers listed against a detection's TC code are texted. */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
                SMS OBSERVER NUMBERS
              </Typography>
            </Box>
            <Button
              onClick={handleDownloadObserverTemplate}
              startIcon={<Download sx={{ fontSize: 16 }} />}
              sx={{ color: '#3c81f6', fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}
            >
              Template
            </Button>
          </Box>

          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 3, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                component="label"
                disabled={observerBusy}
                startIcon={observerBusy ? <CircularProgress size={14} /> : <UploadFile sx={{ fontSize: 16 }} />}
                sx={{
                  bgcolor: '#ffffff', color: '#3c81f6', fontWeight: 700, fontSize: '0.75rem',
                  textTransform: 'none', borderRadius: 2, px: 2, border: '1px solid #e2e8f0',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                {observerBusy ? 'Uploading...' : 'Upload Excel'}
                <input type="file" hidden accept=".xlsx,.xls,.ods" onChange={handleObserverFile} />
              </Button>

              {/* Staged (create flow) — nothing is on the server until Create. */}
              {observerFile && (
                <Chip
                  icon={<UploadFile sx={{ fontSize: 14 }} />}
                  label={`${observerFile.name} — imports on Create`}
                  size="small"
                  onDelete={() => setObserverFile(null)}
                  deleteIcon={<Close sx={{ fontSize: '14px !important' }} />}
                  sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, borderRadius: '8px' }}
                />
              )}

              {/* Loaded (edit flow) */}
              {!observerFile && observerSummary && observerSummary.numbers > 0 && (
                <>
                  <Chip
                    icon={<Sms sx={{ fontSize: 14, color: '#15803d !important' }} />}
                    label={`${observerSummary.numbers} number(s) · ${observerSummary.tcCodes} TC code(s)`}
                    size="small"
                    sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 600, borderRadius: '8px' }}
                  />
                  <Button
                    onClick={handleClearObservers}
                    disabled={observerBusy}
                    startIcon={<DeleteOutline sx={{ fontSize: 15 }} />}
                    sx={{ color: '#ef4444', fontWeight: 700, fontSize: '0.72rem', textTransform: 'none' }}
                  >
                    Clear
                  </Button>
                </>
              )}

              {!observerFile && observerSummary && observerSummary.numbers === 0 && (
                <Chip
                  label="No numbers uploaded"
                  size="small"
                  sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600, borderRadius: '8px' }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: 1.5 }}>
              Two columns — <strong>TC Code</strong> and <strong>Mobile Number</strong>. When a client accepts a
              detection, the alert SMS goes only to the number(s) listed against that detection's TC code; a centre
              missing from the sheet raises no SMS. Re-uploading replaces the whole list for this exam.
            </Typography>
          </Box>

          {/* ASSIGN USERS */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 4 }}>
            <Box sx={{ width: 3, height: 14, bgcolor: '#3c81f6', mr: 1, borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: '#1e293b' }}>
              ASSIGN CLIENT USERS
            </Typography>
          </Box>
          <Autocomplete
            multiple
            options={assignableUsers}
            getOptionLabel={(u) => `${u.full_name || u.username} (${u.company_name || u.email})`}
            value={assignableUsers.filter(u => assignedUserIds.includes(u.id))}
            onChange={(_, selected) => setAssignedUserIds(selected.map(u => u.id))}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="Select verified client users..."
                InputProps={{ ...params.InputProps, sx: { borderRadius: 2, bgcolor: '#f1f5f9', '& fieldset': { border: 'none' } } }}
              />
            )}
            renderTags={(selected, getTagProps) =>
              selected.map((u, i) => (
                <Chip
                  key={u.id}
                  label={u.full_name || u.username}
                  size="small"
                  {...getTagProps({ index: i })}
                  sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}
                />
              ))
            }
            sx={{ mb: 1 }}
          />
          <Typography sx={{ fontSize: 11, color: '#94a3b8', mb: 2 }}>
            Only verified client users are shown. Selected users will see this exam on their dashboard.
          </Typography>
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
