
import React from 'react';

interface RulerProps {
  marginLeft: number; // in cm
  marginRight: number; // in cm
  width: number; // in px
}

export const Ruler: React.FC<RulerProps> = ({ marginLeft, marginRight, width }) => {
  // Constants
  const CM_TO_PX = 37.8; // Approx 1cm in 96 DPI
  const THEME_COLOR = '#56FF95'; // Neon Green
  
  const paddingLeftPx = marginLeft * CM_TO_PX;
  const paddingRightPx = marginRight * CM_TO_PX;
  
  // Ticks generation
  const ticks = [];
  const majorTickInterval = CM_TO_PX; 
  const totalTicks = Math.floor(width / majorTickInterval);

  for (let i = 0; i <= totalTicks; i++) {
    const pos = i * majorTickInterval;
    // Don't draw outside margins too much if not needed, but ruler usually spans full width
    if (pos > width) break;
    
    ticks.push(
      <div 
        key={i} 
        className="absolute top-0 flex flex-col items-center"
        style={{ 
            left: `${pos}px`,
            height: '100%',
            transform: 'translateX(-50%)'
        }}
      >
        {/* Number (Major Ticks only) */}
        {i > 0 && i < totalTicks && (
            <span 
                className="text-[10px] font-sans font-medium mb-0.5 select-none"
                style={{ color: THEME_COLOR }}
            >
                {i}
            </span>
        )}
        
        {/* Tick Line */}
        <div 
            className="w-px bg-current opacity-60"
            style={{ 
                height: i > 0 && i < totalTicks ? '6px' : '10px',
                backgroundColor: THEME_COLOR 
            }}
        />
      </div>
    );
    
    // Minor Ticks (0.5cm)
    if (i < totalTicks) {
        ticks.push(
            <div
                key={`minor-${i}`}
                className="absolute bottom-0 w-px opacity-40"
                style={{
                    left: `${pos + (majorTickInterval / 2)}px`,
                    height: '4px',
                    backgroundColor: THEME_COLOR
                }}
            />
        );
    }
  }

  return (
    <div 
        className="w-full h-6 relative select-none overflow-hidden"
        style={{ 
            backgroundColor: '#000000', 
            borderBottom: `1px solid ${THEME_COLOR}30` 
        }}
    >
        {/* Active Area Highlight (Optional, subtle) */}
        <div 
            className="absolute h-full top-0" 
            style={{ 
                left: paddingLeftPx, 
                right: paddingRightPx,
                backgroundColor: `${THEME_COLOR}08`
            }} 
        />
        
        {/* Ticks Container */}
        <div className="absolute inset-0 pointer-events-none">
            {ticks}
        </div>

        {/* Left Margin Marker */}
        <div 
            className="absolute top-0 h-full w-0 z-10 group cursor-ew-resize"
            style={{ left: paddingLeftPx }}
            title={`Margem Esquerda: ${marginLeft}cm`}
        >
             <div className="absolute top-0 -left-1.5 w-3 h-3 border-l border-b transform rotate-45 origin-center" style={{ borderColor: THEME_COLOR, backgroundColor: '#000' }}></div>
             <div className="absolute bottom-0 -left-px w-px h-full opacity-50 border-l border-dashed" style={{ borderColor: THEME_COLOR }}></div>
        </div>

        {/* Right Margin Marker */}
        <div 
            className="absolute top-0 h-full w-0 z-10 group cursor-ew-resize"
            style={{ right: paddingRightPx }}
            title={`Margem Direita: ${marginRight}cm`}
        >
             <div className="absolute top-0 -right-1.5 w-3 h-3 border-r border-b transform -rotate-45 origin-center" style={{ borderColor: THEME_COLOR, backgroundColor: '#000' }}></div>
             <div className="absolute bottom-0 -right-px w-px h-full opacity-50 border-r border-dashed" style={{ borderColor: THEME_COLOR }}></div>
        </div>
    </div>
  );
};
