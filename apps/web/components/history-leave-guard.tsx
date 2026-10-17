'use client';
import { useEffect } from 'react';
import { initializeHistoryLeaveGuard } from '../lib/history-leave-guard';

export function HistoryLeaveGuard() {
  useEffect(() => {
    initializeHistoryLeaveGuard();
  }, []);
  return null;
}
