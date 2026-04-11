export interface EmlData {
  subject: string;
  from: string;
  date: string;
  preview: string;
}

/**
 * Parst eine .eml-Datei (RFC 822 / message/rfc822) und extrahiert
 * die wichtigsten Header sowie eine Body-Vorschau.
 * Kein externes Package — einfaches Regex-Parsing.
 */
export async function parseEml(file: File): Promise<EmlData> {
  const text = await file.text();

  // Header und Body trennen: erste Leerzeile ist die Trennlinie
  const separatorIndex = text.search(/\r?\n\r?\n/);
  const headerSection = separatorIndex >= 0 ? text.slice(0, separatorIndex) : text;
  const bodySection = separatorIndex >= 0 ? text.slice(separatorIndex).trim() : '';

  // Gefaltete Header (RFC 2822 folding: Zeile endet, nächste beginnt mit Whitespace)
  // Zusammenführen damit Regex über eine Zeile greifen kann
  const unfoldedHeaders = headerSection.replace(/\r?\n[ \t]+/g, ' ');

  function extractHeader(name: string): string {
    const pattern = new RegExp(`^${name}:[ \t]*(.+)$`, 'im');
    const match = unfoldedHeaders.match(pattern);
    return match ? match[1].trim() : '';
  }

  const subject = decodeRfc2047(extractHeader('Subject')) || '(kein Betreff)';
  const from = decodeRfc2047(extractHeader('From')) || '(unbekannter Absender)';
  const date = extractHeader('Date') || '';

  // Body-Vorschau: quoted-printable / base64 überspringen — nur Plaintext-Teile verwenden
  const preview = extractBodyPreview(bodySection);

  return { subject, from, date, preview };
}

/**
 * Dekodiert RFC 2047 encoded-words (=?charset?encoding?text?=).
 * Unterstützt Q-Encoding und B-Encoding (Base64).
 */
function decodeRfc2047(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        // Base64
        return decodeURIComponent(
          Array.from(atob(text))
            .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('')
        );
      } else {
        // Q-Encoding: _ = Leerzeichen, =XX = Hex-Byte
        const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return decoded;
      }
    } catch {
      return text;
    }
  });
}

/**
 * Extrahiert eine lesbare Vorschau aus dem E-Mail-Body.
 * Versucht den text/plain-Part zu finden; fällt auf ungeparsten Body zurück.
 * Gibt maximal 200 Zeichen zurück.
 */
function extractBodyPreview(body: string): string {
  if (!body) return '';

  // MIME-Multipart: boundary suchen
  const boundaryMatch = body.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    for (const part of parts) {
      const partLower = part.toLowerCase();
      if (partLower.includes('content-type: text/plain')) {
        const partBody = extractPartBody(part);
        if (partBody) return truncate(stripQuotedLines(partBody));
      }
    }
    // Kein text/plain — erstes Teil mit Inhalt nehmen
    for (const part of parts) {
      const partBody = extractPartBody(part);
      if (partBody && partBody.trim().length > 10) {
        return truncate(stripQuotedLines(partBody));
      }
    }
  }

  // Kein Multipart — body direkt verwenden, aber quoted-printable / base64 überspringen
  const lines = body.split(/\r?\n/);
  const plainLines: string[] = [];
  for (const line of lines) {
    // Base64-Zeilen (nur [A-Za-z0-9+/=]) überspringen
    if (/^[A-Za-z0-9+/=]{40,}$/.test(line.trim())) continue;
    // Quoted-printable-Zeilen mit vielen =XX überspringen
    if ((line.match(/=[0-9A-F]{2}/g) ?? []).length > 4) continue;
    plainLines.push(line);
    if (plainLines.join(' ').length > 300) break;
  }

  return truncate(stripQuotedLines(plainLines.join(' ')));
}

function extractPartBody(part: string): string {
  const sep = part.search(/\r?\n\r?\n/);
  if (sep < 0) return '';
  return part.slice(sep).trim();
}

function stripQuotedLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('>'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
