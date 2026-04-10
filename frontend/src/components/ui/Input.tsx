import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const baseStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    width: '100%',
    borderRadius: '0.5rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    transition: 'all 200ms ease',
    border: error
      ? '1px solid var(--color-error)'
      : '1px solid transparent',
    boxShadow: error ? 'var(--glow-error)' : 'none',
  };

  const focusHandlers = !error
    ? {
        onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
          e.currentTarget.style.border = '1px solid var(--color-secondary)';
          e.currentTarget.style.boxShadow = 'var(--glow-secondary)';
        },
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
          e.currentTarget.style.border = '1px solid transparent';
          e.currentTarget.style.boxShadow = 'none';
        },
      }
    : {};

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label
          htmlFor={inputId}
          style={{
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-label)',
            fontSize: '0.875rem',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={className}
        style={baseStyle}
        {...focusHandlers}
        {...rest}
      />
      {error && (
        <span
          style={{
            color: 'var(--color-error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
