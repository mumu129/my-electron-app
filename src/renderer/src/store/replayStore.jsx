// src/renderer/src/store/replayStore.jsx
import { createContext, useContext } from 'react';

export const ReplayContext = createContext(null);
export const useReplay = () => useContext(ReplayContext);