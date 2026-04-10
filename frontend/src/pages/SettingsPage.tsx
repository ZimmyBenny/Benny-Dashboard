import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { logoutRequest } from '../api/auth.api';
import { changePassword } from '../api/user.api';

declare const __APP_VERSION__: string;

export function SettingsPage() {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwoerter stimmen nicht ueberein.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen haben.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      setSuccess('Passwort erfolgreich geaendert.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err
      ) {
        const response = (err as { response?: { data?: { error?: string } } }).response;
        setError(response?.data?.error ?? 'Passwort konnte nicht geaendert werden.');
      } else {
        setError('Passwort konnte nicht geaendert werden.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await logoutRequest();
    navigate('/login', { replace: true });
  }

  return (
    <PageWrapper>
      <h1
        className="text-3xl font-bold mb-8"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        Einstellungen
      </h1>

      <div className="space-y-6">
        {/* App-Version */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Ueber die App
            </h2>
            <p style={{ color: 'var(--color-on-surface-variant)' }}>
              Benny Dashboard v{__APP_VERSION__}
            </p>
          </div>
        </Card>

        {/* Passwort aendern */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-4"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Passwort aendern
            </h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <Input
                label="Aktuelles Passwort"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Input
                label="Neues Passwort"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Input
                label="Neues Passwort bestaetigen"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {error && (
                <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm" style={{ color: 'var(--color-primary)' }}>
                  {success}
                </p>
              )}
              <div>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Wird geaendert...' : 'Passwort aendern'}
                </Button>
              </div>
            </form>
          </div>
        </Card>

        {/* Session / Logout */}
        <Card>
          <div className="p-6">
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              Session
            </h2>
            <p className="mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
              Aktive Session beenden und zum Login zurueckkehren.
            </p>
            <Button variant="secondary" type="button" onClick={handleLogout}>
              Abmelden
            </Button>
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}
