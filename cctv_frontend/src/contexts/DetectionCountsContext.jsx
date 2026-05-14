import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

const DetectionCountsContext = createContext({
  allCounts: {},
  setAllCounts: () => { },
  unfilteredCounts: {},
  setUnfilteredCounts: () => { },
  totalLiveCount: 0,
  typeFilter: [],
  setTypeFilter: () => { },
  exportToExcel: () => { },
  setExportToExcel: () => { },
  downloadConsolidatedReport: () => { },
  setDownloadConsolidatedReport: () => { },
  reportValidationError: '',
  setReportValidationError: () => { },
});

export const DetectionCountsProvider = ({ children }) => {
  const [allCounts, setAllCounts] = useState({});
  const [unfilteredCounts, setUnfilteredCounts] = useState({});
  const [typeFilter, setTypeFilter] = useState([]);
  const [exportToExcel, setExportToExcel] = useState(() => () => { });
  const [downloadConsolidatedReport, setDownloadConsolidatedReport] = useState(() => () => { });
  const [reportValidationError, setReportValidationError] = useState('');

  // Calculate total live count from unfilteredCounts
  const totalLiveCount = useMemo(() => {
    return Object.values(unfilteredCounts).reduce((sum, count) => sum + count, 0);
  }, [unfilteredCounts]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    allCounts,
    setAllCounts,
    unfilteredCounts,
    setUnfilteredCounts,
    totalLiveCount,
    typeFilter,
    setTypeFilter,
    exportToExcel,
    setExportToExcel,
    downloadConsolidatedReport,
    setDownloadConsolidatedReport,
    reportValidationError,
    setReportValidationError,
  }), [
    allCounts,
    unfilteredCounts,
    totalLiveCount,
    typeFilter,
    exportToExcel,
    downloadConsolidatedReport,
    reportValidationError,
  ]);

  return (
    <DetectionCountsContext.Provider value={contextValue}>
      {children}
    </DetectionCountsContext.Provider>
  );
};

export const useDetectionCounts = () => useContext(DetectionCountsContext);
