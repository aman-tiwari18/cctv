import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    FormControl,
    Grid,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Typography,
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { format, parseISO } from 'date-fns';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { dashboardAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

// ---------------------------------------------------------------------------
// Constants — kept identical to V1 so other pages that reuse the same mapping
// stay consistent. Backend returns raw detection_type strings; frontend categorises.
// ---------------------------------------------------------------------------

const CATEGORY_COLORS = {
    people: '#6366f1',
    movement: '#a5b4fc',
    camera: '#475569',
};

const SCRIPT_CATEGORY_MAP = {
    // Script IDs (from scripts table)
    proximity: 'people',
    crowd: 'people',
    crowd_biometric: 'people',
    crowd_five: 'people',
    crowd_zero: 'people',
    invigilator: 'people',
    phone: 'people',
    server: 'people',
    intruder: 'people',
    strongroom: 'movement',
    qp_box: 'movement',
    entry_exit: 'movement',
    inversion: 'camera',
    tamper: 'camera',
    tampering: 'camera',
    blind_spot: 'camera',
    vision: 'camera',

    // Folder names (detection_type in database) — actual values from workers
    proximity_detection: 'people',
    crowd_detection: 'people',
    crowd_detection_biometric: 'people',
    crowd_detection_threshold: 'people',
    zero_person_detection: 'people',
    invigilator_detection: 'people',
    phone_detection: 'people',
    server_room_detection: 'people',
    intruder_detection: 'people',
    strongroom_detection: 'movement',
    qp_box_missing: 'movement',
    entry_exit_detection: 'movement',
    camera_inversion_detection: 'camera',
    camera_tampering_detection: 'camera',
    blind_spot_detection: 'camera',
    vision_detection: 'camera',
};

const DETECTION_TYPE_LABELS = {
    proximity: 'Close Proximity',
    crowd: 'Crowd Detection (Entry/Exit)',
    crowd_biometric: 'Crowd Detection (Biometric)',
    crowd_five: 'Crowd < 5',
    crowd_zero: 'Zero Person',
    server: 'Server Room',
    intruder: 'Intruder',
    strongroom: 'Strong Room Movement',
    qp_box: 'QP Box Detection',
    entry_exit: 'Entry/Exit',
    phone: 'Phone',
    blind_spot: 'Blind Spot',
    invigilator: 'Invigilator',
    inversion: 'Camera Inversion',
    tamper: 'Camera Tampering',
    tampering: 'Camera Tampering',
    vision: 'Vision Detection',

    // Folder names (detection_type in database) — actual values from workers
    proximity_detection: 'Close Proximity',
    crowd_detection: 'Crowd Detection (Entry/Exit)',
    crowd_detection_biometric: 'Crowd Detection (Biometric)',
    crowd_detection_threshold: 'Crowd < 5',
    zero_person_detection: 'Zero Person',
    server_room_detection: 'Server Room',
    intruder_detection: 'Intruder',
    strongroom_detection: 'Strong Room Movement',
    qp_box_missing: 'QP Box Detection',
    entry_exit_detection: 'Entry/Exit',
    phone_detection: 'Phone',
    blind_spot_detection: 'Blind Spot',
    invigilator_detection: 'Invigilator',
    camera_inversion_detection: 'Camera Inversion',
    camera_tampering_detection: 'Camera Tampering',
    vision_detection: 'Vision Detection',
};

const CATEGORY_LABELS = {
    people: 'People',
    movement: 'Movement',
    camera: 'Camera',
};

const CHIP_TONES = {
    amber:  { bg: '#fde6c8', text: '#92400e' },
    violet: { bg: '#ede9fe', text: '#5b21b6' },
};

const KPI_ICON_BG = '#3b82f6';
const KPI_ICON_COLOR = '#ffffff';

// ---------------------------------------------------------------------------
// KpiCard — the 4 top cards
// ---------------------------------------------------------------------------

const KpiCard = ({ title, value, icon, chips = [], loading }) => (
    <Card sx={{ height: '100%' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Typography
                    variant="overline"
                    sx={{
                        color: '#64748b',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        fontSize: '0.72rem',
                    }}
                >
                    {title}
                </Typography>
                <Box
                    sx={{
                        bgcolor: KPI_ICON_BG,
                        borderRadius: 1.5,
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {React.cloneElement(icon, { sx: { fontSize: 22, color: KPI_ICON_COLOR } })}
                </Box>
            </Stack>

            <Box sx={{ mt: 1.5, mb: 2, minHeight: 48 }}>
                {loading ? (
                    <CircularProgress size={22} />
                ) : (
                    <Typography
                        sx={{
                            fontSize: '2.5rem',
                            fontWeight: 700,
                            color: '#1e3a8a',
                            lineHeight: 1.1,
                        }}
                    >
                        {Number(value || 0).toLocaleString()}
                    </Typography>
                )}
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap rowGap={1}>
                {chips.map((chip) => {
                    const tone = CHIP_TONES[chip.tone] || CHIP_TONES.amber;
                    return (
                        <Chip
                            key={chip.label}
                            label={
                                <Box component="span">
                                    <Box component="span" sx={{ fontWeight: 600, mr: 0.5 }}>
                                        {chip.label}
                                    </Box>
                                    <Box component="span" sx={{ fontWeight: 700 }}>
                                        {Number(chip.value || 0).toLocaleString()}
                                    </Box>
                                </Box>
                            }
                            sx={{
                                bgcolor: tone.bg,
                                color: tone.text,
                                borderRadius: 1.5,
                                height: 'auto',
                                py: 0.6,
                                px: 0.4,
                                '& .MuiChip-label': { px: 1.2, fontSize: '0.78rem' },
                            }}
                        />
                    );
                })}
            </Stack>
        </CardContent>
    </Card>
);

// ---------------------------------------------------------------------------
// DetectionDistributionCard — donut + category list
// ---------------------------------------------------------------------------

const DetectionDistributionCard = ({ distribution = [], loading }) => {
    const [category, setCategory] = useState('all');

    // Build chart segments based on category filter
    const segments = useMemo(() => {
        if (!Array.isArray(distribution) || distribution.length === 0) return [];

        if (category === 'all') {
            // Aggregate per category
            const agg = { people: 0, movement: 0, camera: 0 };
            distribution.forEach((d) => {
                const cat = SCRIPT_CATEGORY_MAP[d.type] || 'camera';
                agg[cat] = (agg[cat] || 0) + Number(d.count || 0);
            });
            return ['people', 'movement', 'camera']
                .map((cat) => ({
                    key: cat,
                    label: CATEGORY_LABELS[cat],
                    count: agg[cat] || 0,
                    color: CATEGORY_COLORS[cat],
                }))
                .filter((s) => s.count > 0);
        }

        // Filter to a single category; one segment per detection_type
        return distribution
            .filter((d) => (SCRIPT_CATEGORY_MAP[d.type] || 'camera') === category)
            .map((d) => ({
                key: d.type,
                label: DETECTION_TYPE_LABELS[d.type] || d.type,
                count: Number(d.count || 0),
                color: CATEGORY_COLORS[category],
            }))
            .filter((s) => s.count > 0);
    }, [distribution, category]);

    const total = segments.reduce((acc, s) => acc + s.count, 0);

    const segmentsWithPercent = segments.map((s) => ({
        ...s,
        percent: total > 0 ? (s.count / total) * 100 : 0,
    }));

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        Detection Distribution
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            sx={{ fontSize: '0.85rem', borderRadius: 2 }}
                        >
                            <MenuItem value="all">All Categories</MenuItem>
                            <MenuItem value="people">People</MenuItem>
                            <MenuItem value="movement">Movement</MenuItem>
                            <MenuItem value="camera">Camera</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <CircularProgress />
                    </Box>
                ) : segmentsWithPercent.length === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <Typography color="text.secondary">No detections in this view.</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={5}>
                            <Stack spacing={1.4}>
                                {segmentsWithPercent.map((s) => (
                                    <Stack
                                        key={s.key}
                                        direction="row"
                                        alignItems="center"
                                        spacing={1.25}
                                    >
                                        <Box
                                            sx={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: '50%',
                                                bgcolor: s.color,
                                                flexShrink: 0,
                                            }}
                                        />
                                        <Typography sx={{ minWidth: 88, fontSize: '0.9rem', color: '#334155' }}>
                                            {s.label}
                                        </Typography>
                                        <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem', ml: 'auto' }}>
                                            {s.count.toLocaleString()}
                                        </Typography>
                                        <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem', minWidth: 62, textAlign: 'right' }}>
                                            ({s.percent.toFixed(2)}%)
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        </Grid>

                        <Grid item xs={12} sm={7}>
                            <Box sx={{ position: 'relative', height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={segmentsWithPercent}
                                            cx="50%"
                                            cy="85%"
                                            startAngle={180}
                                            endAngle={0}
                                            innerRadius={78}
                                            outerRadius={112}
                                            paddingAngle={2}
                                            dataKey="count"
                                            nameKey="label"
                                            stroke="none"
                                        >
                                            {segmentsWithPercent.map((s) => (
                                                <Cell key={s.key} fill={s.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value, name) => [
                                                `${Number(value).toLocaleString()}`,
                                                name,
                                            ]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        bottom: 6,
                                        left: 0,
                                        right: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, color: '#1e3a8a', lineHeight: 1.1 }}>
                                        {total.toLocaleString()}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: '#64748b', letterSpacing: '0.06em', fontWeight: 600 }}
                                    >
                                        TOTAL DETECTIONS
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>
                )}
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// GpuPerformanceCard — static / dummy data; no API
// ---------------------------------------------------------------------------

const GpuPerformanceCard = () => {
    const utilization = 88.2;
    const gaugeData = [
        { name: 'used', value: utilization, color: '#3c81f6' },
        { name: 'free', value: 100 - utilization, color: '#e2e8f0' },
    ];

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            Overall GPU Performance
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Real-Time GPU Allocation Efficiency Across Active Nodes
                        </Typography>
                    </Box>
                </Stack>

                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={7}>
                        <Box sx={{ position: 'relative', height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={gaugeData}
                                        cx="50%"
                                        cy="80%"
                                        innerRadius={70}
                                        outerRadius={95}
                                        startAngle={180}
                                        endAngle={0}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {gaugeData.map((d) => (
                                            <Cell key={d.name} fill={d.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    pb: 1,
                                    pointerEvents: 'none',
                                }}
                            >
                                <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, color: '#3c81f6' }}>
                                    {utilization}%
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ color: '#64748b', letterSpacing: '0.06em', fontWeight: 600 }}
                                >
                                    UTILIZATION
                                </Typography>
                            </Box>
                        </Box>
                        <Box
                            sx={{
                                mt: 1,
                                bgcolor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 2,
                                px: 2,
                                py: 1,
                                textAlign: 'center',
                            }}
                        >
                            <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                                Camera Capacity{' '}
                                <Box component="span" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                    MIN 4 • MAX 3688
                                </Box>
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={12} sm={5}>
                        <Stack spacing={1.2}>
                            <Paper
                                elevation={0}
                                sx={{
                                    bgcolor: '#eff6ff',
                                    border: '1px solid #dbeafe',
                                    borderRadius: 2,
                                    p: 1.2,
                                    textAlign: 'center',
                                }}
                            >
                                <StarRoundedIcon sx={{ color: '#3c81f6', fontSize: 22 }} />
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e3a8a' }}>
                                    Optimal
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                    EFFICIENCY
                                </Typography>
                            </Paper>
                            <Paper
                                elevation={0}
                                sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.2 }}
                            >
                                <Typography variant="caption" sx={{ color: '#64748b', letterSpacing: '0.05em', fontWeight: 600 }}>
                                    ACCESSIBLE CAMERAS
                                </Typography>
                                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                                    1,234
                                </Typography>
                            </Paper>
                            <Paper
                                elevation={0}
                                sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.2 }}
                            >
                                <Typography variant="caption" sx={{ color: '#64748b', letterSpacing: '0.05em', fontWeight: 600 }}>
                                    MEMORY LOAD
                                </Typography>
                                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                                    14.2 GB / 24 GB
                                </Typography>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>

                <Typography
                    variant="caption"
                    sx={{ display: 'block', mt: 1.5, textAlign: 'center', color: '#94a3b8' }}
                >
                    Mock data — wiring to real GPU telemetry comes in a later iteration.
                </Typography>
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// LiveExamsCard — paginated table from /api/dashboard/live-exams
// ---------------------------------------------------------------------------

const formatShortDate = (raw) => {
    if (!raw) return '';
    try {
        return format(parseISO(raw), 'd MMM');
    } catch {
        return raw;
    }
};

const formatHMM = (raw) => (typeof raw === 'string' ? raw.slice(0, 5) : '');

const LiveExamsCard = () => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);          // 0-indexed for MUI TablePagination
    const [rowsPerPage, setRowsPerPage] = useState(10);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        dashboardAPI
            .getLiveExams({ page: page + 1, limit: rowsPerPage })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data?.data || {};
                setRows(Array.isArray(data.rows) ? data.rows : []);
                setTotal(Number(data.total || 0));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[Dashboard.getLiveExams]', err);
                setRows([]);
                setTotal(0);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [page, rowsPerPage]);

    return (
        <Card>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', mb: 2 }}>
                    Live Exams
                </Typography>

                <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none' }}
                >
                    <Table>
                        <TableHead sx={{ bgcolor: '#f5f3ff' }}>
                            <TableRow>
                                {['Exam', 'Date', 'Shift & Time', 'Cameras', 'Scripts', 'Detections'].map((h) => (
                                    <TableCell
                                        key={h}
                                        sx={{
                                            fontWeight: 700,
                                            fontSize: '0.78rem',
                                            color: '#64748b',
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                        No live exams today.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={`${row.exam_id}::${row.shift_id}`} hover>
                                        <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>
                                            {row.exam_name}
                                        </TableCell>
                                        <TableCell sx={{ color: '#475569' }}>
                                            {formatShortDate(row.date)}
                                        </TableCell>
                                        <TableCell>
                                            {row.shift_bracket && (
                                                <Typography sx={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                                                    {row.shift_bracket}
                                                </Typography>
                                            )}
                                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                {formatHMM(row.shift_start)} - {formatHMM(row.shift_end)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ color: '#3c81f6', fontWeight: 600 }}>
                                            {Number(row.cameras || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ color: '#3c81f6', fontWeight: 600 }}>
                                            {Number(row.scripts || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ color: '#475569', fontWeight: 600 }}>
                                            {Number(row.detections || 0).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10) || 10);
                        setPage(0);
                    }}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    labelRowsPerPage="Rows per page:"
                    sx={{
                        '.MuiTablePagination-toolbar': { minHeight: '44px !important', px: 1 },
                        '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-displayedRows': {
                            m: 0,
                            fontSize: 13,
                            color: '#334155',
                        },
                    }}
                />
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Dashboard (default export)
// ---------------------------------------------------------------------------

const Dashboard = () => {
    const [date, setDate] = useState(new Date());
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setOverviewLoading(true);
        const dateStr = format(date, 'yyyy-MM-dd');
        dashboardAPI
            .getOverview(dateStr)
            .then((res) => {
                if (!cancelled) setOverview(res?.data?.data || null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[Dashboard.getOverview]', err);
                setOverview(null);
            })
            .finally(() => {
                if (!cancelled) setOverviewLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [date]);

    const totalExams   = overview?.total_exams   || { total: 0, ongoing: 0 };
    const cameras      = overview?.cameras       || { total: 0, accessible: 0, unclassified: 0 };
    const scripts      = overview?.scripts       || { planned_today: 0, running: 0, scheduled: 0, completed: 0 };
    const detections   = overview?.detections    || { today: 0, pushed_to_client: 0, false_detection: 0 };
    const distribution = overview?.detection_distribution || [];

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box>
                {/* Overview header */}
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'flex-end' }}
                    spacing={2}
                    sx={{ mb: 2.5 }}
                >
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            Overview
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                            Monitor Live Exams, Camera Activity, Detections
                        </Typography>
                    </Box>
                    <DatePicker
                        value={date}
                        onChange={(d) => d && setDate(d)}
                        format="dd MMM yyyy"
                        slotProps={{
                            textField: {
                                size: 'small',
                                sx: { minWidth: 180, bgcolor: '#fff', borderRadius: 2 },
                            },
                        }}
                    />
                </Stack>

                {/* Row 1 — 4 KPI cards */}
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="TOTAL EXAMS"
                            value={totalExams.total}
                            icon={<ExamsSvgIcon />}
                            chips={[
                                { label: 'Ongoing', value: totalExams.ongoing, tone: 'amber' },
                                { label: 'Total',   value: totalExams.total,   tone: 'violet' },
                            ]}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="TOTAL CAMERAS"
                            value={cameras.total}
                            icon={<CameraAltIcon />}
                            chips={[
                                { label: 'Accessible',   value: cameras.accessible,   tone: 'amber' },
                                { label: 'Unclassified', value: cameras.unclassified, tone: 'violet' },
                            ]}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="SCRIPT BREAKDOWN"
                            value={scripts.planned_today}
                            icon={<ShiftSvgIcon />}
                            chips={[
                                { label: 'Running',   value: scripts.running,   tone: 'amber' },
                                { label: 'Scheduled', value: scripts.scheduled, tone: 'violet' },
                                { label: 'Completed', value: scripts.completed, tone: 'violet' },
                            ]}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="TOTAL DETECTIONS"
                            value={detections.today}
                            icon={<CustomSvgIcon />}
                            chips={[
                                { label: 'Pushed',          value: detections.pushed_to_client, tone: 'amber' },
                                { label: 'False Detection', value: detections.false_detection,  tone: 'violet' },
                            ]}
                            loading={overviewLoading}
                        />
                    </Grid>
                </Grid>

                {/* Row 2 — Distribution + GPU */}
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} md={6}>
                        <DetectionDistributionCard
                            distribution={distribution}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <GpuPerformanceCard />
                    </Grid>
                </Grid>

                {/* Row 3 — Live Exams table */}
                <LiveExamsCard />
            </Box>
        </LocalizationProvider>
    );
};

export default Dashboard;
