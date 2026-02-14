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
import { analyticsAPI, examsAPI } from '../services/api';

const Analytics = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');
  
  const [tasks, setTasks] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(examId || '');
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [formData, setFormData] = useState({
    task_name: '',
    description: '',
    script_path: '',
    frequency_minutes: '',
    duration_minutes: '',
    start_time: '',
    end_time: '',
  });
  const [error, setError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExam) {
      loadTasks();
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

  const loadTasks = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const response = await analyticsAPI.getByExam(selectedExam, { is_active: true });
      setTasks(response.data.data);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        task_name: task.task_name,
        description: task.description || '',
        script_path: task.script_path,
        frequency_minutes: task.frequency_minutes,
        duration_minutes: task.duration_minutes || '',
        start_time: task.start_time || '',
        end_time: task.end_time || '',
      });
    } else {
      setEditingTask(null);
      setFormData({
        task_name: '',
        description: '',
        script_path: '',
        frequency_minutes: '',
        duration_minutes: '',
        start_time: '',
        end_time: '',
      });
    }
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingTask(null);
    setError('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    if (!selectedExam) {
      setError('Please select an exam first');
      return;
    }
    
    try {
      if (editingTask) {
        await analyticsAPI.update(editingTask.id, formData);
      } else {
        await analyticsAPI.create(selectedExam, formData);
      }
      handleCloseDialog();
      loadTasks();
    } catch (error) {
      setError(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await analyticsAPI.delete(id);
        loadTasks();
      } catch (error) {
        alert('Failed to delete task');
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
      const response = await analyticsAPI.uploadExcel(selectedExam, uploadFile);
      setUploadResult(response.data);
      setOpenUploadDialog(false);
      setUploadFile(null);
      loadTasks();
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
            Analytics Tasks
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Configure monitoring scripts and execution parameters
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
            Add Task
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
          Successfully imported {uploadResult.count} analytics tasks
          {uploadResult.errors?.length > 0 && ` (${uploadResult.errors.length} errors)`}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : tasks.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Task Name</strong></TableCell>
                <TableCell><strong>Script Path</strong></TableCell>
                <TableCell><strong>Frequency</strong></TableCell>
                <TableCell><strong>Duration</strong></TableCell>
                <TableCell><strong>Time Window</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {task.task_name}
                    </Typography>
                    {task.description && (
                      <Typography variant="caption" color="text.secondary">
                        {task.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{task.script_path}</TableCell>
                  <TableCell>
                    <Chip label={`Every ${task.frequency_minutes} min`} size="small" color="primary" />
                  </TableCell>
                  <TableCell>{task.duration_minutes ? `${task.duration_minutes} min` : '-'}</TableCell>
                  <TableCell>
                    {task.start_time && task.end_time
                      ? `${task.start_time} - ${task.end_time}`
                      : 'Always'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenDialog(task)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(task.id)}>
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
            {selectedExam ? 'No analytics tasks found. Add tasks or upload an Excel file.' : 'Please select an exam to view tasks.'}
          </Typography>
        </Paper>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTask ? 'Edit Analytics Task' : 'Add Analytics Task'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Task Name"
            name="task_name"
            value={formData.task_name}
            onChange={handleChange}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            margin="normal"
            multiline
            rows={2}
          />
          <TextField
            fullWidth
            label="Script Path"
            name="script_path"
            value={formData.script_path}
            onChange={handleChange}
            margin="normal"
            required
            placeholder="intrusion_detect.py"
          />
          <TextField
            fullWidth
            type="number"
            label="Frequency (minutes)"
            name="frequency_minutes"
            value={formData.frequency_minutes}
            onChange={handleChange}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            type="number"
            label="Duration (minutes)"
            name="duration_minutes"
            value={formData.duration_minutes}
            onChange={handleChange}
            margin="normal"
          />
          <Box display="flex" gap={2}>
            <TextField
              type="time"
              label="Start Time"
              name="start_time"
              value={formData.start_time}
              onChange={handleChange}
              margin="normal"
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              type="time"
              label="End Time"
              name="end_time"
              value={formData.end_time}
              onChange={handleChange}
              margin="normal"
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingTask ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={openUploadDialog} onClose={() => setOpenUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Analytics Tasks Excel</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload an Excel file with columns: task_name, script_path, frequency_minutes, start_time, end_time
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

export default Analytics;
