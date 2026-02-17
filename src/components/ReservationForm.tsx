import { FormEvent, useMemo, useState } from "react";
import type { User } from "../lib/types";
import { triggerHaptic } from "../lib/utils";

type Props = {
  currentUser: User;
  onCreate: (payload: {
    courtName: string;
    startDateTime: string;
    durationMinutes: number;
  }) => void;
  onCancel: () => void;
};

const SUGGESTED_TIMES = ["17:00", "18:30", "20:00"] as const;

const getTodayLocalDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isHalfHourSlot = (time: string): boolean => {
  const parts = time.split(":");
  if (parts.length !== 2) return false;
  const minute = Number(parts[1]);
  return minute === 0 || minute === 30;
};

export default function ReservationForm({ onCreate, onCancel, currentUser }: Props) {
  const [courtName, setCourtName] = useState<"Cancha 1" | "Cancha 2">("Cancha 1");
  const [reservationDate, setReservationDate] = useState(getTodayLocalDate());
  const [selectedTime, setSelectedTime] = useState<(typeof SUGGESTED_TIMES)[number]>("17:00");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(90);

  const finalTime = useMemo(() => (useCustomTime ? customTime : selectedTime), [customTime, selectedTime, useCustomTime]);
  const hasValidTime = useMemo(() => isHalfHourSlot(finalTime), [finalTime]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!courtName || !reservationDate || !finalTime || !hasValidTime || durationMinutes <= 0) return;
    onCreate({ courtName, startDateTime: `${reservationDate}T${finalTime}`, durationMinutes });
    triggerHaptic("medium");
  };

  const handleChoiceHaptic = (action: () => void) => {
    action();
    triggerHaptic("light");
  };

  return (
    <form className="elite-form" onSubmit={handleSubmit}>
      <header className="form-header-elite">
        <h2>Reservá un partido</h2>
        <p>{currentUser.name}, seleccioná los detalles del turno.</p>
      </header>

      <div className="elite-field-group">
        <label className="elite-field-label">Cancha</label>
        <div className="elite-choice-grid">
          <button
            type="button"
            className={`elite-btn-choice ${courtName === "Cancha 1" ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setCourtName("Cancha 1"))}
          >
            Cancha 1
          </button>
          <button
            type="button"
            className={`elite-btn-choice ${courtName === "Cancha 2" ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setCourtName("Cancha 2"))}
          >
            Cancha 2
          </button>
        </div>
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Fecha del turno</label>
        <input type="date" className="elite-input" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
      </div>

      <div className="elite-field-group">
        <label className="elite-field-label">Horario</label>
        <div className="elite-choice-grid times">
          {SUGGESTED_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              className={`elite-btn-choice ${selectedTime === time && !useCustomTime ? "active" : ""}`}
              onClick={() => handleChoiceHaptic(() => { setUseCustomTime(false); setSelectedTime(time); })}
            >
              {time}
            </button>
          ))}
          <button
            type="button"
            className={`elite-btn-choice icon-btn ${useCustomTime ? "active" : ""}`}
            onClick={() => handleChoiceHaptic(() => setUseCustomTime(!useCustomTime))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            Otro
          </button>
        </div>
      </div>

      {useCustomTime && (
        <div className="elite-field-group animate-in">
          <label className="elite-field-label">Horario específico (00 o 30 min)</label>
          <input type="time" className="elite-input" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800} required />
          {!hasValidTime && <p className="elite-error">El horario debe ser en bloques de 30 min.</p>}
        </div>
      )}

      <div className="elite-field-group">
        <label className="elite-field-label">Duración</label>
        <select className="elite-select" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
          <option value={60}>60 minutos</option>
          <option value={90}>90 minutos</option>
          <option value={120}>120 minutos</option>
        </select>
      </div>

      <footer className="form-actions-elite">
        <button type="submit" className="btn-primary-elite" disabled={!hasValidTime}>Confirmar Reserva</button>
        <button type="button" className="btn-ghost-elite" onClick={onCancel}>Cancelar</button>
      </footer>
    </form>
  );
}
