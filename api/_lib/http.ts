export type VercelRequestLike = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type VercelResponseLike = {
  status: (code: number) => VercelResponseLike;
  json: (body: unknown) => void;
};

export const parseBody = <T>(body: unknown): T => {
  if (!body) {
    return {} as T;
  }

  if (typeof body === "string") {
    return JSON.parse(body) as T;
  }

  return body as T;
};
