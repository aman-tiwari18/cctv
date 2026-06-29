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
    Chip,
    Alert,
    Divider,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    Autocomplete,
} from '@mui/material';
import {
    Add,
    Delete,
    CheckCircle,
    Extension,
    WarningAmber,
    Groups,
    PersonOff,
    Dns,
    DirectionsWalk,
    MeetingRoom,
    Smartphone,
    VisibilityOff,
    Visibility,
    FlipCameraAndroid,
    SecurityUpdateWarning,
} from '@mui/icons-material';
import { shiftScriptsAPI, scriptsAPI, executionsAPI, smsAPI } from '../services/api';
import ExecutionStatusBadge from './ExecutionStatusBadge';

/* ─────────────────────────────────────────────────────────────
   Script meta: icon, iconColor, label, category
   Matches Layout.jsx TYPE_META exactly
───────────────────────────────────────────────────────────────*/
const SCRIPT_META = {
    proximity: {
        label: 'People too close',
        icon: WarningAmber,
        iconColor: '#5cb88a',
        bg: '#e5f5ed',
        color: '#5cb88a',
        category: 'people',
    },
    crowd: {
        label: 'Crowd detected (Entry/Exit)',
        icon: Groups,
        iconColor: '#e24d7b',
        bg: '#e9e3f8ff',
        color: '#e24d7b',
        category: 'people',
    },
    crowd_biometric: {
        label: 'Crowd detected (Biometric)',
        icon: Groups,
        iconColor: '#9333ea',
        bg: '#f3e8ff',
        color: '#9333ea',
        category: 'people',
    },
    crowd_five: {
        label: 'Large crowd detected',
        icon: Groups,
        iconColor: '#e06050',
        bg: '#fce8e6',
        color: '#e06050',
        category: 'people',
    },
    crowd_zero: {
        label: 'No people present',
        icon: PersonOff,
        iconColor: '#6b5b95',
        bg: '#edeaf3',
        color: '#6b5b95',
        category: 'people',
    },
    invigilator: {
        label: 'Supervisor present',
        icon: Visibility,
        iconColor: '#00bfcf',
        bg: '#cce8fcff',
        color: '#00bfcf',
        category: 'people',
    },
    phone: {
        label: 'Phone usage detected',
        icon: Smartphone,
        iconColor: '#465a38',
        bg: '#e8ece5',
        color: '#465a38',
        category: 'people',
    },
    server: {
        label: 'Server room activity',
        icon: Dns,
        iconColor: '#a0623d',
        bg: '#f3ebe4',
        color: '#a0623d',
        category: 'people',
    },
    intruder: {
        label: 'Unknown person detected',
        icon: DirectionsWalk,
        iconColor: '#d94466',
        bg: '#f0dfefff',
        color: '#d94466',
        category: 'people',
    },
    qp_box: {
        label: 'QP Box Not Visible In Strong Room',
        icon: Extension,
        iconColor: '#dc2626',
        bg: '#fee2e2',
        color: '#dc2626',
        category: 'movement',
    },
    entry_exit: {
        label: 'Entry/Exit activity',
        icon: MeetingRoom,
        iconColor: '#1d7a7d',
        bg: '#e0f0f0',
        color: '#1d7a7d',
        category: 'movement',
    },
    strongroom: {
        label: 'Strong Room Movement',
        icon: SecurityUpdateWarning,
        iconColor: '#b91c1c',
        bg: '#fef2f2',
        color: '#b91c1c',
        category: 'movement',
    },
    inversion: {
        label: 'Camera flipped',
        icon: FlipCameraAndroid,
        iconColor: '#7a86b4',
        bg: '#eceef5',
        color: '#7a86b4',
        category: 'camera',
    },
    tampering: {
        label: 'Camera disturbed',
        icon: SecurityUpdateWarning,
        iconColor: '#00c8d4',
        bg: '#e9f9ffff',
        color: '#00c8d4',
        category: 'camera',
    },
    blind_spot: {
        label: 'View blocked',
        icon: VisibilityOff,
        iconColor: '#b0a850',
        bg: '#f3f2e4',
        color: '#b0a850',
        category: 'camera',
    },
    vision: {
        label: 'Vision Detection',
        icon: Visibility,
        iconColor: '#3b82f6',
        bg: '#dbeafe',
        color: '#3b82f6',
        category: 'camera',
    },
};

const CATEGORIES = [
    { key: 'people', label: 'People & Activity' },
    { key: 'movement', label: 'Movement & Alerts' },
    { key: 'camera', label: 'System & Camera' },
];

/**
 * ShiftScriptManager
 * Props:
 *   shift, examId, onUpdate          — original
 *   renderInline  (default true)     — false = dialog only
 *   openDialog    (external)         — parent-controlled open state
 *   onCloseDialog                    — close callback
 *   onScriptNamesReady(assignments)  — pass active assignments to parent
 */
// Scripts whose pushed detections can trigger an SMS alert (DLT-approved
// templates). SMS toggle is only shown for these, and only on exams whose
// client (exam_body) has an enabled SMS config (fetched from /sms/clients).
const SMS_ELIGIBLE_SCRIPTS = new Set(['invigilator', 'proximity']);

const DEFAULT_CLASSIFICATIONS = [
    'Inside Classroom',
    'Entry/Exit',
    'Biometric',
    'Strong Room',
    'All Cameras',
];
// One-shot scripts — no cooldown loop, frequency field not applicable
const NO_FREQUENCY_SCRIPTS = new Set(['vision', 'vision_neet']);

const ShiftScriptManager = ({
    shift,
    examId,
    examBody,
    onUpdate,
    renderInline = true,
    openDialog: externalOpenDialog,
    onCloseDialog: externalOnCloseDialog,
    onScriptNamesReady,
    dateOptions = {},
}) => {
    const [assignments, setAssignments] = useState([]);
    const [scripts, setScripts] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [internalOpenDialog, setInternalOpenDialog] = useState(false);
    const [error, setError] = useState('');

    /* Per-script card times: { [scriptDbId]: { start, end } } */
    const [cardTimes, setCardTimes] = useState({});
    /* Per-script frequency: { [scriptDbId]: string } in seconds */
    const [cardFrequency, setCardFrequency] = useState({});
    /* Per-script camera classifications: { [scriptDbId]: string[] } */
    const [cardClassifications, setCardClassifications] = useState({});
    /* Per-script SMS toggle: { [scriptDbId]: bool } (NTA + eligible scripts only) */
    const [cardSms, setCardSms] = useState({});
    /* Which cards the user has clicked (show blue outline) */
    const [selectedCards, setSelectedCards] = useState(new Set());

    /* exam_body clients that have an enabled SMS config (NTA, SSC, ...) */
    const [smsClientBodies, setSmsClientBodies] = useState([]);
    const examHasSmsConfig = smsClientBodies
        .map((b) => String(b).toUpperCase())
        .includes(String(examBody || '').toUpperCase());
    const smsEligible = (script) =>
        examHasSmsConfig && SMS_ELIGIBLE_SCRIPTS.has(script?.script_id);

    useEffect(() => {
        let alive = true;
        smsAPI.getClients()
            .then((res) => { if (alive) setSmsClientBodies(res?.data?.bodies || []); })
            .catch(() => { if (alive) setSmsClientBodies([]); });
        return () => { alive = false; };
    }, []);

    /* Resolve dialog open state */
    const isDialogOpen = renderInline ? internalOpenDialog : !!externalOpenDialog;

    useEffect(() => {
        if (shift) {
            loadScripts();
            loadAssignments();
            if (renderInline) loadExecutions();
        } else {
            setSelectedDate('');
        }
    }, [shift, dateOptions]);

    /* Auto-select date */
    useEffect(() => {
        const active = assignments.filter((a) => a.is_active);
        const dates = [...new Set(active.map((a) => a.assignment_date).filter(Boolean))].sort();
        if (!dates.length) { if (selectedDate) setSelectedDate(''); return; }
        if (!selectedDate || !dates.includes(selectedDate)) {
            const today = new Date().toISOString().split('T')[0];
            setSelectedDate(dates.includes(today) ? today : dates[0]);
        }
    }, [assignments, selectedDate]);

    /* Report to parent */
    useEffect(() => {
        if (onScriptNamesReady) {
            onScriptNamesReady(assignments.filter((a) => a.is_active));
        }
    }, [assignments]);

    const activeAssignments = assignments.filter((a) => a.is_active);
    const availableDates = [...new Set(activeAssignments.map((a) => a.assignment_date).filter(Boolean))].sort();
    const visibleAssignments = selectedDate
        ? activeAssignments.filter((a) => a.assignment_date === selectedDate)
        : activeAssignments;

    /* Pre-fill card times + selection when dialog opens or date changes */
    useEffect(() => {
        if (!isDialogOpen) {
            setCardTimes({});
            setCardFrequency({});
            setCardClassifications({});
            setCardSms({});
            setSelectedCards(new Set());
            setError('');
            return;
        }

        const newCardTimes = {};
        const newCardFrequency = {};
        const newCardClassifications = {};
        const newCardSms = {};
        const newSelectedCards = new Set();

        visibleAssignments.forEach((a) => {
            if (a.script_id) {
                newSelectedCards.add(a.script_id);
                newCardTimes[a.script_id] = {
                    start: a.custom_start_time ? a.custom_start_time.substring(0, 5) : '',
                    end: a.custom_end_time ? a.custom_end_time.substring(0, 5) : ''
                };
                newCardFrequency[a.script_id] = a.custom_frequency_minutes != null ? String(a.custom_frequency_minutes) : '';
                newCardClassifications[a.script_id] = Array.isArray(a.camera_classifications) ? a.camera_classifications : [];
                newCardSms[a.script_id] = !!a.sms_enabled;
            }
        });

        setCardTimes(newCardTimes);
        setCardFrequency(newCardFrequency);
        setCardClassifications(newCardClassifications);
        setCardSms(newCardSms);
        setSelectedCards(newSelectedCards);
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDialogOpen, assignments, selectedDate]);

    const formatDate = (v) => {
        if (!v) return 'No date';
        const p = String(v).split('-');
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
    };

    /* ── API helpers ── */
    const loadScripts = async () => {
        try {
            const res = await scriptsAPI.getAll({ is_active: true });
            setScripts(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (e) { console.error('loadScripts:', e); }
    };

    const loadAssignments = async () => {
        if (!shift?.id) return;
        setLoading(true);
        try {
            const res = await shiftScriptsAPI.getByShift(shift.id);
            setAssignments(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (e) { console.error('loadAssignments:', e); }
        finally { setLoading(false); }
    };

    const loadExecutions = async () => {
        if (!shift?.id) return;
        try {
            const res = await executionsAPI.getByShift(shift.id, { limit: 10 });
            setExecutions(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch { setExecutions([]); }
    };

    const handleOpenDialog = () => {
        if (renderInline) setInternalOpenDialog(true);
    };

    const handleCloseDialog = () => {
        if (renderInline) setInternalOpenDialog(false);
        else if (externalOnCloseDialog) externalOnCloseDialog();
        setCardTimes({}); setCardSms({}); setError('');
    };

    const handleTimeChange = (scriptDbId, field, value) => {
        // Also mark card as selected when user starts typing a time
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardTimes((prev) => ({
            ...prev,
            [scriptDbId]: { ...prev[scriptDbId], [field]: value },
        }));
    };

    const handleClassificationsChange = (scriptDbId, value) => {
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardClassifications((prev) => ({ ...prev, [scriptDbId]: value }));
    };

    const handleFrequencyChange = (scriptDbId, value) => {
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardFrequency((prev) => ({ ...prev, [scriptDbId]: value }));
    };

    const handleSmsToggle = (scriptDbId, checked) => {
        // Toggling SMS implies the card is selected for assignment.
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardSms((prev) => ({ ...prev, [scriptDbId]: checked }));
    };

    const handleCardClick = (scriptDbId) => {
        setSelectedCards((prev) => {
            const next = new Set(prev);
            if (next.has(scriptDbId)) next.delete(scriptDbId);
            else next.add(scriptDbId);
            return next;
        });
    };

    /* Configured = BOTH start AND end are non-empty */
    const isConfigured = (scriptDbId) => {
        const t = cardTimes[scriptDbId];
        return !!(t?.start && t?.end);
    };

    const configuredCount = scripts.filter((s) => isConfigured(s.id)).length;

    const handleBulkSubmit = async () => {
        const toAssign = scripts
            .filter((s) => isConfigured(s.id))
            .map((s) => {
                const freqVal = parseInt(cardFrequency[s.id], 10);
                return {
                    script_id: s.id,
                    custom_start_time: cardTimes[s.id].start,
                    custom_end_time: cardTimes[s.id].end,
                    custom_frequency_minutes: Number.isFinite(freqVal) && freqVal > 0 ? freqVal : null, // stored in seconds
                    camera_classifications: cardClassifications[s.id]?.length > 0 ? cardClassifications[s.id] : null,
                    // Only send SMS toggle for eligible scripts on NTA exams.
                    ...(smsEligible(s) ? { sms_enabled: !!cardSms[s.id] } : {}),
                };
            });

        if (!toAssign.length) {
            setError('Set START and END time for at least one script card.');
            return;
        }
        setSubmitting(true); setError('');
        try {
            await shiftScriptsAPI.bulkAssign(shift.id, toAssign, dateOptions);
            handleCloseDialog();
            loadAssignments();
            if (onUpdate) onUpdate();
        } catch (e) {
            setError(e?.response?.data?.message || 'Bulk assign failed. Please try again.');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Remove this script assignment?')) {
            try {
                await shiftScriptsAPI.delete(id);
                loadAssignments();
                if (onUpdate) onUpdate();
            } catch { alert('Failed to delete assignment'); }
        }
    };


    const scriptsByCategory = CATEGORIES.map(({ key, label }) => ({
        key, label,
        scripts: scripts.filter((s) => (SCRIPT_META[s.script_id]?.category ?? 'people') === key),
    })).filter((c) => c.scripts.length > 0);


    const dialogJSX = (
        <Dialog
            open={isDialogOpen}
            onClose={handleCloseDialog}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh', bgcolor: '#f5f5f7', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: 'auto' } } }}
        >
            <DialogTitle sx={{ pb: 0.5, pt: 3, px: { xs: 2, sm: 3 } }}>
                <Typography variant="h5" fontWeight={800} color="#0f172a" gutterBottom>
                    Add Script
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Select a script type and configure the monitoring window.
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {scriptsByCategory.map(({ key, label, scripts: catScripts }) => (
                    <Box key={key} mb={3}>
                        <Typography
                            sx={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                color: '#94a3b8',
                                mb: 1.5,
                            }}
                        >
                            {label}
                        </Typography>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                                gap: 1.5,
                            }}
                        >
                            {catScripts.map((script) => {
                                const configured = isConfigured(script.id);
                                const isSelected = selectedCards.has(script.id) || configured;
                                const times = cardTimes[script.id] || {};
                                const meta = SCRIPT_META[script.script_id] || {};
                                const IconComp = meta.icon || Extension;
                                const iconColor = meta.iconColor
                                const bgcolor = meta.bg

                                return (
                                    <Box
                                        key={script.id}
                                        onClick={() => handleCardClick(script.id)}
                                        sx={{
                                            border: isSelected
                                                ? '2px solid #3b82f6'
                                                : 'none',
                                            borderRadius: 2.5,
                                            p: 2,
                                            bgcolor: '#fff',
                                            boxShadow: isSelected
                                                ? '0 0 0 3px rgba(59,130,246,0.08)'
                                                : 'none',
                                            transition: 'all 0.15s ease',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            '&:hover': {
                                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                                borderColor: '#3b82f6',
                                            },
                                        }}
                                    >
                                        {configured && (
                                            <CheckCircle
                                                sx={{
                                                    position: 'absolute',
                                                    top: 10,
                                                    right: 10,
                                                    fontSize: 22,
                                                    color: '#3b82f6',
                                                }}
                                            />
                                        )}

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                            <Box
                                                sx={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: '10px',
                                                    bgcolor: bgcolor,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <IconComp sx={{ fontSize: 20, color: iconColor }} />
                                            </Box>
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: '0.88rem',
                                                    color: '#1e293b',
                                                    lineHeight: 1.3,
                                                    pr: configured ? 3 : 0,
                                                }}
                                            >
                                                {script.name.replace(/\bDetection\b/gi, '').trim()}
                                            </Typography>
                                        </Box>

                                        {/* Time pickers — stop card-click propagation */}
                                        <Box sx={{ display: 'flex', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                    START TIME
                                                </Typography>
                                                <TextField
                                                    type="time"
                                                    size="small"
                                                    fullWidth
                                                    value={times.start || ''}
                                                    onChange={(e) => handleTimeChange(script.id, 'start', e.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    inputProps={{ style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            borderRadius: 1.5,
                                                            bgcolor: '#f3f4f6',
                                                            '& fieldset': { borderColor: '#fff' },
                                                        },
                                                    }}
                                                />
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                    END TIME
                                                </Typography>
                                                <TextField
                                                    type="time"
                                                    size="small"
                                                    fullWidth
                                                    value={times.end || ''}
                                                    onChange={(e) => handleTimeChange(script.id, 'end', e.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    inputProps={{ style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            borderRadius: 1.5,
                                                            bgcolor: '#f3f4f6',
                                                            '& fieldset': { borderColor: '#fff' },
                                                        },
                                                    }}
                                                />
                                            </Box>
                                        </Box>

                                        {/* Frequency input — hidden for one-shot scripts */}
                                        {!NO_FREQUENCY_SCRIPTS.has(script.script_id) && (
                                        <Box sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
                                            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                FREQUENCY (sec)
                                            </Typography>
                                            <TextField
                                                type="number"
                                                size="small"
                                                fullWidth
                                                placeholder="Default"
                                                value={cardFrequency[script.id] || ''}
                                                onChange={(e) => handleFrequencyChange(script.id, e.target.value)}
                                                inputProps={{ min: 1, style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        borderRadius: 1.5,
                                                        bgcolor: '#f3f4f6',
                                                        '& fieldset': { borderColor: '#fff' },
                                                    },
                                                }}
                                            />
                                        </Box>
                                        )}

                                        {/* Camera Classifications multi-select — hidden for one-shot scripts */}
                                        {!NO_FREQUENCY_SCRIPTS.has(script.script_id) && <Box sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
                                            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                CAMERA TYPE
                                            </Typography>
                                            <Autocomplete
                                                multiple
                                                freeSolo
                                                size="small"
                                                options={DEFAULT_CLASSIFICATIONS}
                                                value={cardClassifications[script.id] || []}
                                                onChange={(_, newValue) => handleClassificationsChange(script.id, newValue)}
                                                renderTags={(value, getTagProps) =>
                                                    value.map((option, index) => (
                                                        <Chip
                                                            key={index}
                                                            label={option}
                                                            size="small"
                                                            {...getTagProps({ index })}
                                                            sx={{ fontSize: '0.68rem', height: 20 }}
                                                        />
                                                    ))
                                                }
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        placeholder={cardClassifications[script.id]?.length ? '' : 'Default (all)'}
                                                        sx={{
                                                            '& .MuiOutlinedInput-root': {
                                                                borderRadius: 1.5,
                                                                bgcolor: '#f3f4f6',
                                                                fontSize: '0.82rem',
                                                                '& fieldset': { borderColor: '#fff' },
                                                            },
                                                        }}
                                                    />
                                                )}
                                            />
                                        </Box>}

                                        {/* SMS alert toggle — NTA + eligible scripts only */}
                                        {smsEligible(script) && (
                                            <Box
                                                onClick={(e) => e.stopPropagation()}
                                                sx={{
                                                    mt: 1.25,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    bgcolor: '#f8fafc',
                                                    border: '1px solid #eef2f7',
                                                    borderRadius: 1.5,
                                                    px: 1,
                                                    py: 0.25,
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                    <Smartphone sx={{ fontSize: 16, color: '#64748b' }} />
                                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>
                                                        SMS alert
                                                    </Typography>
                                                </Box>
                                                <Switch
                                                    size="small"
                                                    checked={!!cardSms[script.id]}
                                                    onChange={(e) => handleSmsToggle(script.id, e.target.checked)}
                                                />
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        {/* Divider between categories */}
                        <Divider sx={{ mt: 2.5 }} />
                    </Box>
                ))}

                {scripts.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography color="text.secondary">
                            No scripts available. Add scripts in the Scripts page.
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9' }}>
                {configuredCount > 0 && (
                    <Typography sx={{ flex: 1, fontSize: '0.82rem', color: '#3b82f6', fontWeight: 600 }}>
                        {configuredCount} script{configuredCount > 1 ? 's' : ''} ready to assign
                    </Typography>
                )}
                <Button onClick={handleCloseDialog} sx={{ color: '#64748b', fontWeight: 600 }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleBulkSubmit}
                    disabled={submitting || configuredCount === 0}
                    disableElevation
                    sx={{
                        bgcolor: 'primary.main',
                        fontWeight: 700,
                        borderRadius: 2,
                        px: 3,
                        '&:hover': { bgcolor: 'primary.dark' },
                        '&.Mui-disabled': { bgcolor: '#93c5fd', color: '#fff' },
                    }}
                >
                    {submitting ? <CircularProgress size={18} color="inherit" /> : 'Add to Shift'}
                </Button>
            </DialogActions>
        </Dialog>
    );

    if (!renderInline) return dialogJSX;


    if (!shift) {
        return (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Select a shift to manage scripts</Typography>
            </Paper>
        );
    }

    return (
        <Box>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">{shift.shift_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<Add />} onClick={handleOpenDialog} size="small">
                        Add Script
                    </Button>
                </Box>

                <Divider sx={{ my: 2 }} />

                {availableDates.length > 0 && (
                    <Box mb={2} display="flex" gap={2} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel id="adate-label">Assignment Date</InputLabel>
                            <Select
                                labelId="adate-label"
                                value={selectedDate}
                                label="Assignment Date"
                                onChange={(e) => setSelectedDate(e.target.value)}
                            >
                                {availableDates.map((d) => (
                                    <MenuItem key={d} value={d}>{formatDate(d)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Chip
                            label={`${visibleAssignments.length} script${visibleAssignments.length === 1 ? '' : 's'} on ${formatDate(selectedDate)}`}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                )}

                {loading ? (
                    <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
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
                                                <Chip label={assignment.script.script_id} size="small" color="secondary" variant="outlined" />
                                            )}
                                            {assignment.sms_enabled && (
                                                <Chip
                                                    icon={<Smartphone sx={{ fontSize: 13 }} />}
                                                    label="SMS"
                                                    size="small"
                                                    color="success"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Box mt={0.5}>
                                            {(assignment.custom_start_time || assignment.custom_end_time) && (
                                                <Typography variant="caption" color="text.secondary">
                                                    Custom Time: {assignment.custom_start_time || 'N/A'} – {assignment.custom_end_time || 'N/A'}
                                                </Typography>
                                            )}
                                            {assignment.custom_frequency_minutes != null && (
                                                <Typography variant="caption" display="block" color="text.secondary">
                                                    Frequency: {assignment.custom_frequency_minutes} min
                                                </Typography>
                                            )}
                                            {assignment.notes && (
                                                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                                                    Note: {assignment.notes}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                />
                                <ListItemSecondaryAction>
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
                            ? `No scripts assigned for ${formatDate(selectedDate)}.`
                            : 'No scripts assigned to this shift. Click "Add Script" to assign one.'}
                    </Typography>
                )}
            </Paper>

            {executions.length > 0 && (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" mb={2}>Recent Executions</Typography>
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
