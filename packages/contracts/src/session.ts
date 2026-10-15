/**
 * ==============================================================================
 * @pokedex/contracts - Contratos de Autenticación y Sesión
 * ==============================================================================
 */

export interface SessionInfo {
  authenticated?: boolean;
  token?: string;
  expiresIn?: number;
  expires_in?: number;
  expiresAt?: number;
  role?: string;
}

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
  created_at?: string;
}
