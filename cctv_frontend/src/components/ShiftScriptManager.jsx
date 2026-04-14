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
    CircularProgress,
    FormControl,
    InputLabel,
    Select
} from '@mui/material';
import {
    Add,
    Delete,
    Edit,
    Schedule
} from '@mui/icons-material';
import { shiftScriptsAPI, scriptsAPI, executionsAPI } from '../services/api';
import ExecutionStatusBadge from './ExecutionStatusBadge';

/**
 * ShiftScriptManager
 *
 * Props:
 *  - shift, examId, onUpdate          — original props
 *  - renderInline  (default true)     — when false, only renders the dialog (no Paper/list UI)
 *  - openDialog    (external)         — parent-controlled dialog open state (used when renderInline=false)
 *  - onCloseDialog                    — callback when dialog should close (used when renderInline=false)
 *  - onScriptNamesReady(assignments)  — called with the active-assignment array so parent can render chips
 */
const ShiftScriptManager = ({
    shift,
    examId,
    onUpdate,
    renderInline = true,
    openDialog: externalOpenDialog,
    onCloseDialog: externalOnCloseDialog,
    onScriptNamesReady,
}) => {
    const [assignments, setAssignments] = useState([]);
    const [scripts, setScripts] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [internalOpenDialog, setInternalOpenDialog] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState(null);
    const [formData, setFormData] = useState({
        script_id: '',
        custom_start_time: '',
        custom_end_time: '',
        notes: ''
    });
    const [error, setError] = useState('');

    /* ── Resolve dialog open state ── */
    const isDialogOpen = renderInline ? internalOpenDialog : !!externalOpenDialog;

    useEffect(() => {
        if (shift) {
            loadScripts();
            loadAssignments();
            if (renderInline) loadExecutions();
        } else {
            setSelectedDate('');
        }
    }, [shift]);

    useEffect(() => {
        const activeAssignments = assignments.filter((assignment) => assignment.is_active);
        const dates = [...new Set(activeAssignments.map((assignment) => assignment.assignment_date).filter(Boolean))].sort();

        if (dates.length === 0) {
            if (selectedDate) {
                setSelectedDate('');
            }
            return;
        }

        if (!selectedDate || !dates.includes(selectedDate)) {
            const today = new Date().toISOString().split('T')[0];
            if (dates.includes(today)) {
                setSelectedDate(today);
            } else {
                setSelectedDate(dates[0]);
            }
        }
    }, [assignments, selectedDate]);

    /* ── Report script data to parent ── */
    useEffect(() => {
        if (onScriptNamesReady) {
            const activeAssignments = assignments.filter((a) => a.is_active);
            onScriptNamesReady(activeAssignments);
        }
    }, [assignments]);

    const activeAssignments = assignments.filter((assignment) => assignment.is_active);
    const availableDates = [...new Set(activeAssignments.map((assignment) => assignment.assignment_date).filter(Boolean))].sort();
    const visibleAssignments = selectedDate
        ? activeAssignments.filter((assignment) => assignment.assignment_date === selectedDate)
        : activeAssignments;

    const formatAssignmentDate = (value) => {
        if (!value) return 'No date';
        const parts = String(value).split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return value;
    };

    const loadScripts = async () => {
        try {
            const response = await scriptsAPI.getAll({ is_active: true });
            const scriptList = Array.isArray(response?.data?.data) ? response.data.data : [];
            setScripts(scriptList);
        } catch (error) {
            console.error('Error loading scripts:', error);
        }
    };

    const loadAssignments = async () => {
        if (!shift?.id) return;
        setLoading(true);
        try {
            const response = await shiftScriptsAPI.getByShift(shift.id);
            const assignmentList = Array.isArray(response?.data?.data) ? response.data.data : [];
            setAssignments(assignmentList);
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
            const executionList = Array.isArray(response?.data?.data) ? response.data.data : [];
            setExecutions(executionList);
        } catch (error) {
            console.error('Error loading executions:', error);
            setExecutions([]);
        }
    };

    const handleOpenDialog = (assignment = null) => {
        if (assignment) {
            setEditingAssignment(assignment);
            setFormData({
                script_id: assignment.script_id,
                custom_start_time: assignment.custom_start_time || '',
                custom_end_time: assignment.custom_end_time || '',
                notes: assignment.notes || ''
            });
        } else {
            setEditingAssignment(null);
            setFormData({
                script_id: '',
                custom_start_time: '',
                custom_end_time: '',
                notes: ''
            });
        }
        if (renderInline) {
            setInternalOpenDialog(true);
        }
        setError('');
    };

    const handleCloseDialog = () => {
        if (renderInline) {
            setInternalOpenDialog(false);
        } else if (externalOnCloseDialog) {
            externalOnCloseDialog();
        }
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
        if (!formData.custom_start_time || !formData.custom_end_time) {
            setError('Custom start and end time are required');
            return;
        }

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

    /* ── Shared Dialog JSX ── */
    const dialogJSX = (
        <Dialog open={isDialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
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
                                    Keyword: {script.script_id}
                                </Typography>
                            </Box>
                        </MenuItem>
                    ))}
                </TextField>
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
                        required
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
                        required
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
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={!formData.script_id || !formData.custom_start_time || !formData.custom_end_time}
                >
                    {editingAssignment ? 'Update' : 'Assign'}
                </Button>
            </DialogActions>
        </Dialog>
    );

    /* ════════════════════════════════════════════
       MODE 1 — Dialog-only (renderInline = false)
       The parent (Analytics.jsx) handles the card UI.
       We only render the dialog.
       ════════════════════════════════════════════ */
    if (!renderInline) {
        return dialogJSX;
    }

    /* ════════════════════════════════════════════
       MODE 2 — Full inline UI (original behaviour)
       ════════════════════════════════════════════ */
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

                {availableDates.length > 0 && (
                    <Box mb={2} display="flex" gap={2} alignItems={{ xs: 'stretch', sm: 'center' }} flexDirection={{ xs: 'column', sm: 'row' }}>
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel id="assignment-date-label">Assignment Date</InputLabel>
                            <Select
                                labelId="assignment-date-label"
                                value={selectedDate}
                                label="Assignment Date"
                                onChange={(e) => setSelectedDate(e.target.value)}
                            >
                                {availableDates.map((date) => (
                                    <MenuItem key={date} value={date}>
                                        {formatAssignmentDate(date)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Chip
                            label={`${visibleAssignments.length} script${visibleAssignments.length === 1 ? '' : 's'} on ${formatAssignmentDate(selectedDate)}`}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                )}

                {loading ? (
                    <Box display="flex" justifyContent="center" py={2}>
                        <CircularProgress size={24} />
                    </Box>
                ) : visibleAssignments.length > 0 ? (
                    <List>
                        {visibleAssignments.map((assignment) => (
                            <ListItem key={assignment.id} divider>
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="body1" fontWeight="medium">
                                                {assignment.script?.name || 'Unknown Script'}
                                            </Typography>

                                            {assignment.script?.script_id && (
                                                <Chip
                                                    label={assignment.script.script_id}
                                                    size="small"
                                                    color="secondary"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Box mt={0.5}>
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
                        {availableDates.length > 0
                            ? `No scripts assigned for ${formatAssignmentDate(selectedDate)}.`
                            : 'No scripts assigned to this shift. Click "Add Script" to assign one.'}
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

            {dialogJSX}
        </Box>
    );
};

export default ShiftScriptManager;
