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
  Upload,
  CloudUpload,
} from '@mui/icons-material';
import { camerasAPI, examsAPI } from '../services/api';

const Cameras = () => {
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam');
  
  const [cameras, setCameras] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(examId || '');
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [formData, setFormData] = useState({
    camera_id: '',
    stream_url: '',
    stream_type: 'RTSP',
    location: '',
  });
  const [error, setError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExam) {
      loadCameras();
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

  const loadCameras = async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const response = await camerasAPI.getByExam(selectedExam, { is_active: true });
      setCameras(response.data.data);
    } catch (error) {
      console.error('Error loading cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (camera = null) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData({
        camera_id: camera.camera_id,
        stream_url: camera.stream_url,
        stream_type: camera.stream_type,
        location: camera.location || '',
      });
    } else {
      setEditingCamera(null);
      setFormData({
        camera_id: '',
        stream_url: '',
        stream_type: 'RTSP',
        location: '',
      });
    }
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingCamera(null);
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
      if (editingCamera) {
        await camerasAPI.update(editingCamera.id, formData);
      } else {
        await camerasAPI.create(selectedExam, formData);
      }
      handleCloseDialog();
      loadCameras();
    } catch (error) {
      setError(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this camera?')) {
      try {
        await camerasAPI.delete(id);
        loadCameras();
      } catch (error) {
        alert('Failed to delete camera');
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
      const response = await camerasAPI.uploadExcel(selectedExam, uploadFile);
      setUploadResult(response.data);
      setOpenUploadDialog(false);
      setUploadFile(null);
      loadCameras();
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
            Camera Links
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage CCTV camera stream URLs
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
            Add Camera
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
          Successfully imported {uploadResult.count} camera links
          {uploadResult.errors?.length > 0 && ` (${uploadResult.errors.length} errors)`}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : cameras.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Camera ID</strong></TableCell>
                <TableCell><strong>Stream URL</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Location</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cameras.map((camera) => (
                <TableRow key={camera.id}>
                  <TableCell>{camera.camera_id}</TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {camera.stream_url}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={camera.stream_type}
                      size="small"
                      color={camera.stream_type === 'RTSP' ? 'primary' : 'secondary'}
                    />
                  </TableCell>
                  <TableCell>{camera.location || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenDialog(camera)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(camera.id)}>
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
            {selectedExam ? 'No cameras found. Add cameras or upload an Excel file.' : 'Please select an exam to view cameras.'}
          </Typography>
        </Paper>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCamera ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Camera ID"
            name="camera_id"
            value={formData.camera_id}
            onChange={handleChange}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Stream URL"
            name="stream_url"
            value={formData.stream_url}
            onChange={handleChange}
            margin="normal"
            required
            placeholder="rtsp://192.168.1.100:554/stream"
          />
          <TextField
            fullWidth
            select
            label="Stream Type"
            name="stream_type"
            value={formData.stream_type}
            onChange={handleChange}
            margin="normal"
            required
          >
            <MenuItem value="RTSP">RTSP</MenuItem>
            <MenuItem value="HLS">HLS</MenuItem>
          </TextField>
          <TextField
            fullWidth
            label="Location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            margin="normal"
            placeholder="Room 101, Building A"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingCamera ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={openUploadDialog} onClose={() => setOpenUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Camera Links Excel</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload an Excel file with columns: camera_id, stream_url, location
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

export default Cameras;
