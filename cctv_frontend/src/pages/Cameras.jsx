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

  const [examLinkType, setExamLinkType] = useState(null);

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
      setExamLinkType(response.data.linkType);
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
        tc_name: camera.tc_name || '',
        tc_code: camera.tc_code || '',
        camera_name: camera.camera_name || '',
        url: camera.url || '',
        camera_category: camera.camera_category || '',
        ...(examLinkType === 'HLS' ? {
          date_of_assessment: camera.date_of_assessment || '',
          shift_of_assessment: camera.shift_of_assessment || '',
        } : {
          city: camera.city || '',
          state: camera.state || '',
        })
      });
    } else {
      setEditingCamera(null);
      setFormData({
        tc_name: '',
        tc_code: '',
        camera_name: '',
        url: '',
        camera_category: '',
        ...(examLinkType === 'HLS' ? {
          date_of_assessment: '',
          shift_of_assessment: '',
        } : {
          city: '',
          state: '',
        })
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
        await camerasAPI.update(editingCamera.id, formData, selectedExam);
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
        await camerasAPI.delete(id, selectedExam);
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

  const selectedExamData = exams.find((e) => e.id === Number(selectedExam));
  const currentLinkType = examLinkType || selectedExamData?.link_type || 'Unknown';

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Camera Links
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage CCTV camera stream URLs {selectedExamData && `(${currentLinkType})`}
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
              {exam.exam_name} ({exam.exam_body}) - {exam.link_type}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {uploadResult && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setUploadResult(null)}>
          {uploadResult.message || `Successfully imported camera links`}
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
                <TableCell><strong>TC Name</strong></TableCell>
                <TableCell><strong>TC Code</strong></TableCell>
                <TableCell><strong>Camera Name</strong></TableCell>
                {examLinkType === 'HLS' && (
                  <>
                    <TableCell><strong>Date of Assessment</strong></TableCell>
                    <TableCell><strong>Shift</strong></TableCell>
                  </>
                )}
                {examLinkType === 'RTSP' && (
                  <>
                    <TableCell><strong>City</strong></TableCell>
                    <TableCell><strong>State</strong></TableCell>
                  </>
                )}
                <TableCell><strong>Category</strong></TableCell>
                <TableCell><strong>URL</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cameras.map((camera) => (
                <TableRow key={camera.id}>
                  <TableCell>{camera.tc_name || '-'}</TableCell>
                  <TableCell>{camera.tc_code || '-'}</TableCell>
                  <TableCell>{camera.camera_name || '-'}</TableCell>
                  {examLinkType === 'HLS' && (
                    <>
                      <TableCell>{camera.date_of_assessment || '-'}</TableCell>
                      <TableCell>{camera.shift_of_assessment || '-'}</TableCell>
                    </>
                  )}
                  {examLinkType === 'RTSP' && (
                    <>
                      <TableCell>{camera.city || '-'}</TableCell>
                      <TableCell>{camera.state || '-'}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <Chip
                      label={camera.camera_category || 'N/A'}
                      size="small"
                      color="default"
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={camera.url}>
                    {camera.url}
                  </TableCell>
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
             label="TC Name"
             name="tc_name"
             value={formData.tc_name}
             onChange={handleChange}
             margin="normal"
           />
           <TextField
             fullWidth
             label="TC Code"
             name="tc_code"
             value={formData.tc_code}
             onChange={handleChange}
             margin="normal"
           />
           <TextField
             fullWidth
             label="Camera Name"
             name="camera_name"
             value={formData.camera_name}
             onChange={handleChange}
             margin="normal"
           />
           <TextField
             fullWidth
             label="Camera Category"
             name="camera_category"
             value={formData.camera_category}
             onChange={handleChange}
             margin="normal"
           />
           
           {currentLinkType === 'HLS' && (
             <>
               <TextField
                 fullWidth
                 label="Date of Assessment"
                 name="date_of_assessment"
                 value={formData.date_of_assessment}
                 onChange={handleChange}
                 margin="normal"
                 placeholder="YYYY-MM-DD"
               />
               <TextField
                 fullWidth
                 label="Shift of Assessment"
                 name="shift_of_assessment"
                 value={formData.shift_of_assessment}
                 onChange={handleChange}
                 margin="normal"
               />
             </>
           )}

           {currentLinkType === 'RTSP' && (
             <>
               <TextField
                 fullWidth
                 label="City"
                 name="city"
                 value={formData.city}
                 onChange={handleChange}
                 margin="normal"
               />
               <TextField
                 fullWidth
                 label="State"
                 name="state"
                 value={formData.state}
                 onChange={handleChange}
                 margin="normal"
               />
             </>
           )}

          <TextField
            fullWidth
            label="Stream URL"
            name="url"
            value={formData.url}
            onChange={handleChange}
            margin="normal"
            required
            placeholder={currentLinkType === 'RTSP' ? "rtsp://192.168.1.100:554/stream" : "https://domain.com/stream.m3u8"}
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
            {currentLinkType === 'HLS' 
              ? "Upload an Excel file with columns: TC Name, TC code, Camera Name, Date of Assessment, Shift of Assessment, URL, camera category" 
              : "Upload an Excel file with columns: TC Name, TC Code, Camera Name, City, State, URL, camera category"}
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
