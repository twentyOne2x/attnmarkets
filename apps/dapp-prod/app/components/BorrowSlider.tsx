// apps/dapp/app/components/BorrowSlider.tsx
'use client';

import React from 'react';

interface BorrowSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  maxBorrowable: number;
  availableLiquidity: number;
  snapToAnchor: (value: number) => number;
}

const BorrowSlider: React.FC<BorrowSliderProps> = ({
  value,
  onChange,
  disabled = false,
  maxBorrowable,
  availableLiquidity,
  snapToAnchor
}) => {
  // Calculate what percentage of maxBorrowable is actually available
  const maxAllowedPercentage = maxBorrowable > 0 ? Math.min(100, Math.floor((availableLiquidity / maxBorrowable) * 100)) : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = parseInt(e.target.value);
    const snappedValue = snapToAnchor(rawValue);
    // Constrain to liquidity limit
    const constrainedValue = Math.min(snappedValue, maxAllowedPercentage);
    onChange(constrainedValue);
  };

  const anchors = [0, 25, 50, 75, 100];

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-50' : ''}`}>
      <label className="block text-sm font-medium">
        Amount to borrow: {value}% {value === 0 ? '($0)' : `($${(maxBorrowable * (value / 100)).toLocaleString()})`}
      </label>
      
      {/* Slider Container */}
      <div className="relative py-4 mb-4">
        {/* Track Background */}
        <div className="absolute top-1/2 left-0 right-0 h-2 bg-gray-700 rounded-full transform -translate-y-1/2"></div>
        
        {/* Progress Fill */}
        <div 
          className="absolute top-1/2 left-0 h-2 bg-gradient-to-r from-primary to-secondary rounded-full transform -translate-y-1/2 transition-all duration-75"
          style={{ width: `${value}%` }}
        ></div>
        
        {/* Anchor Points */}
        {anchors.map((anchor) => (
          <div
            key={anchor}
            className="absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10"
            style={{ left: `${anchor}%` }}
          >
            {/* Tick Mark */}
            <div className={`w-1 h-6 rounded-full ${
              value >= anchor ? 'bg-white' : 'bg-gray-400'
            } transition-colors duration-75`}></div>
            
            {/* Anchor Dot */}
            <div className={`w-3 h-3 rounded-full mt-1 ${
              value === anchor 
                ? 'bg-white shadow-lg' 
                : value > anchor 
                ? 'bg-primary' 
                : 'bg-gray-500'
            } transition-all duration-75`}></div>
          </div>
        ))}
        
        {/* Invisible Range Input */}
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="absolute top-1/2 left-0 w-full h-2 transform -translate-y-1/2 opacity-0 cursor-pointer z-20"
          style={{ margin: 0, padding: 0 }}
        />
        
        {/* Custom Thumb */}
        <div
          className="absolute top-1/2 w-6 h-6 bg-gradient-to-br from-blue-400 to-blue-600 border-3 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none transition-all duration-75"
          style={{ left: `${value}%` }}
        ></div>
      </div>
      
      {/* Labels */}
      <div className="relative">
        {anchors.map((anchor, index) => (
          <div
            key={anchor}
            className="absolute text-xs text-text-secondary whitespace-nowrap"
            style={{ 
              left: `${anchor}%`,
              transform: index === 0 ? 'translateX(0%)' : 
                        index === anchors.length - 1 ? 'translateX(-100%)' : 
                        'translateX(-50%)'
            }}
          >
            <div className="text-center">
              <div className="font-semibold">${(maxBorrowable * (anchor / 100)).toLocaleString()}</div>
              <div className="text-gray-400">({anchor}%)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BorrowSlider;