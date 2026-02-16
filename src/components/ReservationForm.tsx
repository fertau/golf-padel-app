import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type { Reservation, User } from "../lib/types";
import { slugifyId } from "../lib/utils";

type Props = {
  currentUser: User;
  allReservations: Reservation[];
  onCreate: (payload: {
    courtName: string;
    startDateTime: string;
    durationMinutes: number;
    screenshotUrl?: string;
    rules: {
      maxPlayersAccepted: number;
      priorityUserIds: string[];
      allowWaitlist: boolean;
      signupDeadline?: string;
    };
  }) => void;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ReservationForm({ currentUser, allReservations, onCreate }: Props) {
  const [courtName, setCourtName] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(undefined);

  const [maxPlayersAccepted, setMaxPlayersAccepted] = useState(4);
  const [allowWaitlist, setAllowWaitlist] = useState(true);
  const [signupDeadline, setSignupDeadline] = useState("");
  const [priorityInput, setPriorityInput] = useState("");

  const knownUsersByName = useMemo(() => {
    const usersByName = new Map<string, string>();
    usersByName.set(currentUser.name, currentUser.id);

    allReservations.forEach((reservation) => {
      usersByName.set(reservation.createdBy.name, reservation.createdBy.id);
      reservation.signups.forEach((signup) => usersByName.set(signup.userName, signup.userId));
    });

    return usersByName;
  }, [allReservations, currentUser.id, currentUser.name]);

  const knownNames = useMemo(
    () => [...knownUsersByName.keys()].sort((a, b) => a.localeCompare(b)),
    [knownUsersByName]
  );

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const data = await toBase64(file);
    setScreenshotUrl(data);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!courtName || !startDateTime || durationMinutes <= 0) {
      return;
    }

    const priorityUserIds = priorityInput
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => knownUsersByName.get(name) ?? (name.includes("-") ? name : slugifyId(name)));

    onCreate({
      courtName,
      startDateTime,
      durationMinutes,
      screenshotUrl,
      rules: {
        maxPlayersAccepted,
        priorityUserIds,
        allowWaitlist,
        signupDeadline: signupDeadline || undefined
      }
    });

    setCourtName("");
    setStartDateTime("");
    setDurationMinutes(90);
    setScreenshotUrl(undefined);
    setMaxPlayersAccepted(4);
    setAllowWaitlist(true);
    setSignupDeadline("");
    setPriorityInput("");
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Nueva reserva</h2>

      <label>
        Cancha
        <input value={courtName} onChange={(e) => setCourtName(e.target.value)} required />
      </label>

      <label>
        Fecha y hora
        <input
          type="datetime-local"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          required
        />
      </label>

      <label>
        Duración (min)
        <input
          type="number"
          min={30}
          step={15}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          required
        />
      </label>

      <label>
        Captura de reserva (opcional)
        <input type="file" accept="image/*" onChange={handleImage} />
      </label>

      <h3>Reglas privadas de esta reserva</h3>

      <label>
        Máximo titulares
        <input
          type="number"
          min={1}
          max={20}
          value={maxPlayersAccepted}
          onChange={(e) => setMaxPlayersAccepted(Number(e.target.value))}
        />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={allowWaitlist}
          onChange={(e) => setAllowWaitlist(e.target.checked)}
        />
        Permitir suplentes
      </label>

      <label>
        Deadline de inscripción (opcional)
        <input
          type="datetime-local"
          value={signupDeadline}
          onChange={(e) => setSignupDeadline(e.target.value)}
        />
      </label>

      <label>
        Usuarios con prioridad (nombres separados por coma)
        <input
          list="known-users"
          value={priorityInput}
          onChange={(e) => setPriorityInput(e.target.value)}
          placeholder="Ej: Juan, Nico"
        />
        <datalist id="known-users">
          {knownNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      {screenshotUrl ? <img src={screenshotUrl} alt="Captura" className="preview" /> : null}

      <button type="submit">Crear reserva</button>
    </form>
  );
}
