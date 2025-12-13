import React from 'react';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
}

const GlassPanel: React.FC<GlassPanelProps> = ({ children, className = '' }) => {
  return (
    <div className={`glass-panel rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
};

export default GlassPanel;
