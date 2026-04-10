import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageWrapper } from '../../components/layout/PageWrapper';

describe('PageWrapper', () => {
  it('rendert children', () => {
    render(<PageWrapper>Seiteninhalt</PageWrapper>);
    expect(screen.getByText('Seiteninhalt')).toBeInTheDocument();
  });

  it('hat flex-1 Klasse', () => {
    const { container } = render(<PageWrapper>Test</PageWrapper>);
    expect(container.firstChild).toHaveClass('flex-1');
  });

  it('hat overflow-y-auto Klasse', () => {
    const { container } = render(<PageWrapper>Test</PageWrapper>);
    expect(container.firstChild).toHaveClass('overflow-y-auto');
  });

  it('hat p-6 als default Padding', () => {
    const { container } = render(<PageWrapper>Test</PageWrapper>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('hat lg:p-8 fuer groessere Screens', () => {
    const { container } = render(<PageWrapper>Test</PageWrapper>);
    expect(container.firstChild).toHaveClass('lg:p-8');
  });

  it('fuegt zusaetzliche className hinzu', () => {
    const { container } = render(<PageWrapper className="extra">Test</PageWrapper>);
    expect(container.firstChild).toHaveClass('extra');
  });

  it('rendert als div', () => {
    const { container } = render(<PageWrapper>Test</PageWrapper>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });
});
