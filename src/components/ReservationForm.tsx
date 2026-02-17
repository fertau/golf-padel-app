import { FormEvent, useMemo, useState } from "react";
import type { User } from "../lib/types";

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
  if (parts.length !== 2) {
    return false;
  }

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  return minute === 0 || minute === 30;
};

export default function ReservationForm({ onCreate, onCancel, currentUser }: Props) {
  const [courtName, setCourtName] = useState<"Cancha 1" | "Cancha 2">("Cancha 1");
  const [reservationDate, setReservationDate] = useState(getTodayLocalDate());
  const [selectedTime, setSelectedTime] = useState<(typeof SUGGESTED_TIMES)[number]>("17:00");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(90);

  const finalTime = useMemo(
    () => (useCustomTime ? customTime : selectedTime),
    [customTime, selectedTime, useCustomTime]
  );
  const hasValidTime = useMemo(() => isHalfHourSlot(finalTime), [finalTime]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!courtName || !reservationDate || !finalTime || !hasValidTime || durationMinutes <= 0) {
      return;
    }

    onCreate({
      courtName,
      startDateTime: `${reservationDate}T${finalTime}`,
      durationMinutes
    });

    setCourtName("Cancha 1");
    setReservationDate(getTodayLocalDate());
    setSelectedTime("17:00");
    setUseCustomTime(false);
    setCustomTime("17:00");
    setDurationMinutes(90);
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2 className="section-title">Reservá un partido</h2>
      <p className="private-hint">{currentUser.name}, cargá cancha, fecha y horario.</p>

      <div className="field-group">
        <p className="field-title">Cancha</p>
        <div className="choice-row">
          <button
            type="button"
            className={courtName === "Cancha 1" ? "choice-btn active" : "choice-btn"}
            onClick={() => setCourtName("Cancha 1")}
          >
            Cancha 1
          </button>
          <button
            type="button"
            className={courtName === "Cancha 2" ? "choice-btn active" : "choice-btn"}
            onClick={() => setCourtName("Cancha 2")}
          >
            Cancha 2
          </button>
        </div>
      </div>

      <label>
        Fecha
        <input type="date" value={reservationDate} onChange={(event) => setReservationDate(event.target.value)} required />
      </label>

      <div className="field-group">
        <p className="field-title">Horario</p>
        <div className="choice-row">
          {SUGGESTED_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              className={selectedTime === time && !useCustomTime ? "choice-btn active" : "choice-btn"}
              onClick={() => {
                setUseCustomTime(false);
                setSelectedTime(time);
              }}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={useCustomTime ? "link-btn active" : "link-btn"} onClick={() => setUseCustomTime((prev) => !prev)}>
        {useCustomTime ? "Usar horario sugerido" : "Otro horario"}
      </button>

      {useCustomTime ? (
        <label>
          Otro horario
          <input
            type="time"
            value={customTime}
            onChange={(event) => setCustomTime(event.target.value)}
            step={1800}
            required
          />
        </label>
      ) : null}

      {!hasValidTime ? (
        <p className="warning">El horario específico debe ser en bloques de 30 minutos (ej: 17:00 o 18:30).</p>
      ) : null}

      <label>
        Duración
        <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
          <option value={60}>60 minutos</option>
          <option value={90}>90 minutos</option>
          <option value={120}>120 minutos</option>
        </select>
      </label>

      <div className="actions">
        <button type="submit" disabled={!hasValidTime}>
          Reservá
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
