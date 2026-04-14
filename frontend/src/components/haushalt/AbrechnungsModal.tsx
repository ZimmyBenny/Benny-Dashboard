import { useState, useEffect, useRef } from 'react';
import type { HaushaltEintrag, HaushaltSaldo } from '../../api/haushalt.api';
import { createAbrechnung } from '../../api/haushalt.api';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function aktuellMonatJahr(): string {
  const jetzt = new Date();
  return jetzt.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function formatBetrag(betrag: number): string {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AbrechnungsModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  saldo: HaushaltSaldo;
  eintraege: HaushaltEintrag[];
}

// ---------------------------------------------------------------------------
// AbrechnungsModal — Draggable am Header (CLAUDE.md Regel)
// ---------------------------------------------------------------------------

export function AbrechnungsModal({ open, onClose, onCreated, saldo, eintraege }: AbrechnungsModalProps) {
  const [titel, setTitel] = useState('');
  const [notiz, setNotiz] = useState('');
  const [saving, setSaving] = useState(false);

  // Drag-State
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Reset beim Öffnen
  useEffect(() => {
    if (open) {
      setTitel(aktuellMonatJahr());
      setNotiz('');
      setSaving(false);
      setPos(null);
    }
  }, [open]);

  // Drag-Listener global
  useEffect(() => {
    if (!open) return;

    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.x),
        y: dragStart.current.py + (e.clientY - dragStart.current.y),
      });
    }
    function onMouseUp() {
      isDragging.current = false;
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [open]);

  function onHeaderMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      px: pos?.x ?? 0,
      py: pos?.y ?? 0,
    };
    e.preventDefault();
  }

  // Zusammenfassung berechnen
  const summeBenny = eintraege
    .filter(e => e.bezahlt_von === 'benny' && e.eintrag_typ === 'ausgabe')
    .reduce((s, e) => s + e.betrag, 0);
  const summeJulia = eintraege
    .filter(e => e.bezahlt_von === 'julia' && e.eintrag_typ === 'ausgabe')
    .reduce((s, e) => s + e.betrag, 0);
  const summeBennyGeld = eintraege
    .filter(e => e.bezahlt_von === 'benny' && e.eintrag_typ === 'geldübergabe')
    .reduce((s, e) => s + e.betrag, 0);
  const summeJuliaGeld = eintraege
    .filter(e => e.bezahlt_von === 'julia' && e.eintrag_typ === 'geldübergabe')
    .reduce((s, e) => s + e.betrag, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setSaving(true);
    try {
      await createAbrechnung({ titel: titel.trim(), notiz: notiz.trim() || undefined });
      onCreated();
      onClose();
    } catch (err) {
      console.error('Fehler beim Erstellen der Abrechnung:', err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 60,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.75rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    width: '480px',
    maxWidth: 'calc(100vw - 2rem)',
    maxHeight: 'calc(100vh - 4rem)',
    overflowY: 'auto',
    ...(pos
      ? { left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)`, transform: 'translate(-50%, -50%)' }
      : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    ),
  };

  const saldoPositiv = saldo.saldo > 0;
  const saldoNeutral = saldo.saldo === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 55,
        }}
      />

      {/* Modal */}
      <div style={modalStyle} onClick={e => e.stopPropagation()}>

        {/* Draggable Header */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface-container)',
            borderRadius: '0.75rem 0.75rem 0 0',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-outline)', fontSize: '1rem' }}>drag_indicator</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-display)', color: 'var(--color-on-surface)' }}>
              Abrechnung erstellen
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-outline)', cursor: 'pointer', padding: '0.25rem', display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
          </button>
        </div>

        {/* Inhalt */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Zusammenfassung */}
          <div style={{
            background: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem',
            padding: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--color-outline)' }}>Offene Einträge</span>
              <span style={{ color: 'var(--color-on-surface)', fontWeight: 600 }}>{saldo.offene_eintraege}</span>
            </div>
            {summeBenny > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--color-outline)' }}>Benny bezahlt (Ausgaben)</span>
                <span style={{ color: 'var(--color-on-surface)' }}>{formatBetrag(summeBenny)} EUR</span>
              </div>
            )}
            {summeJulia > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--color-outline)' }}>Julia bezahlt (Ausgaben)</span>
                <span style={{ color: 'var(--color-on-surface)' }}>{formatBetrag(summeJulia)} EUR</span>
              </div>
            )}
            {summeBennyGeld > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--color-outline)' }}>Benny → Julia (Geld)</span>
                <span style={{ color: 'var(--color-on-surface)' }}>{formatBetrag(summeBennyGeld)} EUR</span>
              </div>
            )}
            {summeJuliaGeld > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--color-outline)' }}>Julia → Benny (Geld)</span>
                <span style={{ color: 'var(--color-on-surface)' }}>{formatBetrag(summeJuliaGeld)} EUR</span>
              </div>
            )}
            <div style={{
              borderTop: '1px solid var(--color-outline-variant)',
              paddingTop: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
            }}>
              <span style={{ color: 'var(--color-outline)', fontWeight: 600 }}>Net-Saldo</span>
              <span style={{
                fontWeight: 700,
                color: saldoNeutral
                  ? 'var(--color-outline)'
                  : saldoPositiv
                  ? 'var(--color-primary)'
                  : 'var(--color-error)',
              }}>
                {saldoPositiv ? '+' : ''}{formatBetrag(saldo.saldo)} EUR
                {!saldoNeutral && (
                  <span style={{ fontSize: '0.75rem', marginLeft: '0.25rem', opacity: 0.8 }}>
                    ({saldoPositiv ? 'Julia zahlt Benny' : 'Benny zahlt Julia'})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Titel */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: 'var(--color-outline)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-body)',
            }}>Titel</label>
            <input
              type="text"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              required
              style={{
                width: '100%',
                background: 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                padding: '0.5rem 0.75rem',
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          {/* Notiz */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: 'var(--color-outline)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-body)',
            }}>Notiz (optional)</label>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              rows={3}
              placeholder="Optionale Notiz zur Abrechnung…"
              style={{
                width: '100%',
                background: 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                padding: '0.5rem 0.75rem',
                outline: 'none',
                boxSizing: 'border-box' as const,
                resize: 'vertical',
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-outline-variant)',
                background: 'transparent',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving || !titel.trim()}
              style={{
                flex: 2,
                padding: '0.625rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: (saving || !titel.trim()) ? 'var(--color-outline)' : 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
                color: 'var(--color-on-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: (saving || !titel.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Wird erstellt…' : 'Abrechnung bestätigen'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
