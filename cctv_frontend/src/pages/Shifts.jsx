import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  AccessTime,
  ChevronRight,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { examsAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon'
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';

/* ── Format yyyy-mm-dd → dd-mm-yyyy ── */
const formatDateLabel = (v) => {
  if (!v) return '';
  const p = String(v).split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
};

/* ── Generate all dates between start and end, excluding skip_days & skip_dates ── */
const generateExamDates = (exam) => {
  if (!exam?.start_date || !exam?.end_date) return [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const skipDays = new Set(exam.skip_days || []);
  const skipDates = new Set(exam.skip_dates || []);
  const dates = [];
  const cursor = new Date(exam.start_date);
  const end = new Date(exam.end_date);
  while (cursor <= end) {
    const iso = cursor.toISOString().split('T')[0];
    const day = dayNames[cursor.getDay()];
    if (!skipDays.has(day) && !skipDates.has(iso)) dates.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const Shifts = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(examId || '');
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewingArchived, setViewingArchived] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => { loadExams(); }, [viewingArchived]);

  useEffect(() => {
    if (selectedExamId) { loadShifts(); setSelectedDate(''); }
    else setShifts([]);
  }, [selectedExamId]);

  const loadExams = async () => {
    try {
      const res = await examsAPI.getAll({ is_active: !viewingArchived });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setExams(list);
      if (examId && list.length > 0 && !viewingArchived) setSelectedExamId(examId);
    } catch (e) {
      console.error('Error loading exams:', e);
      setError('Failed to load exams');
    }
  };

  const loadShifts = async () => {
    if (!selectedExamId) return;
    setLoading(true);
    setError('');
    try {
      const res = await examsAPI.getById(selectedExamId);
      setShifts(Array.isArray(res?.data?.data?.examShifts) ? res.data.data.examShifts : []);
    } catch (e) {
      console.error('Error loading shifts:', e);
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));

  /* Generate date options from exam period */
  const availableDates = useMemo(() => generateExamDates(selectedExam), [selectedExam]);

  /* Auto-select today or first available date */
  useEffect(() => {
    if (!availableDates.length) { setSelectedDate(''); return; }
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(availableDates.includes(today) ? today : availableDates[0]);
    }
  }, [availableDates]);

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>

      {/* ════ LEFT SIDEBAR ════ */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          borderRight: '1px solid #e8ecf1',
          bgcolor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExamsSvgIcon sx={{ fontSize: 18, color: '#64748b' }} />
            <Typography
              sx={{
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#334155',
              }}
            >
              {viewingArchived ? 'Archived Exams' : 'Available Exams'}
            </Typography>
          </Box>
        </Box>

        {/* Exam list */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {exams.map((exam) => {
            const isActive = String(exam.id) === String(selectedExamId);
            return (
              <Box
                key={exam.id}
                onClick={() => setSelectedExamId(exam.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2.5,
                  py: 1.8,
                  cursor: 'pointer',
                  borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                  bgcolor: isActive ? '#f0f6ff' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: isActive ? '#f0f6ff' : '#f8fafc' },
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#3b82f6' : '#334155',
                    lineHeight: 1.4,
                    pr: 1,
                  }}
                >
                  {exam.exam_name} ({exam.exam_body})
                </Typography>
                <ChevronRight sx={{ fontSize: 20, color: isActive ? '#3b82f6' : '#94a3b8', flexShrink: 0 }} />
              </Box>
            );
          })}

          {exams.length === 0 && (
            <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>
              No exams found.
            </Typography>
          )}
        </Box>

        {/* Toggle archived */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => { setViewingArchived(!viewingArchived); setSelectedExamId(''); }}
            sx={{
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: '0.72rem',
              letterSpacing: '0.04em',
              borderColor: '#cbd5e1',
              color: '#777',
              borderRadius: 2,
              py: 1,
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' },
            }}
          >
            {viewingArchived ? 'View Active Exams' : 'View Archived Exams'}
          </Button>
        </Box>
      </Box>

      {/* ════ RIGHT PANEL ════ */}
      <Box sx={{ flex: 1, p: 3.5, overflowY: 'auto' }}>
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
          /* Empty state */
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
                width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}
            >
              <ShiftSvgIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
              Select an exam from the list
            </Typography>
            <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>
              Choose an exam from the sidebar to view its shifts and schedule.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Title row — exam name left, date dropdown + right */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: '1.5rem' }}>
                    {selectedExam ? `${selectedExam.exam_name} (${selectedExam.exam_body})` : 'Exam'}
                  </Typography>
                  {selectedExam && selectedExam.is_active === false && (
                    <Chip label="Archived" size="small" color="error" variant="filled"
                      sx={{ fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b', mt: 0.5 }}>
                  Showing shifts for {selectedExam?.exam_name || 'this exam'}.
                </Typography>
              </Box>

              {/* Date dropdown — far right */}
              {availableDates.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="shift-date-label">Exam Date</InputLabel>
                    <Select
                      labelId="shift-date-label"
                      value={selectedDate}
                      label="Exam Date"
                      onChange={(e) => setSelectedDate(e.target.value)}
                      sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#fff' }}
                    >
                      {availableDates.map((date) => (
                        <MenuItem key={date} value={date}>
                          {formatDateLabel(date)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>

            {/* Shift cards */}
            {shifts.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {shifts.map((shift) => (
                  <Box
                    key={shift.id}
                    sx={{
                      bgcolor: '#ffffff',
                      borderRadius: 3,
                      border: '1px solid #e8ecf1',
                      p: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'box-shadow 0.2s ease',
                      '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
                    }}
                  >
                    {/* Left: icon + name + time */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box
                        sx={{
                          width: 48, height: 48, borderRadius: '50%',
                          bgcolor: '#f1f5f9', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        <AccessTime sx={{ fontSize: 26, color: '#64748b' }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                          {shift.shift_name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                          {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Right: ACTIVE / INACTIVE badge — blue outlined */}
                    <Chip
                      label={shift.is_active ? 'Active' : 'Inactive'}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        // borderColor: shift.is_active ? '#3b82f6' : '#94a3b8',
                        border: 'none',
                        color: shift.is_active ? '#1c53ca' : '#64748b',
                        height: 24,
                        bgcolor: '#e8ecfe',
                        borderRadius: '10px',
                      }}
                    />
                  </Box>
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  textAlign: 'center', py: 8, bgcolor: '#fff',
                  borderRadius: 3, border: '1px solid #e8ecf1',
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

export default Shifts;
