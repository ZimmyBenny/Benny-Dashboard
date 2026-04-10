import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from '../../components/ui/Card';

describe('Card', () => {
  it('rendert children', () => {
    render(<Card>Inhalt</Card>);
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('hat die glass-card CSS-Klasse', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('glass-card');
  });

  it('hat rounded-2xl Klasse', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('rounded-2xl');
  });

  it('rendert als div per default', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('rendert als article wenn as="article"', () => {
    const { container } = render(<Card as="article">Test</Card>);
    expect(container.firstChild?.nodeName).toBe('ARTICLE');
  });

  it('rendert als section wenn as="section"', () => {
    const { container } = render(<Card as="section">Test</Card>);
    expect(container.firstChild?.nodeName).toBe('SECTION');
  });

  it('fuegt zusaetzliche className hinzu', () => {
    const { container } = render(<Card className="extra-class">Test</Card>);
    expect(container.firstChild).toHaveClass('extra-class');
  });

  it('setzt role=button wenn onClick gesetzt', () => {
    const { container } = render(<Card onClick={() => {}}>Test</Card>);
    expect(container.firstChild).toHaveAttribute('role', 'button');
  });

  it('ruft onClick auf bei Klick', async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Card onClick={() => { clicked = true; }}>Test</Card>);
    await user.click(screen.getByText('Test'));
    expect(clicked).toBe(true);
  });

  it('enthält kein raw hex', () => {
    const cardSource = Card.toString();
    expect(cardSource).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
