import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

interface CreatorTourOverlayProps {
  targetRef: React.RefObject<HTMLElement>;
  visible: boolean;
  onClose: () => void;
  onFocusTarget: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HIGHLIGHT_PADDING = 12;

const CreatorTourOverlay: React.FC<CreatorTourOverlayProps> = ({
  targetRef,
  visible,
  onClose,
  onFocusTarget,
}) => {
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;

    const updateRect = () => {
      if (!targetRef.current) {
        setTargetRect(null);
        return;
      }
      const rect = targetRef.current.getBoundingClientRect();
      setTargetRect({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [visible, targetRef]);

  const calloutPosition = useMemo(() => {
    if (!targetRect) {
      return {
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
      } as React.CSSProperties;
    }

    const top = targetRect.top + targetRect.height + HIGHLIGHT_PADDING + 16;
    const left = targetRect.left + targetRect.width / 2;

    return {
      top,
      left,
      transform: 'translateX(-50%)',
    } as React.CSSProperties;
  }, [targetRect]);

  if (!mounted || !visible) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000]">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        role="presentation"
      />
      {targetRect && (
        <div
          className="pointer-events-none absolute rounded-2xl"
          style={{
            top: targetRect.top - HIGHLIGHT_PADDING,
            left: targetRect.left - HIGHLIGHT_PADDING,
            width: targetRect.width + HIGHLIGHT_PADDING * 2,
            height: targetRect.height + HIGHLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            border: '1px solid rgba(59, 130, 246, 0.45)',
          }}
        />
      )}
      <div
        className="pointer-events-auto absolute mx-auto w-full max-w-xs px-4 sm:max-w-sm"
        style={calloutPosition}
      >
        <div className="relative">
          <div
            className={clsx(
              'absolute left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-full rotate-45 border border-primary/30 bg-gray-900/90'
            )}
          />
          <div className="relative rounded-xl border border-primary/30 bg-gray-900/95 p-5 text-sm text-gray-100 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Start with your Squads safe</h3>
            <p className="mt-2 text-xs text-gray-300">
              Flip the Live checklist switch here to spin up your creator+attn safe.
              We&apos;ll unlock advances and auto-sweeps once this step is complete.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-dark hover:bg-primary/90"
                onClick={() => {
                  onFocusTarget();
                  onClose();
                }}
              >
                Take me there
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-600 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700/60"
                onClick={onClose}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CreatorTourOverlay;
