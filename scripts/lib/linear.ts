/**
 * scripts/lib/linear.ts
 * Cliente HTTP tipado y reutilizable para la API GraphQL de Linear.
 */

import process from 'node:process';

export const LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearClientOptions {
  apiKey?: string;
  apiUrl?: string;
}

export async function fetchLinear<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: LinearClientOptions = {},
): Promise<T> {
  const apiKey = options.apiKey ?? process.env.LINEAR_API_KEY ?? '';
  const apiUrl = options.apiUrl ?? LINEAR_API_URL;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: apiKey,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API HTTP Error ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear GraphQL Error: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}
