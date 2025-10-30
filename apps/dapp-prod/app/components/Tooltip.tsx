// apps/dapp/app/components/Tooltip.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
  autoHideOnClickMs?: number;
}

export default function Tooltip({
  children,
  content,
  className = '',
  autoHideOnClickMs = 3200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showTooltip = (withAutoHide = false) => {
    clearHideTimer();
    setIsVisible(true);
    if (withAutoHide && autoHideOnClickMs > 0) {
      hideTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        hideTimerRef.current = null;
      }, autoHideOnClickMs);
    }
  };

  const hideTooltip = () => {
    clearHideTimer();
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setPosition({
        top: rect.top + scrollTop + (rect.height / 2), // center vertically with trigger
        left: rect.right + scrollLeft + 15, // 15px to the right of trigger
      });
    }
  }, [isVisible]);

  const tooltipContent = isVisible ? createPortal(
    <div 
      className="absolute z-[99999] pointer-events-none"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateY(-50%)', // center vertically
      }}
    >
      <div className="bg-dark-card border border-gray-600 rounded-lg px-4 py-3 text-sm text-text-primary w-80 shadow-2xl whitespace-pre-line relative">
        {content}
        {/* Left-pointing arrow */}
        <div 
          className="absolute top-1/2 -left-2 transform -translate-y-1/2"
          style={{
            width: 0,
            height: 0,
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderRight: '8px solid rgb(75, 85, 99)', // border-gray-600 color
          }}
        ></div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div 
        ref={triggerRef}
        className={`relative inline-block ${className}`}
        onMouseEnter={() => showTooltip(false)}
        onMouseLeave={hideTooltip}
        onFocus={() => showTooltip(false)}
        onBlur={hideTooltip}
        onClick={() => showTooltip(true)}
      >
        {children}
      </div>
      {tooltipContent}
    </>
  );
}
