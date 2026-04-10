import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section';
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  onClick,
  hoverable = false,
}: CardProps) {
  const hoverStyle: React.CSSProperties = hoverable
    ? {
        transition: 'box-shadow 200ms ease',
      }
    : {};

  const hoverClasses = hoverable
    ? 'hover:[box-shadow:var(--glow-primary)] cursor-default'
    : '';

  const clickableProps = onClick
    ? {
        onClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        },
        style: { ...hoverStyle, cursor: 'pointer' },
        className: `glass-card rounded-2xl ${hoverClasses} ${className}`.trim(),
      }
    : {
        style: hoverStyle,
        className: `glass-card rounded-2xl ${hoverClasses} ${className}`.trim(),
      };

  return <Tag {...clickableProps}>{children}</Tag>;
}
