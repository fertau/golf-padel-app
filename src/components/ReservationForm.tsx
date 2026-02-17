import { ChangeEvent, FormEvent, useState } from "react";
import type { User } from "../lib/types";
import { recognizeReservationFromImage } from "../lib/reservationOcr";

type Props = {
  currentUser: User;
  onCreate: (payload: {
    courtName: string;
    startDateTime: string;
    durationMinutes: number;
    screenshotUrl?: string;
  }) => void;
  onCancel: () => void;
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ReservationForm({ onCreate, onCancel, currentUser }: Props) {
  const [courtName, setCourtName] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(undefined);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAnalyzing(true);
    setAnalysisMessage("Analizando imagen...");

    try {
      const data = await toBase64(file);
      setScreenshotUrl(data);

      const recognized = await recognizeReservationFromImage(file);

      if (recognized.courtName) {
        setCourtName(recognized.courtName);
      }

      if (recognized.startDateTime) {
        setStartDateTime(recognized.startDateTime);
      }

      if (recognized.durationMinutes) {
        setDurationMinutes(recognized.durationMinutes);
      }

      if (recognized.courtName || recognized.startDateTime || recognized.durationMinutes) {
        setAnalysisMessage("Datos detectados automáticamente. Revisalos antes de guardar.");
      } else {
        setAnalysisMessage("No se detectaron todos los datos. Completalos manualmente.");
      }
    } catch (error) {
      setAnalysisMessage((error as Error).message);
    } finally {
      setAnalyzing(false);
    }
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
    setAnalysisMessage(null);
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Registrar nueva reserva</h2>
      <p className="private-hint">{currentUser.name}, subí la foto y completá lo que falte.</p>

      <label>
        Foto de la reserva
        <input type="file" accept="image/*" onChange={handleImage} required />
      </label>

      {analysisMessage ? <p className={analysisMessage.includes("No se") ? "warning" : "private-hint"}>{analysisMessage}</p> : null}

      {screenshotUrl ? <img src={screenshotUrl} alt="Captura" className="preview" /> : null}

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

      <div className="actions">
        <button type="submit" disabled={analyzing}>
          Guardar reserva
        </button>
        <button type="button" onClick={onCancel}>
          Volver
        </button>
      </div>
    </form>
  );
}
