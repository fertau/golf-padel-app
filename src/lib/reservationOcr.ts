import { parseReservationFromText, type RecognizedReservation } from "./ocrParser";

type OcrResponse = {
  rawText: string;
  provider: "server" | "local";
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

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const extractTextWithServer = async (file: File): Promise<OcrResponse> => {
  const imageBase64 = await toBase64(file);
  const response = await fetch("/api/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      imageBase64
    })
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? "No se pudo ejecutar OCR en servidor.");
  }

  const payload = (await response.json()) as { rawText?: string };
  if (!payload.rawText?.trim()) {
    throw new Error("El OCR servidor no detectó texto.");
  }

  return {
    rawText: payload.rawText,
    provider: "server"
  };
};

const extractTextWithLocalDetector = async (file: File): Promise<OcrResponse> => {
  const windowWithDetector = window as WindowWithTextDetector;
  const Detector = windowWithDetector.TextDetector;

  if (!Detector) {
    throw new Error("Este navegador no soporta OCR local.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const detector = new Detector();
    const blocks = await detector.detect(bitmap);
    const rawText = blocks
      .map((block) => block.rawValue?.trim())
      .filter((value): value is string => Boolean(value))
      .join("\n");

    if (!rawText.trim()) {
      throw new Error("El OCR local no detectó texto.");
    }

    return {
      rawText,
      provider: "local"
    };
  } finally {
    bitmap.close();
  }
};

export const recognizeReservationFromImage = async (
  file: File
): Promise<RecognizedReservation & { provider: "server" | "local" }> => {
  try {
    const serverResult = await extractTextWithServer(file);
    return {
      ...parseReservationFromText(serverResult.rawText),
      provider: serverResult.provider
    };
  } catch (serverError) {
    try {
      const localResult = await extractTextWithLocalDetector(file);
      return {
        ...parseReservationFromText(localResult.rawText),
        provider: localResult.provider
      };
    } catch {
      throw new Error(
        `No se pudo analizar la imagen en servidor ni en este dispositivo. ${
          serverError instanceof Error ? serverError.message : ""
        }`.trim()
      );
    }
  }
};
