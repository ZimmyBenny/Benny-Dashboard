import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../../components/ui/Input';

describe('Input', () => {
  it('rendert ein input-Element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('rendert label wenn angegeben', () => {
    render(<Input label="E-Mail" />);
    expect(screen.getByText('E-Mail')).toBeInTheDocument();
  });

  it('label ist mit input via htmlFor/id verknuepft', () => {
    render(<Input label="Passwort" />);
    const label = screen.getByText('Passwort');
    const input = screen.getByRole('textbox');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('rendert kein label wenn nicht angegeben', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('rendert error-Text wenn error-Prop gesetzt', () => {
    render(<Input error="Pflichtfeld" />);
    expect(screen.getByText('Pflichtfeld')).toBeInTheDocument();
  });

  it('rendert keinen error-Text wenn error nicht gesetzt', () => {
    render(<Input />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Default-Background ist --color-surface-container-low', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input.style.backgroundColor).toBe('var(--color-surface-container-low)');
  });

  it('Error-State: border wechselt zu --color-error', () => {
    render(<Input error="Fehler!" />);
    const input = screen.getByRole('textbox');
    expect(input.style.border).toContain('var(--color-error)');
  });

  it('Error-State: boxShadow ist --glow-error', () => {
    render(<Input error="Fehler!" />);
    const input = screen.getByRole('textbox');
    expect(input.style.boxShadow).toBe('var(--glow-error)');
  });

  it('ist volle Breite (w-full im container)', () => {
    const { container } = render(<Input />);
    expect(container.firstChild).toHaveClass('w-full');
  });

  it('gibt value weiter via spread props', async () => {
    const user = userEvent.setup();
    render(<Input defaultValue="" placeholder="Tippen..." />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Hallo');
    expect(input).toHaveValue('Hallo');
  });

  it('disabled setzt das disabled-Attribut', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
