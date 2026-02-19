export type GooglePlaceCandidate = {
  googlePlaceId: string;
  name: string;
  address: string;
  mapsUrl?: string;
};

const getGoogleMapsApiKey = (): string | null => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
};

export const canSearchGooglePlaces = (): boolean => Boolean(getGoogleMapsApiKey());

export const searchGooglePlaces = async (query: string): Promise<GooglePlaceCandidate[]> => {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("Falta VITE_GOOGLE_MAPS_API_KEY para buscar complejos por Maps.");
  }

  const normalized = query.trim();
  if (normalized.length < 3) {
    return [];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri"
    },
    body: JSON.stringify({
      textQuery: normalized,
      maxResultCount: 5,
      languageCode: "es",
      regionCode: "AR"
    })
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          googleMapsUri?: string;
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "No se pudo consultar Google Maps.");
  }

  const places = payload?.places ?? [];
  return places
    .map((place) => ({
      googlePlaceId: place.id ?? "",
      name: place.displayName?.text ?? "",
      address: place.formattedAddress ?? "",
      mapsUrl: place.googleMapsUri
    }))
    .filter((place) => place.googlePlaceId && place.name);
};
