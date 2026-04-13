#!/bin/bash
# ─────────────────────────────────────────────
# Benny Dashboard — Starter (Doppelklick im Finder)
# Startet Backend + Frontend und öffnet den Browser.
# ─────────────────────────────────────────────

BASE="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Benny Dashboard wird gestartet..."
echo ""

# ── Alte Prozesse stoppen ──
echo "⏹  Stoppe alte Prozesse (falls vorhanden)..."
OLD_BACKEND=$(lsof -ti :3001 2>/dev/null)
OLD_FRONTEND=$(lsof -ti :5173 2>/dev/null)
[ -n "$OLD_BACKEND" ]  && kill $OLD_BACKEND  2>/dev/null && echo "   Backend (Port 3001) gestoppt."
[ -n "$OLD_FRONTEND" ] && kill $OLD_FRONTEND 2>/dev/null && echo "   Frontend (Port 5173) gestoppt."
sleep 1

# ── Frontend starten (einmalig, Vite läuft stabil) ──
echo "▶  Frontend starten (Port 5173)..."
cd "$BASE/frontend"
npm run dev > /tmp/benny-frontend.log 2>&1 &
FRONTEND_PID=$!

# ── Backend starten mit Auto-Restart-Loop ──
# Der Loop sorgt dafür dass das Backend automatisch neu startet,
# wenn der "Neu starten"-Button im Dashboard gedrückt wird.
echo "▶  Backend starten (Port 3001, mit Auto-Restart)..."
(
  while true; do
    cd "$BASE/backend"
    npm run dev >> /tmp/benny-backend.log 2>&1
    EXIT_CODE=$?
    echo "[$(date '+%H:%M:%S')] Backend beendet (Exit $EXIT_CODE). Neustart in 1 Sekunde..." >> /tmp/benny-backend.log
    sleep 1
  done
) &
BACKEND_LOOP_PID=$!

# ── Warten bis beide bereit sind ──
echo ""
echo "⏳ Warte auf Start (ca. 4 Sekunden)..."
sleep 4

# ── Status prüfen ──
BACKEND_OK=$(lsof -ti :3001 2>/dev/null)
FRONTEND_OK=$(lsof -ti :5173 2>/dev/null)

echo ""
if [ -n "$BACKEND_OK" ] && [ -n "$FRONTEND_OK" ]; then
  echo "✅ Backend  läuft  (Port 3001)"
  echo "✅ Frontend läuft  (Port 5173)"
  echo ""
  echo "🌐 Öffne Browser..."
  open "http://localhost:5173"
  echo ""
  echo "────────────────────────────────────"
  echo " Das Dashboard ist bereit."
  echo " Dieses Fenster offen lassen!"
  echo " Schließen beendet alles."
  echo "────────────────────────────────────"
else
  [ -z "$BACKEND_OK" ]  && echo "❌ Backend  konnte nicht starten."
  [ -z "$FRONTEND_OK" ] && echo "❌ Frontend konnte nicht starten."
  echo ""
  echo "Tipp: 'cat /tmp/benny-backend.log' für Details."
fi

# ── Offen halten (Ctrl+C oder Fenster schließen beendet alles) ──
trap "kill $FRONTEND_PID $BACKEND_LOOP_PID 2>/dev/null; echo ''; echo 'Dashboard gestoppt.'; exit 0" INT TERM
wait
