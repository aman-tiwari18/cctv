import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Badge,
} from '@mui/material';
import {
  AccessTime,
  Refresh,
  Description as DescriptionIcon,
  Add,
  Close,
  CalendarMonth,
  ChevronLeft,
  ChevronRight,
  DeleteOutline,
  Analytics as AnalyticsIcon
} from '@mui/icons-material';
import { examsAPI, shiftScriptsAPI } from '../services/api';
import ShiftScriptManager from '../components/ShiftScriptManager';
import { SlotRunningChip } from './exams/ScheduleSections';
import ExamSidebar from '../components/ExamSidebar';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';

/* ── Script chip colors keyed by script_id (exact TYPE_META from Detections.jsx) ── */
const SCRIPT_COLORS = {
  proximity: { bg: '#e5f5ed', color: '#5cb88a' },
  crowd: { bg: '#e9e3f8ff', color: '#e24d7b' },
  crowd_five: { bg: '#fce8e6', color: '#e06050' },
  crowd_zero: { bg: '#edeaf3', color: '#6b5b95' },
  server: { bg: '#f3ebe4', color: '#a0623d' },
  intruder: { bg: '#f0dfefff', color: '#d94466' },
  entry_exit: { bg: '#e0f0f0', color: '#1d7a7d' },
  phone: { bg: '#e8ece5', color: '#465a38' },
  blind_spot: { bg: '#f3f2e4', color: '#b0a850' },
  furniture: { bg: '#fff1e6', color: '#c2410c' },
  monitor_tamper: { bg: '#f3e8ff', color: '#6d28d9' },
  crowd_five_invigilator: { bg: '#ccfbf1', color: '#0f766e' },
  invigilator: { bg: '#cce8fcff', color: '#00bfcf' },
  inversion: { bg: '#eceef5', color: '#7a86b4' },
  tampering: { bg: '#e9f9ffff', color: '#00c8d4' },
  vision : { bg: '#dbeafe', color: '#3b82f6' }
};
const DEFAULT_CHIP_COLOR = { bg: '#dbeafe', color: '#3b82f6' };

// One-shot scripts — no cooldown loop, frequency/camera-type fields not applicable
// (mirrors NO_FREQUENCY_SCRIPTS in ShiftScriptManager.jsx)
const NO_FREQUENCY_SCRIPTS = new Set(['vision', 'vision_neet']);

// Fallback cooldown (seconds) used by each script when no custom frequency is set —
// mirrors COOLDOWN_TIME in each detection script / COOLDOWNS in unified_detector.py
const DEFAULT_FREQUENCY_BY_SCRIPT = {
  crowd: 120,
  crowd_zero: 360,
  crowd_five: 120,
  proximity: 120,
  intruder: 0,
  entry_exit: 120,
  server: 60,
  phone: 90,
  strongroom: 180,
  qp_box: 240,
  blind_spot: 180,
  furniture: 300,
  monitor_tamper: 120,
  crowd_five_invigilator: 420,
  invigilator: 420,
  inversion: 240,
  tampering: 60,
};

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parts = String(value).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
};

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');

  /* ── Sidebar state ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(examId || '');
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── Dialog state lifted ── */
  const [openShiftDialogId, setOpenShiftDialogId] = useState(null);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  /* Track full assignment objects per shift */
  const [shiftAssignments, setShiftAssignments] = useState({});
  /* ── Global date filter ── */
  const [selectedDate, setSelectedDate] = useState('');
  /* ── Archived Exams Toggle ── */
  const [viewingArchived, setViewingArchived] = useState(false);

  /* ── Delete Confirmation Dialog ── */
  const [deleteDialog, setDeleteDialog] = useState({ open: false, assignment: null });
  const [allDays, setAllDays] = useState(true);
  /* ── Date range picker state ── */
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [pickerStart, setPickerStart] = useState('');
  const [pickerEnd, setPickerEnd] = useState('');
  const [appliedDateRange, setAppliedDateRange] = useState({ start: '', end: '' });
  /* ── Calendar nav ── */
  const [calMonth, setCalMonth] = useState(() => new Date());

  useEffect(() => {
    loadExams();
  }, [viewingArchived]);

  useEffect(() => {
    if (selectedExamId) {
      loadShifts();
      setShiftAssignments({});
      setSelectedDate('');
      // reset date scheduling
      setAllDays(true);
      setAppliedDateRange({ start: '', end: '' });
      setPickerStart('');
      setPickerEnd('');
    } else {
      setShifts([]);
      setShiftAssignments({});
      setSelectedDate('');
      setSelectedShiftId(null);
    }
  }, [selectedExamId]);

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      const examList = Array.isArray(response?.data?.data) ? response.data.data : [];
      setExams(examList);
      if (examId && examList.length > 0 && !viewingArchived) {
        setSelectedExamId(examId);
      }
    } catch (err) {
      console.error('Error loading exams:', err);
      setError('Failed to load exams');
    }
  };

  const loadShifts = async () => {
    if (!selectedExamId) return;
    setLoading(true);
    setError('');
    try {
      const response = await examsAPI.getById(selectedExamId);
      const shiftList = Array.isArray(response?.data?.data?.examShifts)
        ? response.data.data.examShifts
        : [];
      // Earliest-starting shift on top
      const sortedShiftList = [...shiftList].sort((a, b) =>
        (a.start_time || '').localeCompare(b.start_time || '')
      );
      setShifts(sortedShiftList);
      setSelectedShiftId((prev) =>
        sortedShiftList.some((s) => s.id === prev) ? prev : (sortedShiftList[0]?.id ?? null)
      );
    } catch (err) {
      console.error('Error loading shifts:', err);
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadShifts();
    // Clear assignments to force re-fetch
    setShiftAssignments({});
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.assignment) return;
    try {
      const { shift_id } = deleteDialog.assignment;
      // Use the numeric DB primary key (script_id on the assignment row),
      // NOT the technical string identifier (Script.script_id like 'phone').
      const numericScriptId = deleteDialog.assignment.script_id || deleteDialog.assignment.script?.id;

      if (!shift_id || !numericScriptId) {
        alert('Could not determine shift or script ID. Please try again.');
        return;
      }

      await shiftScriptsAPI.bulkDelete({
        shift_id,
        script_id: numericScriptId,
        // Scope to this exact time window so removing one chip doesn't delete
        // every window assigned for this script on the shift.
        custom_start_time: deleteDialog.assignment.custom_start_time || null,
        custom_end_time: deleteDialog.assignment.custom_end_time || null,
        ...dateOptions
      });

      handleRefresh();
      setDeleteDialog({ open: false, assignment: null });
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete assignments: ' + (error?.response?.data?.message || error.message));
    }
  };

  const handleAssignmentsReady = useCallback((shiftId, assignmentList) => {
    setShiftAssignments((prev) => ({ ...prev, [shiftId]: assignmentList }));
  }, []);

  /* ── Collect all available dates across every shift ── */
  const availableDates = useMemo(() => {
    const dateSet = new Set();
    Object.values(shiftAssignments).forEach((assignments) => {
      assignments.forEach((a) => {
        if (a.assignment_date) dateSet.add(a.assignment_date);
      });
    });
    return [...dateSet].sort();
  }, [shiftAssignments]);

  /* Auto-select today or first available date when dates change */
  useEffect(() => {
    if (availableDates.length === 0) {
      if (selectedDate) setSelectedDate('');
      return;
    }
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setSelectedDate(availableDates.includes(today) ? today : availableDates[0]);
    }
  }, [availableDates]);

  const getFilteredAssignments = (shiftId) => {
    const all = shiftAssignments[shiftId] || [];
    // When allDays — show all
    if (allDays) return all;
    // When a range is applied, filter chips to only dates in range
    if (appliedDateRange.start) {
      const from = appliedDateRange.start;
      const to = appliedDateRange.end || appliedDateRange.start;
      return all.filter((a) => a.assignment_date >= from && a.assignment_date <= to);
    }
    // Fallback: filter by selectedDate
    if (!selectedDate) return all;
    return all.filter((a) => a.assignment_date === selectedDate);
  };

  /* ── Exam date range helpers ── */
  const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));

  // API returns dates as yyyy-MM-dd — parse directly
  const parseExamDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };

  const examStartDate = selectedExam ? parseExamDate(selectedExam.start_date) : null;
  const examEndDate = selectedExam ? parseExamDate(selectedExam.end_date) : null;

  const fmtDate = (d) => {
    if (!d) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /* ── Calendar helpers ── */
  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* Helper to convert Date to yyyy-MM-dd without timezone issues */
  const toDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const skipDaysSet = useMemo(() => new Set(selectedExam ? (selectedExam.skip_days || []) : []), [selectedExam]);
  const skipDatesSet = useMemo(() => new Set(selectedExam ? (selectedExam.skip_dates || []) : []), [selectedExam]);

  const isDaySkipped = (day) => {
    if (!day) return false;
    const iso = toDateString(day);
    const dayName = DAY_NAMES_FULL[day.getDay()];
    return skipDaysSet.has(dayName) || skipDatesSet.has(iso);
  };

  const getCalDays = () => {
    const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(calYear, calMonthIdx, d));
    return days;
  };

  const handleCalDayClick = (day) => {
    if (!day || isDaySkipped(day)) return;
    const iso = toDateString(day);
    if (!pickerStart || (pickerStart && pickerEnd)) {
      setPickerStart(iso);
      setPickerEnd('');
    } else {
      if (iso < pickerStart) {
        setPickerEnd(pickerStart);
        setPickerStart(iso);
      } else {
        setPickerEnd(iso);
      }
    }
  };

  const isInRange = (day) => {
    if (!day || !pickerStart) return false;
    const iso = toDateString(day);
    if (pickerEnd) return iso >= pickerStart && iso <= pickerEnd;
    return iso === pickerStart;
  };

  const isRangeStart = (day) => day && toDateString(day) === pickerStart;
  const isRangeEnd = (day) => day && pickerEnd && toDateString(day) === pickerEnd;

  /* ── dateOptions passed to ShiftScriptManager ── */
  const dateOptions = useMemo(() => {
    if (allDays) return { all_days: true };
    if (appliedDateRange.start && appliedDateRange.end)
      return { date_from: appliedDateRange.start, date_to: appliedDateRange.end };
    if (appliedDateRange.start)
      return { specific_dates: [appliedDateRange.start] };
    return { all_days: true };
  }, [allDays, appliedDateRange]);

  /* ── Trigger refresh when date options change ── */
  useEffect(() => {
    if (selectedExamId && shifts.length > 0) {
      // Clear assignments to force re-fetch with new date options
      setShiftAssignments({});
    }
  }, [dateOptions, selectedExamId, shifts.length]);

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden', bgcolor: '#f8fafc' }}>

      {/* ════ EXAM SIDEBAR ════ */}
      <ExamSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        exams={exams}
        selectedExamId={selectedExamId}
        onSelectExam={setSelectedExamId}
        viewingArchived={viewingArchived}
        onToggleArchived={() => {
          setViewingArchived(!viewingArchived);
          setSelectedExamId('');
        }}
      />

      <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2.5, md: 3.5 }, overflowY: 'auto', minWidth: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
            <CircularProgress />
          </Box>
        ) : !selectedExamId ? (
          /* ── Empty state ── */
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'calc(100vh - 200px)',
              textAlign: 'center',
              px: 4,
            }}
          >
            <Box
              sx={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                bgcolor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <AnalyticsIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
              Select an exam from the list
            </Typography>
            <Typography
              sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}
            >
              Choose an upcoming exam from the sidebar to manage scripts, review shift timings, and coordinate delivery statuses.
            </Typography>
          </Box>
        ) : (

          <>
            {/* ── Single-row header: exam name left, date range + toggles right ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>

              {/* LEFT: Exam title */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.35rem' } }}>
                  {selectedExam ? `${selectedExam.exam_name} (${selectedExam.exam_body})` : 'Exam'}
                </Typography>
                {selectedExam && selectedExam.is_active === false && (
                  <Chip label="Archived" size="small" color="error" variant="filled" sx={{ fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
                )}
              </Box>

              {/* RIGHT: Date range pill + iOS toggle + optional date range picker trigger */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' } }}>
                {/* Exam date range – always shown */}
                {selectedExam && (examStartDate || examEndDate) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: '#f1f5f9' }}>
                    <CalendarMonth sx={{ fontSize: 14, color: '#94a3b8' }} />
                    <Typography sx={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {fmtDate(examStartDate)} &mdash; {fmtDate(examEndDate)}
                    </Typography>
                  </Box>
                )}

                {/* iOS-style toggle switch */}
                <Box
                  onClick={() => {
                    const next = !allDays;
                    setAllDays(next);
                    if (!next) setShowDateRangePicker(true);
                    else setAppliedDateRange({ start: '', end: '' });
                  }}
                  sx={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    bgcolor: allDays ? '#3b82f6' : '#cbd5e1',
                    position: 'relative', transition: 'background 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <Box sx={{
                    position: 'absolute',
                    width: 18, height: 18,
                    bgcolor: '#fff',
                    borderRadius: '50%',
                    top: 3,
                    left: allDays ? 23 : 3,
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                  }} />
                </Box>
                <Typography
                  onClick={() => {
                    const next = !allDays;
                    setAllDays(next);
                    if (!next) setShowDateRangePicker(true);
                    else setAppliedDateRange({ start: '', end: '' });
                  }}
                  sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                >
                  All Days
                </Typography>

                {/* Date range picker trigger — only shown when toggle is OFF */}
                {!allDays && (
                  <Box
                    onClick={() => setShowDateRangePicker(true)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.6,
                      px: 1.5, py: 0.5, borderRadius: 2, cursor: 'pointer',
                      bgcolor: appliedDateRange.start ? '#eff6ff' : '#f1f5f9',
                      border: appliedDateRange.start ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                      transition: 'all 0.15s',
                    }}
                  >
                    <CalendarMonth sx={{ fontSize: 14, color: '#3b82f6' }} />
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                      {appliedDateRange.start
                        ? `${formatDateLabel(appliedDateRange.start)}${appliedDateRange.end && appliedDateRange.end !== appliedDateRange.start ? ` → ${formatDateLabel(appliedDateRange.end)}` : ''}`
                        : 'Pick range'
                      }
                    </Typography>
                    {appliedDateRange.start && (
                      <Close
                        onClick={(e) => { e.stopPropagation(); setAllDays(true); setAppliedDateRange({ start: '', end: '' }); }}
                        sx={{ fontSize: 13, color: '#94a3b8', ml: 0.5, '&:hover': { color: '#475569' } }}
                      />
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            {/* ── Date Range Picker Dialog ── */}
            <Dialog open={showDateRangePicker} onClose={() => setShowDateRangePicker(false)} PaperProps={{ sx: { borderRadius: 4, p: 0, minWidth: { xs: 0, sm: 360 }, width: { xs: '100%', sm: 'auto' }, m: { xs: 1, sm: 4 } } }}>
              <DialogContent sx={{ p: 3, pb: 2 }}>
                {/* Start / Finish inputs */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Start Date</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc', borderRadius: 2, px: 1.5, py: 1, border: '1px solid #e2e8f0' }}>
                      <CalendarMonth sx={{ fontSize: 16, color: '#3b82f6' }} />
                      <Typography sx={{ fontSize: 14, color: pickerStart ? '#1e293b' : '#94a3b8' }}>
                        {pickerStart ? formatDateLabel(pickerStart) : 'Select'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Finish Date</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc', borderRadius: 2, px: 1.5, py: 1, border: '1px solid #e2e8f0' }}>
                      <CalendarMonth sx={{ fontSize: 16, color: '#3b82f6' }} />
                      <Typography sx={{ fontSize: 14, color: pickerEnd ? '#1e293b' : '#94a3b8' }}>
                        {pickerEnd ? formatDateLabel(pickerEnd) : 'Select'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Month nav */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <IconButton size="small" onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))}>
                    <ChevronLeft sx={{ fontSize: 20 }} />
                  </IconButton>
                  <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>
                    {MONTH_NAMES[calMonthIdx]} {calYear}
                  </Typography>
                  <IconButton size="small" onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))}>
                    <ChevronRight sx={{ fontSize: 20 }} />
                  </IconButton>
                </Box>

                {/* Day labels */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
                  {DAY_LABELS.map((l) => (
                    <Typography key={l} sx={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', py: 0.5 }}>{l}</Typography>
                  ))}
                </Box>

                {/* Days grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
                  {getCalDays().map((day, i) => {
                    const skipped = isDaySkipped(day);
                    const inRange = isInRange(day) && !skipped;
                    const isStart = isRangeStart(day) && !skipped;
                    const isEnd = isRangeEnd(day) && !skipped;
                    return (
                      <Box
                        key={i}
                        onClick={() => handleCalDayClick(day)}
                        sx={{
                          textAlign: 'center', py: 0.7, cursor: day ? (skipped ? 'not-allowed' : 'pointer') : 'default',
                          bgcolor: inRange ? '#eff6ff' : 'transparent',
                          borderRadius: isStart ? '50% 0 0 50%' : isEnd ? '0 50% 50% 0' : 0,
                          position: 'relative',
                        }}
                      >
                        {day && (
                          <Box sx={{
                            width: 34, height: 34, borderRadius: '50%', mx: 'auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: (isStart || isEnd) ? '#3b82f6' : 'transparent',
                            color: skipped ? '#cbd5e1' : ((isStart || isEnd) ? '#fff' : inRange ? '#3b82f6' : '#334155'),
                            fontWeight: (isStart || isEnd) ? 800 : inRange ? 600 : 400,
                            textDecoration: skipped ? 'line-through' : 'none',
                            fontSize: 14,
                            transition: 'all 0.1s',
                            '&:hover': { bgcolor: skipped ? 'transparent' : ((isStart || isEnd) ? '#2563eb' : '#dbeafe') },
                          }}>
                            {day.getDate()}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
                {selectedExam && (skipDaysSet.size > 0 || skipDatesSet.size > 0) && (
                   <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', mt: 1 }}>
                     Dates disabled per exam skip schedule.
                   </Typography>
                )}

                {/* Actions */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2.5, pt: 2, borderTop: '1px solid #f1f5f9' }}>
                  <Button
                    onClick={() => { setPickerStart(''); setPickerEnd(''); setShowDateRangePicker(false); }}
                    sx={{ color: '#64748b', fontWeight: 600, textTransform: 'none', fontSize: 14 }}
                  >Cancel</Button>
                  <Button
                    variant="contained"
                    disabled={!pickerStart}
                    onClick={() => {
                      setAppliedDateRange({ start: pickerStart, end: pickerEnd || pickerStart });
                      setAllDays(false);
                      setShowDateRangePicker(false);
                    }}
                    sx={{ bgcolor: '#3b82f6', fontWeight: 700, borderRadius: 2.5, px: 4, textTransform: 'none', fontSize: 14, boxShadow: 'none', '&:hover': { bgcolor: '#2563eb', boxShadow: 'none' } }}
                  >Apply</Button>
                </Box>
              </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation Dialog: Premium Redesign ── */}
            <Dialog
              open={deleteDialog.open}
              onClose={() => setDeleteDialog({ open: false, assignment: null })}
              PaperProps={{
                sx: {
                  borderRadius: 5,
                  p: 0,
                  maxWidth: 420,
                  width: '100%',
                  overflow: 'hidden'
                }
              }}
            >
              <DialogContent sx={{ p: 4, textAlign: 'center' }}>
                {/* Trash Icon Circle */}
                <Box sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2
                }}>
                  <DeleteOutline sx={{ fontSize: 32, color: '#dc2626' }} />
                </Box>

                <Typography variant="h6" sx={{ fontWeight: 800, color: '#1e293b', mb: 1 }}>
                  Remove Script?
                </Typography>

                <Typography sx={{ color: '#333', fontSize: '0.95rem', lineHeight: 1.3, mb: 1 }}>
                  Are you sure you want to remove <Box component="span" sx={{ fontWeight: 700, color: '#888' }}>{deleteDialog.assignment?.script?.name || 'this script'}</Box>?
                  <Box component="span" sx={{ display: 'block', mt: 1, fontSize: '0.75rem', color: '#888', mb: 4 }}>
                    This action will cancel all scheduled executions and delete the script from the active repository
                  </Box>
                </Typography>

                {/* Actions Row */}
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Button
                    fullWidth
                    onClick={() => setDeleteDialog({ open: false, assignment: null })}
                    sx={{
                      color: '#475569',
                      fontWeight: 700,
                      bgcolor: '#f1f5f9',
                      py: 1.3,
                      borderRadius: 3,
                      textTransform: 'none',
                      fontSize: '0.9rem',
                      '&:hover': { bgcolor: '#e2e8f0' }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    fullWidth
                    disableElevation
                    onClick={handleDeleteConfirm}
                    sx={{
                      fontWeight: 700,
                      bgcolor: '#2563eb',
                      color: '#fff',
                      py: 1.3,
                      borderRadius: 3,
                      textTransform: 'none',
                      fontSize: '0.9rem',
                      boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.39)',
                      '&:hover': { bgcolor: '#1d4ed8', boxShadow: '0 6px 20px rgba(37, 99, 235, 0.23)' }
                    }}
                  >
                    OK
                  </Button>
                </Box>
              </DialogContent>
            </Dialog>

            {/* Shift cards */}
            {shifts.length > 0 ? (() => {
              const activeShift = shifts.find((s) => s.id === selectedShiftId) || shifts[0];
              const filteredAssignments = getFilteredAssignments(activeShift.id);

              return (
                <Box>
                  {/* Shift tabs — only one shift's scripts are shown at a time */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {shifts.map((shift) => {
                        const isActive = shift.id === activeShift.id;
                        return (
                          <Box
                            key={shift.id}
                            onClick={() => setSelectedShiftId(shift.id)}
                            sx={{
                              cursor: 'pointer',
                              px: 2.5,
                              py: 1.2,
                              borderRadius: 2.5,
                              minWidth: 150,
                              bgcolor: isActive ? '#ffffff' : 'transparent',
                              border: isActive ? '1px solid #e8ecf1' : '1px solid transparent',
                              boxShadow: isActive ? '0 1px 6px rgba(0,0,0,0.06)' : 'none',
                              transition: 'all 0.15s ease',
                              '&:hover': { bgcolor: isActive ? '#ffffff' : '#f1f5f9' },
                            }}
                          >
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: isActive ? '#0f172a' : '#94a3b8' }}>
                              {shift.shift_name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: isActive ? '#64748b' : '#cbd5e1' }}>
                              {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>

                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={() => setOpenShiftDialogId(activeShift.id)}
                      disableElevation
                      sx={{
                        bgcolor: 'primary.main',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        borderRadius: 2,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        px: 2.5,
                        py: 0.8,
                        '&:hover': { bgcolor: 'primary.dark' },
                      }}
                    >
                      Add Script
                    </Button>
                  </Box>

                  {/* RTSP exam with a centre schedule: how many centres run in this shift on the chosen
                      date (today when "all days" or a multi-day range is shown) */}
                  {String(selectedExam?.link_type || '').toUpperCase() === 'RTSP' && (() => {
                    const now = new Date();
                    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const oneDay = !allDays && appliedDateRange.start && (appliedDateRange.end || appliedDateRange.start) === appliedDateRange.start
                      ? appliedDateRange.start : (!allDays && !appliedDateRange.start ? selectedDate : '');
                    return (
                      <Box sx={{ mb: 2 }}>
                        <SlotRunningChip examId={selectedExamId} date={oneDay || today} shiftId={activeShift.id} shiftName={activeShift.shift_name} />
                      </Box>
                    );
                  })()}

                  {/* Hidden mounts — keep every shift's manager alive for prefetch + its own dialog */}
                  {shifts.map((shift) => (
                    <ShiftScriptManager
                      key={shift.id}
                      shift={shift}
                      examId={selectedExamId}
                      examBody={selectedExam?.exam_body}
                      onUpdate={handleRefresh}
                      openDialog={openShiftDialogId === shift.id}
                      onCloseDialog={() => setOpenShiftDialogId(null)}
                      onScriptNamesReady={(assignments) => handleAssignmentsReady(shift.id, assignments)}
                      renderInline={false}
                      dateOptions={dateOptions}
                    />
                  ))}

                  {/* Script chips — deduplicated by script_id + time window, so the
                      same script assigned twice with different windows shows as two chips */}
                  {filteredAssignments.length > 0 && (() => {
                        // When duplicate rows exist for the same script + time window, keep the
                        // one with the most info (frequency/camera type) rather than just the first seen.
                        const byKey = new Map();
                        filteredAssignments.forEach((a) => {
                          const scriptKey = a.script_id || a.script?.id || a.id;
                          const key = `${scriptKey}|${a.custom_start_time || ''}|${a.custom_end_time || ''}`;
                          const existing = byKey.get(key);
                          if (!existing) {
                            byKey.set(key, a);
                            return;
                          }
                          const existingHasData = existing.custom_frequency_minutes || existing.camera_classifications;
                          const currentHasData = a.custom_frequency_minutes || a.camera_classifications;
                          if (currentHasData && !existingHasData) {
                            byKey.set(key, a);
                          } else if (Boolean(currentHasData) === Boolean(existingHasData) && a.id > existing.id) {
                            byKey.set(key, a);
                          }
                        });
                        const unique = Array.from(byKey.values());
                        
                        // Sort by start time
                        const sorted = unique.sort((a, b) => {
                          const timeA = a.custom_start_time || activeShift.start_time || '';
                          const timeB = b.custom_start_time || activeShift.start_time || '';
                          return timeA.localeCompare(timeB);
                        });
                        
                        return (
                          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'flex-start' }}>
                            {sorted.map((assignment, i) => {
                              // Remove "detection" keyword from name
                              const rawName = assignment.script?.name || 'Unknown';
                              const name = rawName.replace(/\s*detection\s*/gi, '').trim();

                              const technicalId = assignment.script?.script_id || '';
                              const chipColor = SCRIPT_COLORS[technicalId] || DEFAULT_CHIP_COLOR;
                              const startT = assignment.custom_start_time
                                ? assignment.custom_start_time.substring(0, 5)
                                : null;
                              const endT = assignment.custom_end_time
                                ? assignment.custom_end_time.substring(0, 5)
                                : null;
                              const timeLabel = startT && endT ? `${startT} – ${endT}` : '';
                              const hasFrequencyField = !NO_FREQUENCY_SCRIPTS.has(technicalId);
                              const isCustomFrequency = assignment.custom_frequency_minutes != null;
                              const frequencySec = isCustomFrequency
                                ? assignment.custom_frequency_minutes
                                : DEFAULT_FREQUENCY_BY_SCRIPT[technicalId];
                              const customCameraTypes = Array.isArray(assignment.camera_classifications)
                                ? assignment.camera_classifications.filter(Boolean)
                                : (assignment.camera_classifications ? [assignment.camera_classifications] : []);
                              const isCustomCameraTypes = customCameraTypes.length > 0;
                              const cameraTypes = isCustomCameraTypes ? customCameraTypes : ['All Cameras'];

                              return (
                                <Box
                                  key={assignment.id ?? `${technicalId}-${i}`}
                                  sx={{
                                    position: 'relative',
                                    bgcolor: chipColor.bg,
                                    borderRadius: '14px',
                                    p: 2,
                                    pr: 4.5,
                                    width: { xs: '100%', sm: 280 },
                                  }}
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() => setDeleteDialog({ open: true, assignment })}
                                    sx={{
                                      position: 'absolute',
                                      top: 10,
                                      right: 10,
                                      width: 22,
                                      height: 22,
                                      bgcolor: 'rgba(0,0,0,0.35)',
                                      color: '#fff',
                                      '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
                                    }}
                                  >
                                    <Close sx={{ fontSize: 14 }} />
                                  </IconButton>

                                  <Box sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                                    {name}
                                  </Box>
                                  {timeLabel && (
                                    <Box sx={{ fontWeight: 500, fontSize: '0.75rem', opacity: 0.75, mt: '2px', color: '#334155' }}>
                                      {timeLabel}
                                    </Box>
                                  )}

                                  {hasFrequencyField && (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5 }}>
                                      {frequencySec != null && (
                                        <Box>
                                          <Box sx={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.55, letterSpacing: '0.03em', color: '#334155', whiteSpace: 'nowrap' }}>
                                            FREQUENCY (sec)
                                          </Box>
                                          <Box sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', mt: '2px' }}>
                                            {frequencySec}
                                            {!isCustomFrequency && (
                                              <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 500, opacity: 0.6, ml: '4px' }}>
                                                (default)
                                              </Box>
                                            )}
                                          </Box>
                                        </Box>
                                      )}
                                      <Box>
                                        <Box sx={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.55, letterSpacing: '0.03em', color: '#334155', whiteSpace: 'nowrap' }}>
                                          CAMERA TYPE{!isCustomCameraTypes && (
                                            <Box component="span" sx={{ fontWeight: 500, opacity: 0.85, ml: '4px' }}>
                                              (default)
                                            </Box>
                                          )}
                                        </Box>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px', mt: '4px' }}>
                                          {cameraTypes.map((ct) => (
                                            <Box
                                              key={ct}
                                              sx={{
                                                px: 1.1,
                                                py: '2px',
                                                borderRadius: '10px',
                                                bgcolor: 'rgba(255,255,255,0.6)',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                color: chipColor.color,
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              {ct}
                                            </Box>
                                          ))}
                                        </Box>
                                      </Box>
                                    </Box>
                                  )}
                                </Box>
                              );
                            })}
                          </Box>
                        );
                      })()}
                </Box>
              );
            })() : (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 8,
                  bgcolor: '#fff',
                  borderRadius: 3,
                  border: '1px solid #e8ecf1',
                }}
              >
                <Typography sx={{ fontSize: '0.95rem', color: '#64748b' }}>
                  No shifts found for this exam. Add shifts in the Exams page.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default Analytics;
