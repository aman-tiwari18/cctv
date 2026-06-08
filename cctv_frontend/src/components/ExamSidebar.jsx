import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronRight,
  KeyboardArrowLeft,
  KeyboardArrowRight,
} from '@mui/icons-material';
import { ExamsSvgIcon } from './ExamsSvgIcon';

/**
 * Reusable collapsible exam sidebar component
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether sidebar is open/expanded
 * @param {function} props.onToggle - Callback when toggle button is clicked
 * @param {Array} props.exams - Array of exam objects
 * @param {string|number} props.selectedExamId - Currently selected exam ID
 * @param {function} props.onSelectExam - Callback when exam is selected (receives exam.id)
 * @param {boolean} props.viewingArchived - Whether viewing archived exams
 * @param {function} props.onToggleArchived - Callback when archive toggle is clicked
 * @param {string} props.title - Optional custom title (defaults to "Available Exams" / "Archived Exams")
 * @param {React.ReactNode} props.icon - Optional custom icon (defaults to ExamsSvgIcon)
 */
const ExamSidebar = ({
  open,
  onToggle,
  exams = [],
  selectedExamId,
  onSelectExam,
  viewingArchived = false,
  onToggleArchived,
  title,
  icon,
}) => {
  const displayTitle = title || (viewingArchived ? 'Archived Exams' : 'Available Exams');
  const IconComponent = icon || ExamsSvgIcon;

  return (
    <Box
      sx={{
        width: open ? { xs: 200, sm: 280 } : 56,
        flexShrink: 0,
        borderRight: '1px solid #e8ecf1',
        bgcolor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Sidebar header + collapse toggle */}
      <Box
        sx={{
          px: open ? 2.5 : 1,
          pt: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'space-between' : 'center',
        }}
      >
        {open && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <IconComponent sx={{ fontSize: 17, color: '#64748b' }} />
            <Typography
              sx={{
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#334155',
              }}
            >
              {displayTitle}
            </Typography>
          </Box>
        )}
        <Tooltip title={open ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
          <IconButton
            size="small"
            // .blur() releases focus so MUI's .Mui-focusVisible doesn't linger.
            // disableRipple kills the ripple animation that can leave a brief
            // dark residue independent of focus/hover. Together they prevent
            // the "stuck darker color sometimes" the user was seeing.
            disableRipple
            onClick={(e) => { onToggle(); e.currentTarget.blur(); }}
            sx={{
              color: '#fff',
              bgcolor: '#3b82f6',
              // `:active` (mouse-down) gives a brief darker press feedback;
              // `:hover` is forced to the base color so the button can't get
              // "stuck dark" when the cursor lingers over it after the click
              // (the button doesn't move on toggle, so the cursor stays
              // hovering and would otherwise keep applying the dark hover).
              '&:hover':  { bgcolor: '#3b82f6' },
              '&:active': { bgcolor: '#2563eb' },
              borderRadius: 2,
              width: 32,
              height: 32,
            }}
          >
            {open ? (
              <KeyboardArrowLeft sx={{ fontSize: 20 }} />
            ) : (
              <KeyboardArrowRight sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Exam list */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {exams.map((exam) => {
          const active = String(exam.id) === String(selectedExamId);
          return (
            <Tooltip
              key={exam.id}
              title={!open ? `${exam.exam_name} (${exam.exam_body})` : ''}
              placement="right"
            >
              <Box
                onClick={() => onSelectExam(String(exam.id))}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: open ? 'space-between' : 'center',
                  px: open ? 2.5 : 0,
                  py: 1.8,
                  cursor: 'pointer',
                  borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                  bgcolor: active ? '#f0f6ff' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: active ? '#f0f6ff' : '#f8fafc' },
                }}
              >
                {open ? (
                  <>
                    <Typography
                      sx={{
                        fontSize: '0.88rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#3b82f6' : '#334155',
                        lineHeight: 1.4,
                        pr: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {exam.exam_name} ({exam.exam_body})
                    </Typography>
                    <ChevronRight
                      sx={{ fontSize: 20, color: active ? '#3b82f6' : '#94a3b8', flexShrink: 0 }}
                    />
                  </>
                ) : (
                  /* Collapsed: show first letter of exam name in a styled box.
                     Selected uses a very light blue tint + primary-blue letter
                     to mirror the main left-nav "current page" treatment
                     (e.g. the Cameras item). The old `#2563eb` fill +
                     white text read as darker than the app's brand color. */
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      bgcolor: active ? '#dbeafe' : '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: active ? '#3c81f6' : '#64748b',
                        textTransform: 'uppercase',
                      }}
                    >
                      {exam.exam_name.charAt(0)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}
        {exams.length === 0 && open && (
          <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>
            No exams found.
          </Typography>
        )}
      </Box>

      {/* Toggle archived */}
      {open && onToggleArchived && (
        <Box sx={{ px: 2.5, py: 2 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={onToggleArchived}
            sx={{
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: '0.72rem',
              letterSpacing: '0.04em',
              borderColor: '#cbd5e1',
              color: '#777',
              borderRadius: 2,
              py: 1,
              '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' },
            }}
          >
            {viewingArchived ? 'View Active Exams' : 'View Archived Exams'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default ExamSidebar;
