import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    Chip,
    Alert,
    Divider,
    CircularProgress
} from '@mui/material';
import {
    Add,
    Delete,
    Edit,
    Schedule
} from '@mui/icons-material';
import { shiftScriptsAPI, scriptsAPI, executionsAPI } from '../services/api';
import ExecutionStatusBadge from './ExecutionStatusBadge';

const ShiftScriptManager = ({ shift, examId, onUpdate }) => {
    const [assignments, setAssignments] = useState([]);
    const [scripts, setScripts] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState(null);
    const [formData, setFormData] = useState({
        script_id: '',
        custom_frequency_minutes: '',
        custom_start_time: '',
        custom_end_time: '',
        notes: ''
    });
    const [error, setError] = useState('');

    useEffect(() => {
        if (shift) {
            loadScripts();
            loadAssignments();
            loadExecutions();
        }
    }, [shift]);

    const loadScripts = async () => {
        try {
            const response = await scriptsAPI.getAll({ is_active: true });
            setScripts(response.data.data);
        } catch (error) {
            console.error('Error loading scripts:', error);
        }
    };

    const loadAssignments = async () => {
        if (!shift?.id) return;
        setLoading(true);
        try {
            const response = await shiftScriptsAPI.getByShift(shift.id);
            setAssignments(response.data.data);
        } catch (error) {
            console.error('Error loading assignments:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadExecutions = async () => {
        if (!shift?.id) return;
        try {
            const response = await executionsAPI.getByShift(shift.id, { limit: 10 });
            setExecutions(response.data.data);
        } catch (error) {
            console.error('Error loading executions:', error);
        }
    };

    const handleOpenDialog = (assignment = null) => {
        if (assignment) {
            setEditingAssignment(assignment);
            setFormData({
                script_id: assignment.script_id,
                custom_frequency_minutes: assignment.custom_frequency_minutes || '',
                custom_start_time: assignment.custom_start_time || '',
                custom_end_time: assignment.custom_end_time || '',
                notes: assignment.notes || ''
            });
        } else {
            setEditingAssignment(null);
            setFormData({
                script_id: '',
                custom_frequency_minutes: '',
                custom_start_time: '',
                custom_end_time: '',
                notes: ''
            });
        }
        setOpenDialog(true);
        setError('');
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingAssignment(null);
        setError('');
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async () => {
        try {
            if (editingAssignment) {
                await shiftScriptsAPI.update(editingAssignment.id, formData);
            } else {
                await shiftScriptsAPI.assign(shift.id, formData);
            }
            handleCloseDialog();
            loadAssignments();
            if (onUpdate) onUpdate();
        } catch (error) {
            setError(error.response?.data?.message || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to remove this script assignment?')) {
            try {
                await shiftScriptsAPI.delete(id);
                loadAssignments();
                if (onUpdate) onUpdate();
            } catch (error) {
                alert('Failed to delete assignment');
            }
        }
    };

    if (!shift) {
        return (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">
                    Select a shift to manage scripts
                </Typography>
            </Paper>
        );
    }

    return (
        <Box>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">
                            {shift.shift_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => handleOpenDialog()}
                        size="small"
                    >
                        Add Script
                    </Button>
                </Box>

                <Divider sx={{ my: 2 }} />

                {loading ? (
                    <Box display="flex" justifyContent="center" py={2}>
                        <CircularProgress size={24} />
                    </Box>
                ) : assignments.length > 0 ? (
                    <List>
                        {assignments
                            .filter((assignment) => assignment.is_active)
                            .map((assignment) => (
                                <ListItem key={assignment.id} divider>
                                    <ListItemText
                                        primary={
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Typography variant="body1" fontWeight="medium">
                                                    {assignment.script?.name || 'Unknown Script'}
                                                </Typography>

                                                {assignment.script?.category && (
                                                    <Chip
                                                        label={assignment.script.category}
                                                        size="small"
                                                        color="secondary"
                                                        variant="outlined"
                                                    />
                                                )}

                                                <Chip
                                                    label={`Every ${assignment.custom_frequency_minutes ||
                                                        assignment.script?.default_frequency_minutes ||
                                                        '?'
                                                        } min`}
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                            </Box>
                                        }
                                        secondary={
                                            <Box mt={0.5}>
                                                <Typography variant="caption" display="block">
                                                    {assignment.script?.script_path}
                                                </Typography>

                                                {(assignment.custom_start_time || assignment.custom_end_time) && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Custom Time: {assignment.custom_start_time || 'N/A'} -{' '}
                                                        {assignment.custom_end_time || 'N/A'}
                                                    </Typography>
                                                )}

                                                {assignment.notes && (
                                                    <Typography
                                                        variant="caption"
                                                        display="block"
                                                        color="text.secondary"
                                                        sx={{ mt: 0.5 }}
                                                    >
                                                        Note: {assignment.notes}
                                                    </Typography>
                                                )}
                                            </Box>
                                        }
                                    />

                                    <ListItemSecondaryAction>
                                        <IconButton size="small" onClick={() => handleOpenDialog(assignment)}>
                                            <Edit fontSize="small" />
                                        </IconButton>

                                        <IconButton size="small" onClick={() => handleDelete(assignment.id)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                    </List>
                ) : (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                        No scripts assigned to this shift. Click "Add Script" to assign one.
                    </Typography>
                )}
            </Paper>

            {executions.length > 0 && (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" mb={2}>
                        Recent Executions
                    </Typography>
                    <List dense>
                        {executions.slice(0, 5).map((execution) => (
                            <ListItem key={execution.id}>
                                <ListItemText
                                    primary={execution.script?.name || execution.execution_metadata?.script_name || 'Script'}
                                    secondary={new Date(execution.scheduled_time).toLocaleString()}
                                />
                                <ExecutionStatusBadge status={execution.status} size="small" />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingAssignment ? 'Edit Script Assignment' : 'Assign Script to Shift'}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        select
                        fullWidth
                        label="Select Script"
                        name="script_id"
                        value={formData.script_id}
                        onChange={handleChange}
                        margin="normal"
                        required
                        disabled={!!editingAssignment}
                    >
                        <MenuItem value="">Select a script</MenuItem>
                        {scripts.map((script) => (
                            <MenuItem key={script.id} value={script.id}>
                                <Box>
                                    <Typography variant="body2">{script.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {script.category} • {script.script_path}
                                    </Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        fullWidth
                        type="number"
                        label="Custom Frequency (minutes)"
                        name="custom_frequency_minutes"
                        value={formData.custom_frequency_minutes}
                        onChange={handleChange}
                        margin="normal"
                        helperText="Leave empty to use script's default frequency"
                    />
                    <Box display="flex" gap={2}>
                        <TextField
                            type="time"
                            label="Custom Start Time"
                            name="custom_start_time"
                            value={formData.custom_start_time}
                            onChange={handleChange}
                            margin="normal"
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            helperText="Override start time for this shift"
                        />
                        <TextField
                            type="time"
                            label="Custom End Time"
                            name="custom_end_time"
                            value={formData.custom_end_time}
                            onChange={handleChange}
                            margin="normal"
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            helperText="Override end time for this shift"
                        />
                    </Box>
                    <TextField
                        fullWidth
                        multiline
                        rows={2}
                        label="Notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        margin="normal"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!formData.script_id}>
                        {editingAssignment ? 'Update' : 'Assign'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ShiftScriptManager;
