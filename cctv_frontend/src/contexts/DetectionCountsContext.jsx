import React, { createContext, useContext, useState } from 'react';

const DetectionCountsContext = createContext({
  allCounts: {},
  setAllCounts: () => { },
  unfilteredCounts: {},
  setUnfilteredCounts: () => { },
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

  return (
    <DetectionCountsContext.Provider value={{
      allCounts,
      setAllCounts,
      unfilteredCounts,
      setUnfilteredCounts,
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
