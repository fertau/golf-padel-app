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

  return (
    <form className="list" onSubmit={handleSubmit}>
      <div className="panel">
        <h3 className="section-title">Detalles del turno</h3>
        <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", margin: "-0.5rem 0 0.5rem" }}>
          Hola {currentUser.name}, seleccioná el horario de tu partido.
        </p>

        <div className="field-group">
          <span className="field-title">Cancha</span>
          <div className="choice-row">
            <button
              type="button"
              className={`choice-btn ${courtName === "Cancha 1" ? "active" : ""}`}
              onClick={() => setCourtName("Cancha 1")}
            >
              Cancha 1
            </button>
            <button
              type="button"
              className={`choice-btn ${courtName === "Cancha 2" ? "active" : ""}`}
              onClick={() => setCourtName("Cancha 2")}
            >
              Cancha 2
            </button>
          </div>
        </div>

        <div className="field-group">
          <span className="field-title">Fecha del turno</span>
          <input type="date" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} required />
        </div>

        <div className="field-group">
          <span className="field-title">Horario sugerido</span>
          <div className="choice-row">
            {SUGGESTED_TIMES.map((time) => (
              <button
                key={time}
                type="button"
                className={`choice-btn ${selectedTime === time && !useCustomTime ? "active" : ""}`}
                onClick={() => {
                  setUseCustomTime(false);
                  setSelectedTime(time);
                }}
              >
                {time}
              </button>
            ))}
            <button
              type="button"
              className={`choice-btn ${useCustomTime ? "active" : ""}`}
              onClick={() => setUseCustomTime(!useCustomTime)}
            >
              Otro...
            </button>
          </div>
        </div>

        {useCustomTime && (
          <div className="field-group animate-in">
            <span className="field-title">Horario específico (00 o 30 min)</span>
            <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800} required />
            {!hasValidTime && <p className="warning" style={{ fontSize: "0.8rem" }}>El horario debe ser en bloques de 30 min.</p>}
          </div>
        )}

        <div className="field-group">
          <span className="field-title">Duración</span>
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            <option value={60}>60 minutos</option>
            <option value={90}>90 minutos</option>
            <option value={120}>120 minutos</option>
          </select>
        </div>
      </div>

      <div className="actions" style={{ marginTop: "0.5rem" }}>
        <button type="submit" disabled={!hasValidTime}>Confirmar Reserva</button>
        <button type="button" className="neutral" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
