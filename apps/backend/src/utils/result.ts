/**
 * ==============================================================================
 * Utilidad de Tipado Algebraico Result / Either (Pattern Functional Error Handling)
 * ==============================================================================
 * Modela retornos deterministas obligando a gestionar explícitamente tanto el éxito (Ok)
 * como el fallo tipado (Err), eliminando el uso de excepciones no controladas.
 */

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export class Ok<T, E = never> {
  readonly ok = true as const;
  readonly err = false as const;

  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok<U, E>(fn(this.value));
  }

  mapErr<F>(_fn: (err: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (err: E) => U }): U {
    return handlers.ok(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }
}

export class Err<T, E> {
  readonly ok = false as const;
  readonly err = true as const;

  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (err: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }

  match<U>(handlers: { ok: (value: T) => U; err: (err: E) => U }): U {
    return handlers.err(this.error);
  }

  unwrap(): never {
    throw new Error(`Intentando desenvolver un Err no controlado: ${JSON.stringify(this.error)}`);
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }
}

export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok<T, E>(value);
}

export function err<T = never, E = unknown>(error: E): Result<T, E> {
  return new Err<T, E>(error);
}

/**
 * Ejecuta una función síncrona envolviéndola de forma segura en un Result.
 */
export function tryCatch<T, E = Error>(fn: () => T, mapErr?: (error: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (caughtError) {
    const finalErr = mapErr ? mapErr(caughtError) : (caughtError as E);
    return err(finalErr);
  }
}

/**
 * Ejecuta una promesa asíncrona envolviéndola de forma segura en un Result.
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapErr?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (caughtError) {
    const finalErr = mapErr ? mapErr(caughtError) : (caughtError as E);
    return err(finalErr);
  }
}
