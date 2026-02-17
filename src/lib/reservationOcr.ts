export type RecognizedReservation = {
  courtName?: string;
  startDateTime?: string;
  durationMinutes?: number;
  rawText: string;
};

type DetectedTextBlock = {
  rawValue?: string;
};

type TextDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<DetectedTextBlock[]>;
};

type WindowWithTextDetector = Window & {
  TextDetector?: new () => TextDetectorLike;
};

const toDateTimeLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const parseDateTime = (raw: string): string | undefined => {
  const normalized = raw.replace(/\s+/g, " ");

  const isoDate = normalized.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2}).*?(\d{1,2}):(\d{2})/);
  if (isoDate) {
    const [, year, month, day, hour, minute] = isoDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (!Number.isNaN(parsed.getTime())) {
      return toDateTimeLocal(parsed);
    }
  }

  const latamDate = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2}).*?(\d{1,2}):(\d{2})/);
  if (latamDate) {
    const [, day, month, year, hour, minute] = latamDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    if (!Number.isNaN(parsed.getTime())) {
      return toDateTimeLocal(parsed);
    }
  }

  return undefined;
};

const parseDuration = (raw: string): number | undefined => {
  const durationMatch = raw.match(/(\d{2,3})\s*(min|mins|m|minutes?)/i);
  if (!durationMatch) {
    return undefined;
  }

  const value = Number(durationMatch[1]);
  if (Number.isNaN(value) || value < 30 || value > 240) {
    return undefined;
  }

  return value;
};

const parseCourt = (raw: string): string | undefined => {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labeled = lines.find((line) => /cancha|court|padel/i.test(line));
  if (labeled) {
    const cleaned = labeled.replace(/(cancha|court|padel)\s*[:\-]?\s*/i, "").trim();
    return cleaned || labeled;
  }

  const firstHumanLine = lines.find((line) => line.length >= 3 && line.length <= 38 && !/\d{1,2}[/:]\d{2}/.test(line));
  return firstHumanLine;
};

const extractTextFromImage = async (file: File): Promise<string> => {
  const windowWithDetector = window as WindowWithTextDetector;
  const Detector = windowWithDetector.TextDetector;

  if (!Detector) {
    throw new Error("Este navegador no soporta OCR automático. Completá datos manualmente.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const detector = new Detector();
    const blocks = await detector.detect(bitmap);
    return blocks
      .map((block) => block.rawValue?.trim())
      .filter((value): value is string => Boolean(value))
      .join("\n");
  } finally {
    bitmap.close();
  }
};

export const recognizeReservationFromImage = async (file: File): Promise<RecognizedReservation> => {
  const rawText = await extractTextFromImage(file);

  return {
    courtName: parseCourt(rawText),
    startDateTime: parseDateTime(rawText),
    durationMinutes: parseDuration(rawText),
    rawText
  };
};
