import React, { createContext, useContext, useState, useMemo } from 'react';

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
});

export const DetectionCountsProvider = ({ children }) => {
  const [allCounts, setAllCounts] = useState({});
  const [unfilteredCounts, setUnfilteredCounts] = useState({});
  const [typeFilter, setTypeFilter] = useState([]);
  const [exportToExcel, setExportToExcel] = useState(() => () => { });
  const [downloadConsolidatedReport, setDownloadConsolidatedReport] = useState(() => () => { });

  // Calculate total live count from unfilteredCounts
  const totalLiveCount = useMemo(() => {
    return Object.values(unfilteredCounts).reduce((sum, count) => sum + count, 0);
  }, [unfilteredCounts]);

  return (
    <DetectionCountsContext.Provider value={{
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
    }}>
      {children}
    </DetectionCountsContext.Provider>
  );
};

export const useDetectionCounts = () => useContext(DetectionCountsContext);
