import { type ChangeEvent } from "react";
import type { Reservation, User } from "../lib/types";
import { buildWhatsAppMessage, canJoinReservation, formatDateTime, getActiveSignups } from "../lib/utils";

type Props = {
  reservation: Reservation;
  currentUser: User;
  appUrl: string;
  onJoin: (reservationId: string) => void;
  onLeave: (reservationId: string) => void;
  onCancel: (reservationId: string) => void;
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
  onUpdateScreenshot
}: Props) {
  const isCreator = reservation.createdBy.id === currentUser.id;
  const players = getActiveSignups(reservation);
  const mySignup = players.find((signup) => signup.userId === currentUser.id);

  const eligibility = canJoinReservation(reservation, currentUser);

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

      <div className="actions">
        <button onClick={() => onJoin(reservation.id)} disabled={!eligibility.ok || Boolean(mySignup)}>
          Unirme
        </button>
        <button onClick={() => onLeave(reservation.id)} disabled={!mySignup}>
          Salir
        </button>
      </div>

      {!eligibility.ok && !mySignup ? <p className="warning">{eligibility.reason}</p> : null}

      <div>
        <h3>Jugadores anotados</h3>
        {players.length === 0 ? <p className="private-hint">Todavía no hay anotados.</p> : null}
        <ul>
          {players.map((signup) => (
            <li key={signup.id}>{signup.userName}</li>
          ))}
        </ul>
      </div>

      <div className="actions">
        <button onClick={share}>Compartir</button>
        <button onClick={copyMessage}>Copiar mensaje</button>
      </div>

      {isCreator ? (
        <div className="actions">
          <label>
            Cambiar captura
            <input type="file" accept="image/*" onChange={handleScreenshot} />
          </label>
          <button className="danger" onClick={() => onCancel(reservation.id)}>
            Cancelar reserva
          </button>
        </div>
      ) : null}
    </section>
  );
}
