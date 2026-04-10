import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../components/ui/Button';

describe('Button', () => {
  it('rendert children', () => {
    render(<Button>Klick mich</Button>);
    expect(screen.getByText('Klick mich')).toBeInTheDocument();
  });

  it('ist ein button-Element', () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('Primary-Variante: hat Gradient-Background im style', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.background).toContain('linear-gradient');
  });

  it('Primary-Variante: Text-Farbe ist --color-on-primary-fixed', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.color).toBe('var(--color-on-primary-fixed)');
  });

  it('Primary-Variante: border-radius ist 9999px (fully rounded)', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.borderRadius).toBe('9999px');
  });

  it('Secondary-Variante: background ist transparent', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.background).toBe('transparent');
  });

  it('Secondary-Variante: Text-Farbe ist --color-on-surface', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.color).toBe('var(--color-on-surface)');
  });

  it('Secondary-Variante: border-radius ist 9999px', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.borderRadius).toBe('9999px');
  });

  it('default variant ist primary wenn nicht angegeben', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button');
    expect(btn.style.background).toContain('linear-gradient');
  });

  it('disabled setzt das disabled-Attribut', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('ruft onClick auf bei Klick', async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Test</Button>);
    await user.click(screen.getByRole('button'));
    expect(clicked).toBe(true);
  });

  it('fuegt zusaetzliche className hinzu', () => {
    render(<Button className="extra">Test</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra');
  });
});
