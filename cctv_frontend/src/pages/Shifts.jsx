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
  AccessTime,
} from '@mui/icons-material';
import { examsAPI } from '../services/api';

const Shifts = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');

  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(examId || '');
  const [shifts, setShifts] = useState([]);
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

  const loadShifts = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const response = await examsAPI.getById(selectedExam);
      setShifts(response.data.data.examShifts || []);
    } catch (error) {
      console.error('Error loading shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedExamData = exams.find(e => String(e.id) === String(selectedExam));

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Exam Shifts
          </Typography>
          <Typography variant="body1" color="text.secondary">
            View shifts defined for each exam
          </Typography>
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

      {/* Date Range Info */}
      {selectedExamData && selectedExamData.start_date && selectedExamData.end_date && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
          <Typography variant="body2" fontWeight="bold">
            Exam Period: {new Date(selectedExamData.start_date).toLocaleDateString()} — {new Date(selectedExamData.end_date).toLocaleDateString()}
          </Typography>
          {selectedExamData.skip_days?.length > 0 && (
            <Box mt={0.5} display="flex" gap={0.5} flexWrap="wrap">
              <Typography variant="caption" color="text.secondary">
                Skip Days:
              </Typography>
              {selectedExamData.skip_days.map((day) => (
                <Chip key={day} label={day} size="small" variant="outlined" color="warning" sx={{ height: 20 }} />
              ))}
            </Box>
          )}
        </Paper>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : shifts.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Shift Name</strong></TableCell>
                <TableCell><strong>Start Time</strong></TableCell>
                <TableCell><strong>End Time</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <AccessTime fontSize="small" color="primary" />
                      {shift.shift_name}
                    </Box>
                  </TableCell>
                  <TableCell>{shift.start_time?.substring(0, 5)}</TableCell>
                  <TableCell>{shift.end_time?.substring(0, 5)}</TableCell>
                  <TableCell>
                    <Chip
                      label={shift.is_active ? 'Active' : 'Inactive'}
                      size="small"
                      color={shift.is_active ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            {selectedExam ? 'No shifts found. Add shifts from the Exams page.' : 'Please select an exam to view shifts.'}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default Shifts;
