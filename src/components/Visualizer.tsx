import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  level: number; // 0 to 1
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, level }) => {
  const bars = 5;
  
  return (
    <div className={`flex items-center justify-center gap-1.5 h-16 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
      {Array.from({ length: bars }).map((_, i) => {
        // Calculate a varied height based on level and index to create a wave effect
        const dynamicHeight = isActive 
          ? Math.max(10, Math.min(60, level * 150 * (Math.sin(i) + 1.5))) 
          : 4;
        
        return (
          <div
            key={i}
            className="w-2 bg-bible-gold rounded-full transition-all duration-75 ease-out"
            style={{
              height: `${dynamicHeight}px`,
              opacity: isActive ? 0.8 : 0.3
            }}
          />
        );
      })}
    </div>
  );
};

export default Visualizer;
