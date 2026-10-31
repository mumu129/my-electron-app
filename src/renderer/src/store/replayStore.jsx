// src/renderer/src/store/replayStore.jsx
import { createContext, useContext } from 'react'

export const ReplayContext = createContext({ sendToReplay: () => {} })
export const useReplay = () => useContext(ReplayContext) || { sendToReplay: () => {} }