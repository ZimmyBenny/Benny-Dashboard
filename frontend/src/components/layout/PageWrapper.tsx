import React from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className = '' }: PageWrapperProps) {
  return (
    <div className={`flex-1 overflow-y-auto p-6 lg:p-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
