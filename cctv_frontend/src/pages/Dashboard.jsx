import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { format, parseISO } from 'date-fns';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
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

const KpiCard = ({ title, value, icon, chips = [], loading }) => (
    <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', border: '1px solid #eef0f3' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Typography
                    variant="overline"
                    sx={{
                        color: '#5C5F61',
                        fontWeight: 700,
                        fontSize: '15px',
                        lineHeight: '16px',
                        letterSpacing: '0.6px',
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
                outerRadius={outerRadius + 12}
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

const DetectionDistributionCard = ({ distribution = [], loading }) => {
    const [category, setCategory] = useState('all');
    const [activeKey, setActiveKey] = useState(null);
    const [mousePos, setMousePos] = useState(null);
    const [chartWidth, setChartWidth] = useState(0);
    const chartBoxRef = useRef(null);

    // Donut radius = half the available width minus 32px per side. The 32px reserves room for:
    //   +12 hover expansion (active sector outerRadius+12),
    //    ~6 drop-shadow blur,
    //    ~6 cornerRadius rounding extending past the arc tangent at the open ends,
    //    ~8 slack.
    // Cap at 160 so on wide screens the ring stays a sensible card-sized graphic instead of
    // ballooning to fill the column. No floor — on narrow viewports the radius just
    // shrinks naturally so the ring never clips the box.
    const outerR = Math.max(0, Math.min(160, Math.floor(chartWidth / 2) - 32));
    const innerR = Math.max(0, outerR - 32);
    // Box height + cy track the radius so the half-circle always sits with the
    // same visual padding (35px above the arc, 85px below the chord for the
    // "599 / TOTAL DETECTIONS" overlay + breathing room).
    const arcCy = outerR + 35;
    const boxHeight = arcCy + 85;

    useEffect(() => {
        const el = chartBoxRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            if (entry) setChartWidth(entry.contentRect.width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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
                }))
                .filter((s) => s.count > 0);

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
                .filter((p) => p.count > 0)
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

    const parentPercent = (p) => (tree.grandTotal > 0 ? (p.count / tree.grandTotal) * 100 : 0);
    const subPercent = (parent, sub) => (parent.count > 0 ? (sub.count / parent.count) * 100 : 0);

    const activeIdx = donutData.findIndex((d) => d.key === activeKey);

    return (
        <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.05)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: 700, lineHeight: '24px' }}>
                        Detection Distribution
                    </Typography>
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

                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <CircularProgress />
                    </Box>
                ) : tree.grandTotal === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <Typography color="text.secondary">No detections in this view.</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={5}>
                            <Box sx={{ maxHeight: 280, overflowY: 'auto', pr: 0.5 }}>
                                <Stack spacing={1.2}>
                                    {tree.parents.map((p) => {
                                        const expanded = category === p.key;
                                        const parentActive = activeKey === p.key;
                                        return (
                                            <Box key={p.key}>
                                                <Stack
                                                    direction="row"
                                                    alignItems="flex-start"
                                                    spacing={0.75}
                                                    onClick={() => setCategory(expanded ? 'all' : p.key)}
                                                    sx={{ cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    {/* arrow + dot, locked to first text line height */}
                                                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ height: '20px', flexShrink: 0, color: '#434655' }}>
                                                        {expanded
                                                            ? <KeyboardArrowDownRoundedIcon sx={{ fontSize: 16 }} />
                                                            : <KeyboardArrowRightRoundedIcon sx={{ fontSize: 16 }} />}
                                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: p.color }} />
                                                    </Stack>
                                                    {/* label, wraps at natural word boundaries */}
                                                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: parentActive ? 700 : 500, lineHeight: '20px', flexGrow: 1, flexShrink: 1 }}>
                                                        {p.label}
                                                    </Typography>
                                                    {/* count + percent, also locked to first text line */}
                                                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ height: '20px', flexShrink: 0 }}>
                                                        <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 700, lineHeight: '20px', whiteSpace: 'nowrap' }}>
                                                            {p.count.toLocaleString()}
                                                        </Typography>
                                                        <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: parentActive ? 700 : 400, lineHeight: '20px', whiteSpace: 'nowrap', opacity: parentActive ? 1 : 0.7 }}>
                                                            ({parentPercent(p).toFixed(2)}%)
                                                        </Typography>
                                                    </Stack>
                                                </Stack>

                                                {expanded && p.subs.length > 0 && (
                                                    <Stack spacing={0.2} sx={{ mt: 0.6, pl: 4, pb: 0.8, borderBottom: '1px solid #eef0f3' }}>
                                                        {p.subs.map((s) => {
                                                            const subActive = activeKey === s.key;
                                                            return (
                                                                <Stack key={s.key} direction="row" alignItems="center" spacing={1}>
                                                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                                                                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: subActive ? 700 : 400, lineHeight: '20px' }}>
                                                                        {s.label}
                                                                    </Typography>
                                                                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 700, lineHeight: '20px', ml: 'auto' }}>
                                                                        {subPercent(p, s).toFixed(0)}%
                                                                    </Typography>
                                                                </Stack>
                                                            );
                                                        })}
                                                    </Stack>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        </Grid>

                        <Grid item xs={12} sm={7}>
                            <Box
                                ref={chartBoxRef}
                                sx={{ position: 'relative', height: boxHeight }}
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
                                            cy={arcCy}
                                            startAngle={179}
                                            endAngle={1}
                                            innerRadius={innerR}
                                            outerRadius={outerR}
                                            paddingAngle={1}
                                            cornerRadius={6}
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
                                        bottom: 88,
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
                                        fontSize: `${Math.max(28, Math.min(48, outerR * 0.32))}px`,
                                        fontWeight: 700,
                                        color: '#2E68C9',
                                        lineHeight: `${Math.max(36, Math.min(60, outerR * 0.4))}px`,
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
        { name: 'used', value: utilization, color: '#3368c1' },
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
                                <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, color: '#3368c1' }}>
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
                                <StarRoundedIcon sx={{ color: '#3368c1', fontSize: 22 }} />
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1b479a' }}>
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
                        <TableHead sx={{ bgcolor: '#efeffb' }}>
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
                                        <TableCell sx={{ color: '#3368c1', fontWeight: 600 }}>
                                            {Number(row.cameras || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ color: '#3368c1', fontWeight: 600 }}>
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
