import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    FormControl,
    Grid,
    InputBase,
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
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
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
    people: '#A9C9FF',
    movement: '#FAB781',
    camera: '#7676BE',
};

// Per-detection-type bullet colors — mirrors ShiftScriptManager.jsx SCRIPT_META.iconColor
// so the dot a user sees here matches the glyph they see on the Schedule Analysis / Add Script screens.
const SUBCATEGORY_COLORS = {
    proximity: '#5cb88a',
    crowd: '#e24d7b',
    crowd_biometric: '#9333ea',
    crowd_five: '#e06050',
    crowd_zero: '#6b5b95',
    invigilator: '#00bfcf',
    phone: '#465a38',
    server: '#a0623d',
    intruder: '#d94466',
    qp_box: '#dc2626',
    entry_exit: '#1d7a7d',
    strongroom: '#b91c1c',
    inversion: '#7a86b4',
    tamper: '#00c8d4',
    tampering: '#00c8d4',
    blind_spot: '#b0a850',
    vision: '#3b82f6',
    proximity_detection: '#5cb88a',
    crowd_detection: '#e24d7b',
    crowd_detection_biometric: '#9333ea',
    crowd_detection_threshold: '#e06050',
    zero_person_detection: '#6b5b95',
    invigilator_detection: '#00bfcf',
    phone_detection: '#465a38',
    server_room_detection: '#a0623d',
    intruder_detection: '#d94466',
    qp_box_missing: '#dc2626',
    entry_exit_detection: '#1d7a7d',
    strongroom_detection: '#b91c1c',
    camera_inversion_detection: '#7a86b4',
    camera_tampering_detection: '#00c8d4',
    blind_spot_detection: '#b0a850',
    vision_detection: '#3b82f6',
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
    people: 'People & Activity',
    movement: 'Movement & Alert',
    camera: 'Camera & System',
};

const CHIP_TONES = {
    amber:  { bg: '#FFEEE0', text: '#5C5F61' },
    violet: { bg: '#E5E5FF', text: '#5C5F61' },
};

const KPI_ICON_BG = 'rgba(0, 74, 198, 0.10)';
const KPI_ICON_COLOR = '#004AC6';

// ---------------------------------------------------------------------------
// KpiCard — the 4 top cards
// ---------------------------------------------------------------------------

export const KpiCard = ({ title, value, icon, chips = [], loading }) => (
    <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', border: '1px solid #eef0f3' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Typography
                    variant="overline"
                    sx={{
                        color: '#5C5F61',
                        fontWeight: 700,
                        fontSize: '12px',
                        lineHeight: '16px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                    }}
                >
                    {title}
                </Typography>
                <Box
                    sx={{
                        bgcolor: KPI_ICON_BG,
                        borderRadius: '8px',
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {React.cloneElement(icon, { sx: { fontSize: 18, color: KPI_ICON_COLOR } })}
                </Box>
            </Stack>

            <Box sx={{ mt: 1.5, mb: 2, minHeight: 48 }}>
                {loading ? (
                    <CircularProgress size={22} />
                ) : (
                    <Typography
                        sx={{
                            fontSize: '36px',
                            fontWeight: 700,
                            color: '#2E68C9',
                            lineHeight: '42px',
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
                                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.2 }}>
                                    <Box component="span" sx={{ fontWeight: 600 }}>
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
                                borderRadius: '8px',
                                height: 51,
                                py: 0,
                                px: 0.4,
                                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
                                fontFamily: 'Manrope, Inter, sans-serif',
                                '& .MuiChip-label': {
                                    px: 1.2,
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    lineHeight: '17px',
                                    letterSpacing: '1px',
                                    textTransform: 'capitalize',
                                },
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

// Hovered segment renders as a slightly larger sector with a glow matching its own color
const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <g style={{ filter: `drop-shadow(0 0 6px ${fill})` }}>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
            />
        </g>
    );
};

// Tooltip drawn as ONE continuous SVG path (rounded rect + downward triangle merged),
// so the stroke wraps the whole shape — no visible seam between the box and the arrow.
const DetectionDonutTooltip = ({ label, percent }) => {
    const text = `${label}: ${percent}%`;
    const fontSize = 13;
    const charW = 7.2; // approx for Inter 700 13px
    const padH = 12;
    const padV = 6;
    const radius = 8;
    const triBaseW = 12;
    const triH = 7;
    const W = Math.max(80, text.length * charW + 2 * padH);
    const H = fontSize + 2 * padV + 4; // include some leading
    const cx = W / 2;

    const d = [
        `M ${radius} 0`,
        `L ${W - radius} 0`,
        `A ${radius} ${radius} 0 0 1 ${W} ${radius}`,
        `L ${W} ${H - radius}`,
        `A ${radius} ${radius} 0 0 1 ${W - radius} ${H}`,
        `L ${cx + triBaseW / 2} ${H}`,
        `L ${cx} ${H + triH}`,
        `L ${cx - triBaseW / 2} ${H}`,
        `L ${radius} ${H}`,
        `A ${radius} ${radius} 0 0 1 0 ${H - radius}`,
        `L 0 ${radius}`,
        `A ${radius} ${radius} 0 0 1 ${radius} 0`,
        'Z',
    ].join(' ');

    return (
        <Box component="svg"
            width={W + 2}
            height={H + triH + 2}
            viewBox={`-1 -1 ${W + 2} ${H + triH + 2}`}
            style={{
                display: 'block',
                overflow: 'visible',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
                pointerEvents: 'none',
            }}
        >
            <path d={d} fill="#FFF" stroke="#CED2E0" strokeWidth="1" strokeLinejoin="round" />
            <text
                x={W / 2}
                y={H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: `${fontSize}px`,
                    fontWeight: 700,
                    fill: '#191B23',
                }}
            >
                {text}
            </text>
        </Box>
    );
};

export const DetectionDistributionCard = ({ distribution = [], loading }) => {
    const [category, setCategory] = useState('all');
    const [activeKey, setActiveKey] = useState(null);
    const [mousePos, setMousePos] = useState(null);

    // Fixed donut geometry — recharts ResponsiveContainer handles the overall responsive
    // sizing, but the ring itself is rendered with stable pixel radii so it always renders
    // immediately on first paint (no measurement step, no zero-radius flash).
    const OUTER_R = 126;
    const INNER_R = 106;
    const BOX_HEIGHT = 280;

    // Build tree: 3 parent categories, each with its sub-detections
    const tree = useMemo(() => {
        const list = Array.isArray(distribution) ? distribution : [];
        const parents = ['people', 'movement', 'camera'].map((cat) => {
            const subs = list
                .filter((d) => (SCRIPT_CATEGORY_MAP[d.type] || 'camera') === cat)
                .map((d) => ({
                    key: d.type,
                    label: DETECTION_TYPE_LABELS[d.type] || d.type,
                    count: Number(d.count || 0),
                    color: SUBCATEGORY_COLORS[d.type] || CATEGORY_COLORS[cat],
                }));

            const count = subs.reduce((a, s) => a + s.count, 0);
            return {
                key: cat,
                label: CATEGORY_LABELS[cat],
                count,
                color: CATEGORY_COLORS[cat],
                subs,
            };
        });
        const grandTotal = parents.reduce((a, p) => a + p.count, 0);
        return { parents, grandTotal };
    }, [distribution]);

    // Donut data + center label depend on selected category
    const { donutData, centerValue, centerLabel } = useMemo(() => {
        if (category === 'all') {
            const data = tree.parents
                .map((p) => ({ key: p.key, label: p.label, count: p.count, color: p.color }));
            return { donutData: data, centerValue: tree.grandTotal, centerLabel: 'TOTAL DETECTIONS' };
        }
        const parent = tree.parents.find((p) => p.key === category);
        return {
            donutData: (parent?.subs || []).map((s) => ({
                key: s.key, label: s.label, count: s.count, color: s.color,
            })),
            centerValue: parent?.count || 0,
            centerLabel: (parent?.label || '').toUpperCase(),
        };
    }, [tree, category]);

    const donutTotal = donutData.reduce((a, d) => a + d.count, 0);
    const activeIdx = donutData.findIndex((d) => d.key === activeKey);

    return (
        <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.05)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: 700, lineHeight: '24px' }}>
                        Detection Distribution
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
                            sx={{
                                textTransform: 'none',
                                fontFamily: 'Inter, sans-serif',
                                fontWeight: 500,
                                fontSize: '13px',
                                color: '#191B23',
                                borderColor: '#E5E7EB',
                                borderRadius: '8px',
                                px: 1.5,
                                py: 0.5,
                                '&:hover': {
                                    borderColor: '#CBD5E1',
                                    bgcolor: '#F8FAFC',
                                },
                            }}
                        >
                            Export
                        </Button>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <Select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                sx={{
                                    fontSize: '13px',
                                    borderRadius: '8px',
                                    '& .MuiSelect-select': { fontSize: '13px', py: 0.75 },
                                }}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            '& .MuiMenuItem-root': {
                                                fontSize: '13px',
                                                minHeight: 32,
                                                py: 0.75,
                                            },
                                        },
                                    },
                                }}
                            >
                                <MenuItem value="all">All Categories</MenuItem>
                                <MenuItem value="people">People &amp; Activity</MenuItem>
                                <MenuItem value="movement">Movement &amp; Alert</MenuItem>
                                <MenuItem value="camera">Camera &amp; System</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>

                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <CircularProgress />
                    </Box>
                ) : tree.grandTotal === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <Typography color="text.secondary">No detections in this view.</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2} alignItems="flex-start">
                        <Grid item xs={12} sm={7}>
                            <Box
                                sx={{
                                    position: 'relative',
                                    height: BOX_HEIGHT,
                                    overflow: 'visible',
                                    '& svg': { overflow: 'visible' },
                                }}
                                onMouseMove={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                onMouseLeave={() => { setMousePos(null); setActiveKey(null); }}
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Pie
                                            data={donutData}
                                            cx="50%"
                                            cy="65%"
                                            startAngle={180}
                                            endAngle={0}
                                            innerRadius={INNER_R}
                                            outerRadius={OUTER_R}
                                            paddingAngle={0}
                                            cornerRadius={0}
                                            dataKey="count"
                                            nameKey="label"
                                            stroke="none"
                                            activeIndex={activeIdx >= 0 ? activeIdx : -1}
                                            activeShape={renderActiveShape}
                                            onMouseEnter={(_, idx) => setActiveKey(donutData[idx]?.key || null)}
                                            onMouseLeave={() => setActiveKey(null)}
                                        >
                                            {donutData.map((s) => (
                                                <Cell key={s.key} fill={s.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>

                                {/* Custom tooltip overlay — follows cursor, anchored above */}
                                {activeKey && activeIdx >= 0 && mousePos && (() => {
                                    const donutTotal = donutData.reduce((a, d) => a + d.count, 0);
                                    const pct = donutTotal > 0 ? ((donutData[activeIdx].count / donutTotal) * 100).toFixed(0) : '0';
                                    return (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${mousePos.x}px`,
                                            top: `${mousePos.y - 14}px`,
                                            transform: 'translate(-50%, -100%)',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                        }}>
                                            <DetectionDonutTooltip label={donutData[activeIdx].label} percent={pct} />
                                        </Box>
                                    );
                                })()}

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        bottom: 98,
                                        left: 0,
                                        right: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <Typography sx={{
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '48px',
                                        fontWeight: 700,
                                        color: '#2E68C9',
                                        lineHeight: '60px',
                                    }}>
                                        {centerValue.toLocaleString()}
                                    </Typography>
                                    <Typography
                                        sx={{ color: '#2E68C9', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: '16px', letterSpacing: '0.6px', textTransform: 'uppercase' }}
                                    >
                                        {centerLabel}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={5}>
                            <Box sx={{ maxHeight: BOX_HEIGHT, overflowY: 'auto', pr: 0.5, pt: 1 }}>
                                <Stack spacing={1.5}>
                                    {donutData.map((slice) => {
                                        const pct = donutTotal > 0 ? (slice.count / donutTotal) * 100 : 0;
                                        const isActive = activeKey === slice.key;
                                        const isParentRow = category === 'all';
                                        return (
                                            <Stack
                                                key={slice.key}
                                                direction="row"
                                                alignItems="center"
                                                spacing={1.5}
                                                onMouseEnter={() => setActiveKey(slice.key)}
                                                onMouseLeave={() => setActiveKey(null)}
                                                onClick={isParentRow ? () => setCategory(slice.key) : undefined}
                                                sx={{
                                                    cursor: isParentRow ? 'pointer' : 'default',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: slice.color, flexShrink: 0 }} />
                                                <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: isActive ? 700 : 500, lineHeight: '20px' }}>
                                                    {slice.label}
                                                </Typography>
                                                <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '20px' }}>
                                                    {slice.count.toLocaleString()}
                                                </Typography>
                                                <Box sx={{ flexGrow: 1 }} />
                                                <Typography sx={{ color: '#64748B', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '20px', whiteSpace: 'nowrap' }}>
                                                    ({pct.toFixed(0)}%)
                                                </Typography>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
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

// Four fixed quarter-bands (25% each), light → dark going clockwise.
// Only the bands the value reaches are emitted; the leftover arc renders as
// the gray track. e.g. value=88.2 → bands 1+2+3 full, band 4 = 13.2, track = 11.8.
const BAND_COLORS = ['#B8CFF4', '#94B6EF', '#578ADE', '#3368C1'];
const BAND_SIZE = 25;
const buildGaugeSegments = (value) => {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const segments = [];
    let remaining = v;
    BAND_COLORS.forEach((color, idx) => {
        if (remaining <= 0) return;
        const fill = Math.min(remaining, BAND_SIZE);
        segments.push({ name: `b${idx + 1}`, value: fill, color });
        remaining -= fill;
    });
    const free = 100 - v;
    if (free > 0) segments.push({ name: 'free', value: free, color: '#E3E3E3' });
    return segments;
};

const GpuPerformanceCard = () => {
    const utilization = 88.2;
    const gaugeData = buildGaugeSegments(utilization);
    // Optimal Efficiency mini gauge — visual only, ~82% filled.
    const miniData = buildGaugeSegments(82);

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{
                        color: '#191B23',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '20px',
                        fontWeight: 700,
                        lineHeight: '24px',
                    }}>
                        Overall GPU Performance
                    </Typography>
                    <Typography sx={{
                        mt: 0.75,
                        color: '#303336',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '13px',
                        fontWeight: 400,
                        lineHeight: '18px',
                    }}>
                        Real-Time GPU Allocation Efficiency Across Active Nodes
                    </Typography>
                </Box>

                <Grid container spacing={2} alignItems="flex-start">
                    <Grid item xs={12} sm={7}>
                        <Box sx={{ position: 'relative', height: 170 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Pie
                                        data={gaugeData}
                                        cx="50%"
                                        cy="100%"
                                        innerRadius={128}
                                        outerRadius={150}
                                        startAngle={180}
                                        endAngle={0}
                                        paddingAngle={0}
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
                                    left: 0,
                                    right: 0,
                                    bottom: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    pointerEvents: 'none',
                                }}
                            >
                                <Typography sx={{
                                    color: '#2E68C9',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '32px',
                                    fontWeight: 700,
                                    lineHeight: '36px',
                                }}>
                                    {utilization}%
                                </Typography>
                                <Typography sx={{
                                    mt: 0.25,
                                    color: '#5C5F61',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    lineHeight: '16px',
                                    letterSpacing: '0.6px',
                                    textTransform: 'uppercase',
                                }}>
                                    Utilization
                                </Typography>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                mt: 1.5,
                                mx: 'auto',
                                maxWidth: 240,
                                bgcolor: '#fff',
                                border: '1px solid #E5E7EB',
                                borderRadius: '10px',
                                px: 2,
                                py: 0.75,
                                textAlign: 'center',
                            }}
                        >
                            <Typography sx={{
                                color: '#7A7A7A',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 400,
                                lineHeight: '18px',
                            }}>
                                Camera Capacity
                            </Typography>
                            <Typography sx={{
                                color: '#191B23',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500,
                                lineHeight: '18px',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}>
                                MIN 4 • MAX 3688
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={12} sm={5}>
                        <Stack spacing={1.75}>
                            <Box sx={{ position: 'relative', height: 100 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Pie
                                            data={miniData}
                                            cx="50%"
                                            cy="100%"
                                            innerRadius={72}
                                            outerRadius={92}
                                            startAngle={180}
                                            endAngle={0}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {miniData.map((d) => (
                                                <Cell key={d.name} fill={d.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <Box sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    pb: '4px',
                                    pointerEvents: 'none',
                                }}>
                                    <Box component="svg" width={18} height={17} viewBox="0 0 20 19">
                                        <path
                                            fill="#4D87EA"
                                            d="M9.51062 0L12.7552 5.53423L19.0212 6.90983L14.7605 11.7058L15.3885 18.0902L9.51062 15.52L3.63277 18.0902L4.26079 11.7058L5.53131e-05 6.90983L6.26605 5.53423L9.51062 0Z"
                                        />
                                    </Box>
                                    <Typography sx={{
                                        mt: 0.25,
                                        color: '#4D87EA',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        lineHeight: '16px',
                                    }}>
                                        Optimal
                                    </Typography>
                                    <Typography sx={{
                                        color: '#5C5F61',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        lineHeight: '14px',
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Efficiency
                                    </Typography>
                                </Box>
                            </Box>

                            <Paper
                                elevation={0}
                                sx={{
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '10px',
                                    p: 1.5,
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography sx={{
                                        color: '#5C5F61',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        lineHeight: '15px',
                                        letterSpacing: '0.4px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Accessible Cameras
                                    </Typography>
                                    <Box
                                        component="svg"
                                        width={24}
                                        height={24}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#5C5F61"
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        sx={{ flexShrink: 0 }}
                                    >
                                        <path d="m22 8-6 4 6 4V8Z" />
                                        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                                    </Box>
                                </Stack>
                                <Typography sx={{
                                    mt: 0.5,
                                    color: '#191B23',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '22px',
                                    fontWeight: 800,
                                    lineHeight: '26px',
                                }}>
                                    1,234
                                </Typography>
                            </Paper>

                            <Paper
                                elevation={0}
                                sx={{
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '10px',
                                    p: 1.5,
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography sx={{
                                        color: '#2E68C9',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        lineHeight: '15px',
                                        letterSpacing: '0.4px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Memory Load
                                    </Typography>
                                    <Box component="svg" width={18} height={18} viewBox="0 0 15 15" sx={{ flexShrink: 0 }}>
                                        <path
                                            fill="#2E68C9"
                                            d="M7.5 14.9625C6.4625 14.9625 5.4875 14.7656 4.575 14.3719C3.6625 13.9781 2.86875 13.4406 2.19375 12.7594C1.51875 12.0781 0.984375 11.2812 0.590625 10.3687C0.196875 9.45625 0 8.4875 0 7.4625C0 5.5 0.65 3.8125 1.95 2.4C3.25 0.9875 4.85 0.1875 6.75 0V2.25C5.4625 2.425 4.39062 3.00312 3.53437 3.98438C2.67812 4.96562 2.25 6.125 2.25 7.4625C2.25 8.9125 2.7625 10.15 3.7875 11.175C4.8125 12.2 6.05 12.7125 7.5 12.7125C8.325 12.7125 9.09688 12.5375 9.81563 12.1875C10.5344 11.8375 11.1375 11.3625 11.625 10.7625L13.575 11.8875C12.9 12.825 12.0312 13.5719 10.9688 14.1281C9.90625 14.6844 8.75 14.9625 7.5 14.9625ZM14.3625 10.5L12.4125 9.375C12.525 9.075 12.6094 8.76562 12.6656 8.44687C12.7219 8.12812 12.75 7.8 12.75 7.4625C12.75 6.125 12.3219 4.96562 11.4656 3.98438C10.6094 3.00312 9.5375 2.425 8.25 2.25V0C10.15 0.1875 11.75 0.9875 13.05 2.4C14.35 3.8125 15 5.5 15 7.4625C15 8.0125 14.95 8.54375 14.85 9.05625C14.75 9.56875 14.5875 10.05 14.3625 10.5Z"
                                        />
                                    </Box>
                                </Stack>
                                <Typography sx={{
                                    mt: 0.5,
                                    color: '#2E68C9',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '22px',
                                    fontWeight: 800,
                                    lineHeight: '26px',
                                }}>
                                    14.2 GB / 24 GB
                                </Typography>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>

                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    sx={{ mt: 2.5, pl: 0.5 }}
                >
                    <Box
                        component="svg"
                        width={12}
                        height={12}
                        viewBox="0 0 16 16"
                        sx={{ flexShrink: 0, display: 'block', mt: '-1px' }}
                    >
                        <path
                            d="M8 5V8M8 11H8.0075M15.5 8C15.5 12.1421 12.1421 15.5 8 15.5C3.85786 15.5 0.5 12.1421 0.5 8C0.5 3.85786 3.85786 0.5 8 0.5C12.1421 0.5 15.5 3.85786 15.5 8Z"
                            stroke="#A6A6A6"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                        />
                    </Box>
                    <Typography sx={{
                        color: '#94A3B8',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        fontWeight: 400,
                        lineHeight: '14px',
                        whiteSpace: 'nowrap',
                    }}>
                        Independent of selected filters | Last Update 10:20:34 AM
                    </Typography>
                </Stack>
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

export const LiveExamsCard = ({ fetcher = dashboardAPI.getLiveExams }) => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);          // 0-indexed for MUI TablePagination
    const [rowsPerPage, setRowsPerPage] = useState(10);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetcher({ page: page + 1, limit: rowsPerPage })
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
    }, [page, rowsPerPage, fetcher]);

    // Match other dashboard accents
    const ACCENT_BLUE = '#2E68C9';
    const HEADER_BG = '#efeffb';
    const HEADER_TEXT = '#5C5F61';
    const BODY_DARK = '#191B23';
    const BODY_MID = '#5C5F61';
    const BODY_LIGHT = '#94A3B8';

    const headerCellSx = {
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        fontSize: '13px',
        color: HEADER_TEXT,
        letterSpacing: '0.2px',
        borderBottom: 'none',
        py: 1.5,
    };
    const bodyCellSx = {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: BODY_DARK,
        py: 1.75,
        borderBottom: '1px solid #EEF0F3',
    };

    return (
        <Card sx={{ borderRadius: '12px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                >
                    <Typography sx={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: '20px',
                        lineHeight: '24px',
                        color: '#191B23',
                    }}>
                        Live Shifts
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
                        sx={{
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: '13px',
                            color: '#191B23',
                            borderColor: '#E5E7EB',
                            borderRadius: '8px',
                            px: 1.5,
                            py: 0.5,
                            '&:hover': {
                                borderColor: '#CBD5E1',
                                bgcolor: '#F8FAFC',
                            },
                        }}
                    >
                        Export
                    </Button>
                </Stack>

                <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{ borderRadius: 0, border: 'none', boxShadow: 'none', bgcolor: 'transparent' }}
                >
                    <Table>
                        <TableHead sx={{ bgcolor: HEADER_BG }}>
                            <TableRow>
                                <TableCell sx={{ ...headerCellSx, width: 36, p: 0 }} />
                                <TableCell sx={headerCellSx}>Exam</TableCell>
                                <TableCell sx={headerCellSx}>Date</TableCell>
                                <TableCell sx={headerCellSx}>Shift &amp; Time</TableCell>
                                <TableCell sx={headerCellSx}>Cameras</TableCell>
                                <TableCell sx={headerCellSx}>Scripts</TableCell>
                                <TableCell sx={headerCellSx}>Detections</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: 110 }} />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 4, border: 'none' }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: BODY_LIGHT, border: 'none' }}>
                                        No live shifts right now.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={`${row.exam_id}::${row.shift_id}`} hover>
                                        <TableCell sx={{ ...bodyCellSx, width: 36, p: 0, textAlign: 'center', color: '#94A3B8' }}>
                                            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 20, color: '#94A3B8', verticalAlign: 'middle' }} />
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, fontWeight: 700 }}>
                                            {row.exam_name}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: BODY_MID }}>
                                            {formatShortDate(row.date)}
                                        </TableCell>
                                        <TableCell sx={bodyCellSx}>
                                            <Typography sx={{
                                                fontFamily: 'Inter, sans-serif',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                                color: BODY_DARK,
                                                lineHeight: '18px',
                                            }}>
                                                Shift {row.shift_index || 1}
                                            </Typography>
                                            <Typography sx={{
                                                fontFamily: 'Inter, sans-serif',
                                                fontSize: '12px',
                                                color: BODY_LIGHT,
                                                lineHeight: '15px',
                                                mt: 0.25,
                                            }}>
                                                {formatHMM(row.shift_start)} - {formatHMM(row.shift_end)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: ACCENT_BLUE, fontWeight: 700 }}>
                                            {Number(row.cameras || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: ACCENT_BLUE, fontWeight: 700 }}>
                                            {Number(row.scripts || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: BODY_DARK }}>
                                            {Number(row.detections || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, width: 110, color: ACCENT_BLUE, fontWeight: 600, cursor: 'pointer' }}>
                                            View Details
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
// AdvancedFiltersDialog — modal opened by the filter button
// Holds its own local state for the four controls; only commits to the parent
// when "Apply filters" is clicked. Cancel / × discard local edits.
// ---------------------------------------------------------------------------

const SHIFTS = ['morning', 'afternoon', 'evening'];

export const AdvancedFiltersDialog = ({
    open,
    onClose,
    initialFrom,
    initialTo,
    initialExam,
    initialShift,
    onApply,
}) => {
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [exam, setExam] = useState(initialExam);
    const [shift, setShift] = useState(initialShift);

    // Reset local state whenever the dialog opens so it reflects the parent's
    // current applied filters.
    useEffect(() => {
        if (open) {
            setFrom(initialFrom);
            setTo(initialTo);
            setExam(initialExam);
            setShift(initialShift);
        }
    }, [open, initialFrom, initialTo, initialExam, initialShift]);

    const sameDay = (a, b) => format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
    const today = new Date();
    const localBadge =
        ((!sameDay(from, today) || !sameDay(to, today)) ? 1 : 0) +
        (exam !== 'all' ? 1 : 0) +
        (shift ? 1 : 0);

    const handleClearAll = () => {
        const t = new Date();
        setFrom(t);
        setTo(t);
        setExam('all');
        setShift(null);
    };

    const handleApply = () => {
        let f = from;
        let t = to;
        if (f > t) {
            const tmp = f; f = t; t = tmp;
        }
        onApply({ from: f, to: t, exam, shift });
    };

    const fieldLabelSx = {
        mb: 0.75,
        color: '#5C5F61',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        fontWeight: 500,
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    borderRadius: '14px',
                    width: 640,
                    maxWidth: '90vw',
                    p: 2.5,
                },
            }}
        >
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                {/* Header */}
                <Stack direction="row" alignItems="center" sx={{ mb: 2.5 }}>
                    <TuneRoundedIcon sx={{ fontSize: 18, color: '#191B23' }} />
                    <Typography sx={{
                        ml: 1,
                        color: '#191B23',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '16px',
                        fontWeight: 600,
                    }}>
                        Advanced filters
                    </Typography>
                    {localBadge > 0 && (
                        <Box sx={{
                            ml: 1,
                            minWidth: 18,
                            height: 18,
                            px: 0.5,
                            bgcolor: '#4B53C9',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 700,
                            lineHeight: 1,
                        }}>
                            {localBadge}
                        </Box>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <Box
                        component="button"
                        type="button"
                        onClick={handleClearAll}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            border: 'none',
                            bgcolor: 'transparent',
                            cursor: 'pointer',
                            color: '#5C5F61',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            px: 0.5,
                            '&:hover': { color: '#191B23' },
                        }}
                    >
                        <HistoryRoundedIcon sx={{ fontSize: 16 }} />
                        Clear all filters
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        onClick={onClose}
                        aria-label="Close filters"
                        sx={{
                            ml: 1,
                            border: 'none',
                            bgcolor: 'transparent',
                            cursor: 'pointer',
                            color: '#5C5F61',
                            p: 0.5,
                            display: 'flex',
                            '&:hover': { color: '#191B23' },
                        }}
                    >
                        <CloseRoundedIcon sx={{ fontSize: 18 }} />
                    </Box>
                </Stack>

                {/* Body — 2×2 grid */}
                <Grid container spacing={2.5} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>Exam selection</Typography>
                        <FormControl fullWidth size="small">
                            <Select
                                value={exam}
                                onChange={(e) => setExam(e.target.value)}
                                sx={{
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '14px',
                                    borderRadius: '10px',
                                    '& .MuiSelect-select': { py: 1.25 },
                                }}
                            >
                                <MenuItem value="all">All Exams</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>Shift selection</Typography>
                        <Stack direction="row" spacing={1}>
                            {SHIFTS.map((s) => {
                                const active = shift === s;
                                return (
                                    <Box
                                        key={s}
                                        component="button"
                                        type="button"
                                        onClick={() => setShift(active ? null : s)}
                                        sx={{
                                            flex: 1,
                                            py: 1.25,
                                            borderRadius: '10px',
                                            bgcolor: active ? '#E5E5FF' : '#fff',
                                            color: active ? '#4B53C9' : '#191B23',
                                            border: `1px solid ${active ? '#4B53C9' : '#E5E7EB'}`,
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            '&:hover': { borderColor: '#4B53C9' },
                                        }}
                                    >
                                        {s[0].toUpperCase() + s.slice(1)}
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>From date</Typography>
                        <DatePicker
                            value={from}
                            onChange={(d) => d && setFrom(d)}
                            format="d MMM yyyy"
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    size: 'small',
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '10px',
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: '14px',
                                        },
                                    },
                                },
                            }}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>To date</Typography>
                        <DatePicker
                            value={to}
                            onChange={(d) => d && setTo(d)}
                            format="d MMM yyyy"
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    size: 'small',
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '10px',
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: '14px',
                                        },
                                    },
                                },
                            }}
                        />
                    </Grid>
                </Grid>

                {/* Footer */}
                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        sx={{
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: '14px',
                            color: '#5C5F61',
                            borderColor: '#E5E7EB',
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            '&:hover': { borderColor: '#CBD5E1', bgcolor: '#F8FAFC' },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        disableElevation
                        onClick={handleApply}
                        sx={{
                            bgcolor: '#4B53C9',
                            color: '#fff',
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 700,
                            fontSize: '14px',
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            '&:hover': { bgcolor: '#3F47B0' },
                        }}
                    >
                        Apply filters
                    </Button>
                </Stack>
            </LocalizationProvider>
        </Dialog>
    );
};

// ---------------------------------------------------------------------------
// Dashboard (default export)
// ---------------------------------------------------------------------------

const Dashboard = () => {
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [showGpuWarning, setShowGpuWarning] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [dateChip, setDateChip] = useState('today');
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [customRange, setCustomRange] = useState(null);
    const [selectedExam, setSelectedExam] = useState('all');
    const [selectedShift, setSelectedShift] = useState(null);

    // Derive API params + active filter chips from the selected date chip
    // plus any non-default shift/exam set via the Advanced filters modal.
    // Today (with default shift/exam) produces no active chips so Row 4 hides.
    const { apiParams, activeFilters } = useMemo(() => {
        const today = new Date();
        const fmt = (d) => format(d, 'yyyy-MM-dd');
        const labelChip = (label) => ({ key: 'date', label });
        const extraChips = (chips) => [
            ...chips,
            ...(selectedShift
                ? [{ key: 'shift', label: selectedShift[0].toUpperCase() + selectedShift.slice(1) }]
                : []),
        ];

        switch (dateChip) {
            case 'yesterday': {
                const y = subDays(today, 1);
                return {
                    apiParams: { date: fmt(y) },
                    activeFilters: extraChips([{ key: 'date', label: 'Yesterday' }]),
                };
            }
            case 'last_week': {
                const start = subDays(today, 6);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today) },
                    activeFilters: extraChips([labelChip('Last week')]),
                };
            }
            case 'last_month': {
                const start = subDays(today, 29);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today) },
                    activeFilters: extraChips([labelChip('Last month')]),
                };
            }
            case 'custom': {
                const start = customRange?.from ?? today;
                const end   = customRange?.to   ?? today;
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(end) },
                    activeFilters: extraChips([
                        { key: 'date', label: `${fmt(start)} → ${fmt(end)}` },
                    ]),
                };
            }
            case 'today':
            default:
                return {
                    apiParams: { date: fmt(today) },
                    activeFilters: extraChips([]),
                };
        }
    }, [dateChip, customRange, selectedShift]);

    // Removes a single active filter chip by its key — narrower than Clear all.
    const removeFilter = (key) => {
        if (key === 'date') {
            setDateChip('today');
            setCustomRange(null);
        } else if (key === 'shift') {
            setSelectedShift(null);
        } else if (key === 'exam') {
            setSelectedExam('all');
        }
    };
    const clearAllFilters = () => {
        setDateChip('today');
        setCustomRange(null);
        setSelectedShift(null);
        setSelectedExam('all');
    };

    useEffect(() => {
        let cancelled = false;
        setOverviewLoading(true);
        dashboardAPI
            .getOverview(apiParams)
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
    }, [apiParams]);

    const totalExams   = overview?.total_exams   || { total: 0, ongoing: 0, completed: 0, scheduled: 0 };
    const cameras      = overview?.cameras       || { total: 0, accessible: 0, inaccessible: 0 };
    const scripts      = overview?.scripts       || { planned_today: 0, running: 0, scheduled: 0, completed: 0 };
    const detections   = overview?.detections    || { today: 0, pushed_to_client: 0, false_detection: 0 };
    const distribution = overview?.detection_distribution || [];

    const dateChips = [
        { key: 'today',      label: 'Today' },
        { key: 'yesterday',  label: 'Yesterday' },
        { key: 'last_week',  label: 'Last week' },
        { key: 'last_month', label: 'Last month' },
    ];

    // Prefill the modal's From/To from the current chip selection so opening
    // the modal shows the same range the dashboard is currently using.
    const dialogInitialDates = useMemo(() => {
        const today = new Date();
        if (dateChip === 'custom' && customRange) {
            return { from: customRange.from, to: customRange.to };
        }
        switch (dateChip) {
            case 'yesterday':  { const y = subDays(today, 1); return { from: y, to: y }; }
            case 'last_week':  return { from: subDays(today, 6),  to: today };
            case 'last_month': return { from: subDays(today, 29), to: today };
            default:           return { from: today, to: today };
        }
    }, [dateChip, customRange]);

    const handleApplyAdvanced = ({ from, to, exam, shift }) => {
        setSelectedExam(exam);
        setSelectedShift(shift);
        const today = new Date();
        const sameDay = (a, b) => format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
        if (sameDay(from, today) && sameDay(to, today)) {
            // User effectively cleared the date filter — fall back to Today default.
            setDateChip('today');
            setCustomRange(null);
        } else {
            setDateChip('custom');
            setCustomRange({ from, to });
        }
        setFilterMenuOpen(false);
    };

    return (
        <Box>
            {/* Overview header — Row 1: title + warning chip */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
                spacing={2}
                sx={{ mb: 2 }}
            >
                <Box>
                    <Typography sx={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: '26px',
                        lineHeight: '32px',
                        color: '#191B23',
                        letterSpacing: '0.2px',
                    }}>
                        Overview
                    </Typography>
                    <Typography sx={{
                        mt: 0.25,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: '14px',
                        lineHeight: '20px',
                        color: '#303336',
                    }}>
                        Monitor Live Exams, Camera Activity, Detections
                    </Typography>
                </Box>
                {showGpuWarning && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                            bgcolor: '#FFDAD6',
                            color: '#93000A',
                            border: '1px solid rgba(186, 26, 26, 0.20)',
                            borderRadius: 999,
                            pl: 1.25,
                            pr: 0.5,
                            py: 0.5,
                            flexShrink: 0,
                        }}
                    >
                        <ErrorOutlineRoundedIcon sx={{ fontSize: 18, color: '#93000A' }} />
                        <Typography sx={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            lineHeight: '16px',
                            whiteSpace: 'nowrap',
                        }}>
                            GPU utilization above 85%
                        </Typography>
                        <Box
                            component="button"
                            type="button"
                            onClick={() => setShowGpuWarning(false)}
                            sx={{
                                border: 'none',
                                bgcolor: 'transparent',
                                p: 0.25,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#93000A',
                                '&:hover': { opacity: 0.7 },
                            }}
                            aria-label="Dismiss GPU utilization warning"
                        >
                            <CloseRoundedIcon sx={{ fontSize: 16 }} />
                        </Box>
                    </Stack>
                )}
            </Stack>

            {/* Overview header — Row 2: search input + filter button */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                <Box sx={{
                    flex: 1,
                    bgcolor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '10px',
                    px: 2,
                    py: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                }}>
                    <InputBase
                        fullWidth
                        placeholder="Search keywords..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        sx={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#191B23',
                            '& input::placeholder': { color: '#94A3B8', opacity: 1 },
                        }}
                    />
                </Box>
                <Box
                    component="button"
                    type="button"
                    onClick={() => setFilterMenuOpen(true)}
                    sx={{
                        position: 'relative',
                        width: 48,
                        height: 48,
                        bgcolor: '#4B53C9',
                        border: 'none',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&:hover': { bgcolor: '#3F47B0' },
                    }}
                    aria-label="Open filters"
                >
                    <TuneRoundedIcon sx={{ fontSize: 22, color: '#fff' }} />
                    {activeFilters.length > 0 && (
                        <Box sx={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 18,
                            height: 18,
                            px: 0.5,
                            bgcolor: '#fff',
                            border: '1.5px solid #4B53C9',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#4B53C9',
                            lineHeight: 1,
                        }}>
                            {activeFilters.length}
                        </Box>
                    )}
                </Box>
            </Stack>

            {/* Overview header — Row 3: quick date chips */}
            <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mb: activeFilters.length ? 1 : 2.5 }}
            >
                {dateChips.map((c) => {
                    const active = c.key === dateChip;
                    return (
                        <Box
                            key={c.key}
                            component="button"
                            type="button"
                            onClick={() => setDateChip(c.key)}
                            sx={{
                                bgcolor: active ? '#4B53C9' : '#fff',
                                color: active ? '#fff' : '#191B23',
                                border: active ? 'none' : '1px solid #E5E7EB',
                                borderRadius: 999,
                                px: 1.75,
                                py: 0.5,
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                '&:hover': active ? { bgcolor: '#3F47B0' } : { borderColor: '#CBD5E1' },
                            }}
                        >
                            {c.label}
                        </Box>
                    );
                })}
            </Stack>

            {/* Overview header — Row 4: active filter chips + Clear all */}
            {activeFilters.length > 0 && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mb: 2.5 }}
                >
                    {activeFilters.map((f) => (
                        <Chip
                            key={f.key}
                            label={f.label}
                            onDelete={() => removeFilter(f.key)}
                            deleteIcon={<CloseRoundedIcon sx={{ fontSize: 14 }} />}
                            sx={{
                                bgcolor: '#E5E5FF',
                                color: '#4B53C9',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500,
                                borderRadius: 999,
                                height: 28,
                                '& .MuiChip-deleteIcon': {
                                    color: '#4B53C9',
                                    '&:hover': { color: '#3F47B0' },
                                },
                            }}
                        />
                    ))}
                    <Box
                        component="button"
                        type="button"
                        onClick={clearAllFilters}
                        sx={{
                            border: 'none',
                            bgcolor: 'transparent',
                            color: '#4B53C9',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            px: 0.5,
                            '&:hover': { textDecoration: 'underline' },
                        }}
                    >
                        Clear all
                    </Box>
                </Stack>
            )}

            <AdvancedFiltersDialog
                open={filterMenuOpen}
                onClose={() => setFilterMenuOpen(false)}
                initialFrom={dialogInitialDates.from}
                initialTo={dialogInitialDates.to}
                initialExam={selectedExam}
                initialShift={selectedShift}
                onApply={handleApplyAdvanced}
            />

            {/* Row 1 — 4 KPI cards */}
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="TOTAL EXAMS"
                            value={totalExams.total}
                            icon={<ExamsSvgIcon />}
                            chips={[
                                { label: 'Ongoing',   value: totalExams.ongoing,   tone: 'amber' },
                                { label: 'Completed', value: totalExams.completed, tone: 'violet' },
                                { label: 'Scheduled', value: totalExams.scheduled, tone: 'violet' },
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
                                { label: 'Inaccessible', value: cameras.inaccessible, tone: 'violet' },
                            ]}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            title="ANALYTICS"
                            value={scripts.planned_today}
                            icon={<ShiftSvgIcon />}
                            chips={[
                                { label: 'Running',   value: scripts.running,   tone: 'amber' },
                                { label: 'Pending',   value: scripts.scheduled, tone: 'violet' },
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
    );
};

export default Dashboard;
