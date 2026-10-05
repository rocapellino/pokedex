import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Error Boundary Helper: Async Handler para Express 4.x
// Reenvía automáticamente los rechazos de promesas al middleware global de errores
// ---------------------------------------------------------------------------
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
