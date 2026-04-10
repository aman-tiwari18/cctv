import React, { createContext, useContext, useState } from 'react';

const DetectionCountsContext = createContext({
  allCounts: {},
  setAllCounts: () => {},
  typeFilter: '',
  setTypeFilter: () => {},
});

export const DetectionCountsProvider = ({ children }) => {
  const [allCounts, setAllCounts] = useState({});
  const [typeFilter, setTypeFilter] = useState('');

  return (
    <DetectionCountsContext.Provider value={{ allCounts, setAllCounts, typeFilter, setTypeFilter }}>
      {children}
    </DetectionCountsContext.Provider>
  );
};

export const useDetectionCounts = () => useContext(DetectionCountsContext);
