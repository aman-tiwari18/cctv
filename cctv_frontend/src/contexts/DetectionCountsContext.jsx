import React, { createContext, useContext, useState } from 'react';

const DetectionCountsContext = createContext({
  allCounts: {},
  setAllCounts: () => { },
  unfilteredCounts: {},
  setUnfilteredCounts: () => { },
  typeFilter: [],
  setTypeFilter: () => { },
});

export const DetectionCountsProvider = ({ children }) => {
  const [allCounts, setAllCounts] = useState({});
  const [unfilteredCounts, setUnfilteredCounts] = useState({});
  const [typeFilter, setTypeFilter] = useState([]);

  return (
    <DetectionCountsContext.Provider value={{ allCounts, setAllCounts, unfilteredCounts, setUnfilteredCounts, typeFilter, setTypeFilter }}>
      {children}
    </DetectionCountsContext.Provider>
  );
};

export const useDetectionCounts = () => useContext(DetectionCountsContext);
