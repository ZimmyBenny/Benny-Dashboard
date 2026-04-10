import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

const primaryStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
  color: 'var(--color-on-primary-fixed)',
  borderRadius: '9999px',
};

const secondaryStyle: React.CSSProperties = {
  background: 'transparent',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: '9999px',
  border: '1px solid',
  borderColor: 'color-mix(in srgb, var(--color-outline-variant) 30%, transparent)',
  color: 'var(--color-on-surface)',
};

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const baseClasses =
    'px-6 py-2.5 font-semibold transition-all duration-200 outline-hidden ' +
    'focus:ring-3 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const isPrimary = variant === 'primary';

  const variantStyle = isPrimary ? primaryStyle : secondaryStyle;

  const hoverHandler = isPrimary
    ? {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            'var(--glow-primary)';
        },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        },
      }
    : {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'rgba(255, 255, 255, 0.05)';
        },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        },
      };

  return (
    <button
      className={`${baseClasses} ${className}`.trim()}
      style={variantStyle}
      {...hoverHandler}
      {...rest}
    >
      {children}
    </button>
  );
}
