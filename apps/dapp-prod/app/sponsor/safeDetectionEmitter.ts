import type { CreatedSafe, SafeDetectionEventDetail } from './types';

type Listener = (detail: SafeDetectionEventDetail) => void;

const listeners = new Set<Listener>();

const isTestEnvironment = () => process.env.NEXT_PUBLIC_ATTN_TEST === '1';

export const emitSafeDetected = (detail: SafeDetectionEventDetail): void => {
  if (!isTestEnvironment()) {
    return;
  }
  listeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (err) {
      console.warn('Safe detection test listener failed', err);
    }
  });
};

export const subscribeToSafeDetection = (listener: Listener): (() => void) => {
  if (!isTestEnvironment()) {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitSafeDetectedRecord = (record: CreatedSafe, type: SafeDetectionEventDetail['type'] = 'existing'): void => {
  emitSafeDetected({ record, type });
};

declare global {
  interface Window {
    __attnEmitSafeDetected?: (record: CreatedSafe, type?: SafeDetectionEventDetail['type']) => void;
  }
}

if (typeof window !== 'undefined' && isTestEnvironment()) {
  window.__attnEmitSafeDetected = (record: CreatedSafe, type: SafeDetectionEventDetail['type'] = 'existing') => {
    emitSafeDetectedRecord(record, type);
  };
}
