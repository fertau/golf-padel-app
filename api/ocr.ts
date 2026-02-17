import { parseReservationFromText } from "../src/lib/ocrParser";

type VercelRequestLike = {
  method?: string;
  body?: unknown;
};

type VercelResponseLike = {
  status: (code: number) => VercelResponseLike;
  json: (body: unknown) => void;
};

type VisionApiResponse = {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
    };
  }>;
};

const parseRequestBody = (body: unknown): { imageBase64?: string } => {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as { imageBase64?: string };
    } catch {
      return {};
    }
  }

  if (body && typeof body === "object") {
    return body as { imageBase64?: string };
  }

  return {};
};

const extractDataPart = (imageBase64: string): string => {
  if (imageBase64.startsWith("data:")) {
    const [, dataPart] = imageBase64.split(",", 2);
    return dataPart ?? "";
  }
  return imageBase64;
};

const detectTextWithVision = async (imageBase64: string, apiKey: string): Promise<string> => {
  const dataPart = extractDataPart(imageBase64);
  if (!dataPart.trim()) {
    throw new Error("Imagen inválida para OCR.");
  }

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: dataPart
          },
          features: [
            {
              type: "TEXT_DETECTION"
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Google Vision respondió ${response.status}.`);
  }

  const payload = (await response.json()) as VisionApiResponse;
  const rawText = payload.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? "";
  if (!rawText) {
    throw new Error("No se detectó texto en la imagen.");
  }

  return rawText;
};

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OCR servidor no configurado. Definí GOOGLE_VISION_API_KEY en Vercel."
    });
    return;
  }

  const { imageBase64 } = parseRequestBody(req.body);
  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "Falta imageBase64 en el body." });
    return;
  }

  try {
    const rawText = await detectTextWithVision(imageBase64, apiKey);
    const parsed = parseReservationFromText(rawText);
    res.status(200).json({
      rawText,
      parsed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falló OCR en servidor.";
    res.status(422).json({ error: message });
  }
}
