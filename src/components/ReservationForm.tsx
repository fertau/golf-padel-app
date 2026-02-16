import { ChangeEvent, FormEvent, useState } from "react";
import type { User } from "../lib/types";

type Props = {
  currentUser: User;
  onCreate: (payload: {
    courtName: string;
    startDateTime: string;
    durationMinutes: number;
    screenshotUrl?: string;
  }) => void;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ReservationForm({ onCreate, currentUser }: Props) {
  const [courtName, setCourtName] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(undefined);

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

    onCreate({
      courtName,
      startDateTime,
      durationMinutes,
      screenshotUrl
    });

    setCourtName("");
    setStartDateTime("");
    setDurationMinutes(90);
    setScreenshotUrl(undefined);
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Nueva reserva</h2>
      <p className="private-hint">{currentUser.name}, completá los datos y compartila al grupo.</p>

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

      {screenshotUrl ? <img src={screenshotUrl} alt="Captura" className="preview" /> : null}

      <button type="submit">Crear y compartir</button>
    </form>
  );
}
