import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle,
  Error,
  HourglassEmpty,
  PlayArrow,
  Cancel
} from '@mui/icons-material';

const ExecutionStatusBadge = ({ status, size = 'small', showIcon = true }) => {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Completed',
          color: 'success',
          icon: <CheckCircle fontSize={size} />
        };
      case 'RUNNING':
        return {
          label: 'Running',
          color: 'info',
          icon: <PlayArrow fontSize={size} />
        };
      case 'PENDING':
        return {
          label: 'Pending',
          color: 'warning',
          icon: <HourglassEmpty fontSize={size} />
        };
      case 'FAILED':
        return {
          label: 'Failed',
          color: 'error',
          icon: <Error fontSize={size} />
        };
      case 'CANCELLED':
        return {
          label: 'Cancelled',
          color: 'default',
          icon: <Cancel fontSize={size} />
        };
      default:
        return {
          label: status || 'Unknown',
          color: 'default',
          icon: null
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={showIcon ? config.icon : undefined}
      sx={{
        fontWeight: 'medium',
        ...(status === 'RUNNING' && {
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.7 }
          }
        })
      }}
    />
  );
};

export default ExecutionStatusBadge;
