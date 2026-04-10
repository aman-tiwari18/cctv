import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  AccessTime,
  Refresh,
} from '@mui/icons-material';
import { examsAPI } from '../services/api';
import ShiftScriptManager from '../components/ShiftScriptManager';

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');

  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(examId || '');
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExam) {
      loadShifts();
    } else {
      setShifts([]);
      setSelectedShift(null);
    }
  }, [selectedExam]);

  const loadExams = async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      const examList = Array.isArray(response?.data?.data) ? response.data.data : [];
      setExams(examList);
      if (examId && examList.length > 0) {
        setSelectedExam(examId);
      }
    } catch (error) {
      console.error('Error loading exams:', error);
      setError('Failed to load exams');
    }
  };

  const loadShifts = async () => {
    if (!selectedExam) return;
    setLoading(true);
    setError('');
    try {
      const response = await examsAPI.getById(selectedExam);
      const shiftList = Array.isArray(response?.data?.data?.examShifts)
        ? response.data.data.examShifts
        : [];
      setShifts(shiftList);
    } catch (error) {
      console.error('Error loading shifts:', error);
      setError('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const handleShiftSelect = (shift) => {
    setSelectedShift(shift);
  };

  const handleRefresh = () => {
    loadShifts();
    if (selectedShift) {
      // Refresh the selected shift to update execution status
      setSelectedShift({ ...selectedShift });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          {/* <Typography variant="h4" fontWeight="bold" gutterBottom>
            Script Scheduling
          </Typography> */}
          <Typography variant="body1" color="text.secondary" fontSize="0.9rem">
            Manage script assignments for exam shifts
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={handleRefresh}
          disabled={!selectedExam}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

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

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : selectedExam ? (
        <Grid container spacing={3}>
          {/* Left Panel - Shifts */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2, maxHeight: '70vh', overflow: 'auto' }}>
              <Typography variant="h6" fontWeight="bold" mb={2}>
                Exam Shifts
              </Typography>

              {shifts.length > 0 ? (
                <Box display="flex" flexDirection="column" gap={1}>
                  {shifts.map((shift) => (
                    <Card
                      key={shift.id}
                      variant="outlined"
                      sx={{
                        cursor: 'pointer',
                        bgcolor: selectedShift?.id === shift.id ? 'action.selected' : 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                      onClick={() => handleShiftSelect(shift)}
                    >
                      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="body1" fontWeight="medium">
                              {shift.shift_name}
                            </Typography>
                            <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                              <AccessTime fontSize="small" sx={{ fontSize: 16 }} />
                              <Typography variant="caption" color="text.secondary">
                                {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                              </Typography>
                            </Box>
                          </Box>
                          {selectedShift?.id === shift.id && (
                            <Chip label="Selected" size="small" color="primary" />
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                  No shifts found for this exam. Add shifts in the Exams page.
                </Typography>
              )}
            </Paper>
          </Grid>

          {/* Right Panel - Shift Script Manager */}
          <Grid item xs={12} md={7}>
            <ShiftScriptManager
              shift={selectedShift}
              examId={selectedExam}
              onUpdate={handleRefresh}
            />
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Please select an exam to view and manage script schedules
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default Analytics;
