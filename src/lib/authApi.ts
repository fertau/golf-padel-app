export type AccountProfile = {
  id: string;
  name: string;
  avatar: string;
  isAdmin: boolean;
  usernameNormalized: string;
};

type RegisterResponse =
  | { status: "created"; customToken: string; profile: AccountProfile }
  | { status: "exists"; profile: AccountProfile; message: string };

const parseError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "Error inesperado.";
};

export const searchAccountByName = async (name: string): Promise<AccountProfile | null> => {
  const response = await fetch(`/api/auth/search?name=${encodeURIComponent(name)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const payload = (await response.json()) as { profile: AccountProfile };
  return payload.profile;
};

export const loginWithPin = async (
  playerId: string,
  pin: string
): Promise<{ customToken: string; profile: AccountProfile }> => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, pin })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as { customToken: string; profile: AccountProfile };
};

export const registerAccount = async (name: string, pin: string): Promise<RegisterResponse> => {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin })
  });

  if (response.status === 409) {
    const payload = (await response.json()) as { profile: AccountProfile; message: string };
    return {
      status: "exists",
      profile: payload.profile,
      message: payload.message
    };
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as {
    customToken: string;
    profile: AccountProfile;
  };

  return {
    status: "created",
    customToken: payload.customToken,
    profile: payload.profile
  };
};

export const fetchAccountsByIds = async (ids: string[]): Promise<AccountProfile[]> => {
  if (ids.length === 0) {
    return [];
  }

  const response = await fetch("/api/auth/by-ids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const payload = (await response.json()) as { profiles: AccountProfile[] };
  return payload.profiles;
};
