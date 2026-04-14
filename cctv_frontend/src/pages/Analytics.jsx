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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Badge,
} from '@mui/material';
import {
  AccessTime,
  Refresh,
  ChevronRight,
  Description as DescriptionIcon,
  Add,
  Close,
} from '@mui/icons-material';
import { examsAPI, shiftScriptsAPI } from '../services/api';
import ShiftScriptManager from '../components/ShiftScriptManager';

/* ── Script chip colors keyed by script_id (exact TYPE_META from Detections.jsx) ── */
const SCRIPT_COLORS = {
  proximity: { bg: '#e5f5ed', color: '#5cb88a' },
  crowd: { bg: '#fce4ec', color: '#e24d7b' },
  crowd_five: { bg: '#fce8e6', color: '#e06050' },
  crowd_zero: { bg: '#edeaf3', color: '#6b5b95' },
  server: { bg: '#f3ebe4', color: '#a0623d' },
  intruder: { bg: '#fce4ea', color: '#d94466' },
  entry_exit: { bg: '#e0f0f0', color: '#1d7a7d' },
  phone: { bg: '#e8ece5', color: '#465a38' },
  blind_spot: { bg: '#f3f2e4', color: '#b0a850' },
  invigilator: { bg: '#e0f7fa', color: '#00bfcf' },
  inversion: { bg: '#eceef5', color: '#7a86b4' },
  tamper: { bg: '#e0f8fa', color: '#00c8d4' },
};
const DEFAULT_CHIP_COLOR = { bg: '#dbeafe', color: '#3b82f6' };

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parts = String(value).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
};

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(examId || '');
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── Dialog state lifted ── */
  const [openShiftDialogId, setOpenShiftDialogId] = useState(null);
  /* Track full assignment objects per shift */
  const [shiftAssignments, setShiftAssignments] = useState({});
  /* ── Global date filter ── */
  const [selectedDate, setSelectedDate] = useState('');
  /* ── Archived Exams Toggle ── */
  const [viewingArchived, setViewingArchived] = useState(false);

  useEffect(() => {
    loadExams();
  }, [viewingArchived]);

  useEffect(() => {
    if (selectedExamId) {
      loadShifts();
      setShiftAssignments({});
      setSelectedDate('');
    } else {
      setShifts([]);
      setShiftAssignments({});
      setSelectedDate('');
    }
  }, [selectedExamId]);

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: !viewingArchived });
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
      setShifts(shiftList);
    } catch (err) {
      console.error('Error loading shifts:', err);
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadShifts();
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (window.confirm('Are you sure you want to remove this script assignment?')) {
      try {
        await shiftScriptsAPI.delete(assignmentId);
        handleRefresh();
      } catch (error) {
        alert('Failed to delete assignment');
      }
    }
  };

  const handleAssignmentsReady = useCallback((shiftId, assignmentList) => {
    setShiftAssignments((prev) => ({ ...prev, [shiftId]: assignmentList }));
  }, []);

  const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));

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
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(availableDates.includes(today) ? today : availableDates[0]);
    }
  }, [availableDates]);

  /* ── Helper: filter assignments for a shift by selected date ── */
  const getFilteredAssignments = (shiftId) => {
    const all = shiftAssignments[shiftId] || [];
    if (!selectedDate) return all;
    return all.filter((a) => a.assignment_date === selectedDate);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>

      {/* ════════════════════════════════════
          LEFT SIDEBAR — Exam List
         ════════════════════════════════════ */}
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
            <DescriptionIcon sx={{ fontSize: 18, color: '#64748b' }} />
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

        {/* Exam items */}
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
                <ChevronRight
                  sx={{
                    fontSize: 20,
                    color: isActive ? '#3b82f6' : '#94a3b8',
                    flexShrink: 0,
                  }}
                />
              </Box>
            );
          })}
        </Box>

        {/* Bottom button */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => {
              setViewingArchived(!viewingArchived);
              setSelectedExamId('');
            }}
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

      {/* ════════════════════════════════════
          RIGHT PANEL — Content
         ════════════════════════════════════ */}
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
              <DescriptionIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
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
          /* ── Exam detail ── */
          <>
            {/* Title row + date filter */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a' }}>
                    {selectedExam ? `${selectedExam.exam_name} (${selectedExam.exam_body})` : 'Exam'}
                  </Typography>
                  {selectedExam && selectedExam.is_active === false && (
                    <Chip label="Archived" size="small" color="error" variant="filled" sx={{ fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b', mt: 0.5 }}>
                  Managing shifts and monitoring scripts for {selectedExam?.exam_name || 'this exam'}.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                {availableDates.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="global-date-label">Assignment Date</InputLabel>
                    <Select
                      labelId="global-date-label"
                      value={selectedDate}
                      label="Assignment Date"
                      onChange={(e) => setSelectedDate(e.target.value)}
                      sx={{
                        borderRadius: 2,
                        fontSize: '0.85rem',
                        bgcolor: '#fff',
                      }}
                    >
                      {availableDates.map((date) => (
                        <MenuItem key={date} value={date}>
                          {formatDateLabel(date)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                {/* <IconButton
                  onClick={handleRefresh}
                  sx={{
                    bgcolor: '#f1f5f9',
                    '&:hover': { bgcolor: '#e2e8f0' },
                  }}
                >
                  <Refresh sx={{ fontSize: 20, color: '#64748b' }} />
                </IconButton> */}
              </Box>
            </Box>

            {/* Shift cards */}
            {shifts.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {shifts.map((shift) => {
                  const filteredAssignments = getFilteredAssignments(shift.id);

                  return (
                    <Box
                      key={shift.id}
                      sx={{
                        bgcolor: '#ffffff',
                        borderRadius: 3,
                        border: '1px solid #e8ecf1',
                        p: 2.5,
                        transition: 'box-shadow 0.2s ease',
                        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
                      }}
                    >
                      {/* Top row: icon + name + time  |  + ADD SCRIPT */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {/* Same icon for all shifts */}
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              bgcolor: '#f1f5f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <AccessTime sx={{ fontSize: 28, color: '#64748b' }} />
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

                        <Button
                          variant="contained"
                          startIcon={<Add />}
                          onClick={() => setOpenShiftDialogId(shift.id)}
                          disableElevation
                          sx={{
                            bgcolor: '#3b82f6',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            borderRadius: 2,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            px: 2.5,
                            py: 0.8,
                            '&:hover': { bgcolor: '#2563eb' },
                          }}
                        >
                          Add Script
                        </Button>
                      </Box>

                      {/* Script chips — show ALL for selected date */}
                      {filteredAssignments.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {filteredAssignments.map((assignment, i) => {
                            const name = assignment.script?.name || 'Unknown';
                            const scriptId = assignment.script?.script_id || '';
                            const chipColor = SCRIPT_COLORS[scriptId] || DEFAULT_CHIP_COLOR;
                            const startT = assignment.custom_start_time
                              ? assignment.custom_start_time.substring(0, 5)
                              : null;
                            const endT = assignment.custom_end_time
                              ? assignment.custom_end_time.substring(0, 5)
                              : null;
                            const timeLabel = startT && endT ? `${startT} – ${endT}` : '';

                            return (
                              <Chip
                                key={assignment.id || i}
                                label={
                                  <Box sx={{ textAlign: 'center', lineHeight: 1.3 }}>
                                    <Box sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{name}</Box>
                                    {timeLabel && (
                                      <Box sx={{ fontWeight: 500, fontSize: '0.68rem', opacity: 0.85, mt: '2px', color: '#333' }}>
                                        {timeLabel}
                                      </Box>
                                    )}
                                  </Box>
                                }
                                size="medium"
                                onDelete={() => handleDeleteAssignment(assignment.id)}
                                sx={{
                                  position: 'relative',
                                  bgcolor: chipColor.bg,
                                  color: '#777',
                                  height: 'auto',
                                  py: 0.8,
                                  borderRadius: '16px',
                                  '& .MuiChip-label': { pl: 2, pr: 3.5 },
                                  '& .MuiChip-deleteIcon': {
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    margin: 0,
                                    color: '#777',
                                    fontSize: 16,
                                    '&:hover': { color: chipColor.color, filter: 'brightness(0.8)' }
                                  },
                                  mt: 1.5, // add a bit of top margin to separate rows
                                }}
                              />
                            );
                          })}
                        </Box>
                      )}

                      {/* ShiftScriptManager — dialog-only mode */}
                      <ShiftScriptManager
                        shift={shift}
                        examId={selectedExamId}
                        onUpdate={handleRefresh}
                        openDialog={openShiftDialogId === shift.id}
                        onCloseDialog={() => setOpenShiftDialogId(null)}
                        onScriptNamesReady={(assignments) => handleAssignmentsReady(shift.id, assignments)}
                        renderInline={false}
                      />
                    </Box>
                  );
                })}
              </Box>
            ) : (
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
