import { useMemo, useState, type ChangeEvent } from "react";
import type { Reservation, User } from "../lib/types";
import {
  buildWhatsAppMessage,
  calculateSignupResult,
  canJoinReservation,
  formatDateTime
} from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  appUrl: string;
  onJoin: (reservationId: string) => void;
  onLeave: (reservationId: string) => void;
  onCancel: (reservationId: string) => void;
  onUpdateRules: (
    reservationId: string,
    rules: {
      maxPlayersAccepted: number;
      priorityUserIds: string[];
      allowWaitlist: boolean;
      signupDeadline?: string;
    }
  ) => void;
  onUpdateScreenshot: (reservationId: string, screenshotUrl: string) => void;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ReservationDetail({
  reservation,
  currentUser,
  appUrl,
  onJoin,
  onLeave,
  onCancel,
  onUpdateRules,
  onUpdateScreenshot
}: Props) {
  const isCreator = reservation.createdBy.id === currentUser.id;
  const { titulares, suplentes } = calculateSignupResult(reservation);
  const mySignup = reservation.signups.find(
    (signup) => signup.userId === currentUser.id && signup.active
  );

  const eligibility = canJoinReservation(reservation, currentUser);
  const [priorityInput, setPriorityInput] = useState("");

  const myRole = useMemo(() => {
    if (!mySignup) {
      return undefined;
    }
    const titular = titulares.find((signup) => signup.id === mySignup.id);
    return titular ? "TITULAR" : "SUPLENTE";
  }, [mySignup, titulares]);

  const message = buildWhatsAppMessage(reservation, appUrl);

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Reserva de padel", text: message });
      return;
    }
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    alert("Mensaje copiado");
  };

  const handleScreenshot = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const data = await toBase64(file);
    onUpdateScreenshot(reservation.id, data);
  };

  return (
    <section className="panel panel-detail">
      <h2>{reservation.courtName}</h2>
      <p>{formatDateTime(reservation.startDateTime)}</p>
      <p>Duración: {reservation.durationMinutes} minutos</p>
      <p>Creador: {reservation.createdBy.name}</p>

      {reservation.screenshotUrl ? (
        <img src={reservation.screenshotUrl} alt="Captura de reserva" className="preview" />
      ) : null}

      {myRole ? <p className="role">Tu estado: {myRole}</p> : null}

      <div className="actions">
        <button onClick={() => onJoin(reservation.id)} disabled={!eligibility.ok || Boolean(mySignup)}>
          Unirme
        </button>
        <button onClick={() => onLeave(reservation.id)} disabled={!mySignup}>
          Salir
        </button>
      </div>

      {!eligibility.ok && !mySignup ? <p className="warning">{eligibility.reason}</p> : null}

      <div className="list-grid">
        <div>
          <h3>Titulares</h3>
          <ul>
            {titulares.map((signup) => (
              <li key={signup.id}>{signup.userName}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Suplentes</h3>
          <ul>
            {suplentes.map((signup) => (
              <li key={signup.id}>{signup.userName}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="actions">
        <button onClick={share}>Compartir</button>
        <button onClick={copyMessage}>Copiar mensaje</button>
      </div>

      {isCreator ? (
        <div className="creator-only">
          <h3>Reglas privadas (solo creador)</h3>
          <label>
            Máximo titulares
            <input
              type="number"
              value={reservation.rules.maxPlayersAccepted}
              onChange={(e) =>
                onUpdateRules(reservation.id, {
                  ...reservation.rules,
                  maxPlayersAccepted: Number(e.target.value)
                })
              }
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={reservation.rules.allowWaitlist}
              onChange={(e) =>
                onUpdateRules(reservation.id, {
                  ...reservation.rules,
                  allowWaitlist: e.target.checked
                })
              }
            />
            Permitir suplentes
          </label>

          <label>
            Deadline
            <input
              type="datetime-local"
              value={reservation.rules.signupDeadline ?? ""}
              onChange={(e) =>
                onUpdateRules(reservation.id, {
                  ...reservation.rules,
                  signupDeadline: e.target.value || undefined
                })
              }
            />
          </label>

          <label>
            Prioridad (ids separados por coma)
            <input
              value={priorityInput}
              placeholder={reservation.rules.priorityUserIds.join(",") || "usuario-1,usuario-2"}
              onChange={(e) => setPriorityInput(e.target.value)}
            />
          </label>

          <button
            onClick={() =>
              onUpdateRules(reservation.id, {
                ...reservation.rules,
                priorityUserIds: priorityInput
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
              })
            }
          >
            Guardar prioridad
          </button>

          <label>
            Cambiar captura
            <input type="file" accept="image/*" onChange={handleScreenshot} />
          </label>

          <button className="danger" onClick={() => onCancel(reservation.id)}>
            Cancelar reserva
          </button>
        </div>
      ) : (
        <p className="private-hint">Las reglas internas son visibles solo para el creador.</p>
      )}
    </section>
  );
}
