import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MigrationFailedError,
  isProductionEnv,
  getDatabaseUrl,
  connectPg,
  isPgConnectedStatus,
  setMigrationRunnerForTest,
  setSchemaVerifierForTest,
  setPgPoolForTest,
  setDrizzleDbForTest,
  closePg,
} from '../../apps/backend/src/services/postgres.js';
import { handleStartupError } from '../../apps/backend/server.js';

describe('🛡️ APPS-002: Fail-Closed en Migraciones de PostgreSQL y Error Handling de Servidor', () => {
  const originalEnv = { ...process.env };

  afterEach(async () => {
    process.env = { ...originalEnv };
    setMigrationRunnerForTest();
    setSchemaVerifierForTest();
    setPgPoolForTest(null);
    setDrizzleDbForTest(null);
    await closePg();
  });

  test('MigrationFailedError modela la excepción con y sin cause', () => {
    const errWithoutCause = new MigrationFailedError('fallo directo');
    assert.equal(errWithoutCause.name, 'MigrationFailedError');
    assert.equal(errWithoutCause.message, 'fallo directo');
    assert.equal((errWithoutCause as any).cause, undefined);

    const cause = new Error('error raiz');
    const errWithCause = new MigrationFailedError('fallo con causa', { cause });
    assert.equal(errWithCause.name, 'MigrationFailedError');
    assert.equal((errWithCause as any).cause, cause);
    assert.ok(errWithCause instanceof Error);
  });

  test('isProductionEnv discrimina correctamente producción vs desarrollo/test', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isProductionEnv(), true);

    process.env.NODE_ENV = 'development';
    assert.equal(isProductionEnv(), false);

    process.env.NODE_ENV = 'test';
    assert.equal(isProductionEnv(), false);
  });

  test('getDatabaseUrl resuelve URL directa o combina parámetros POSTGRES_*', () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_HOST;
    assert.equal(getDatabaseUrl(), undefined);

    process.env.DATABASE_URL = 'postgresql://custom:5432/db';
    assert.equal(getDatabaseUrl(), 'postgresql://custom:5432/db');

    delete process.env.DATABASE_URL;
    process.env.POSTGRES_HOST = 'db.host';
    process.env.POSTGRES_USER = 'user';
    process.env.POSTGRES_PASSWORD = 'pass';
    process.env.POSTGRES_DB = 'pokedex';
    process.env.POSTGRES_PORT = '5433';
    assert.equal(getDatabaseUrl(), 'postgresql://user:pass@db.host:5433/pokedex');
  });

  test('connectPg retorna false si no hay URL de base de datos configurada', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_HOST;
    const connected = await connectPg();
    assert.equal(connected, false);
    assert.equal(isPgConnectedStatus(), false);
  });

  // AUD-ARCH-DB-001 (ADR-011): en producción el esquema lo migra el Job dedicado; la API solo lo verifica.
  test('connectPg en producción NO ejecuta migraciones: solo verifica el esquema', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';

    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);

    let migrationRuns = 0;
    setMigrationRunnerForTest(async () => {
      migrationRuns++;
    });
    let verifications = 0;
    setSchemaVerifierForTest(async () => {
      verifications++;
      return { upToDate: true, expected: 1, applied: 1 };
    });
    setDrizzleDbForTest({ select: () => ({ from: () => Promise.resolve([{ total: 10 }]) }) } as any);

    assert.equal(await connectPg(), true);
    assert.equal(migrationRuns, 0, 'la API productiva no puede aplicar DDL (lo hace el Job de migración)');
    assert.equal(verifications, 1, 'la API productiva debe verificar el esquema al conectar');
  });

  test('connectPg en producción lanza MigrationFailedError si el esquema tiene migraciones pendientes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';

    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);
    setSchemaVerifierForTest(async () => ({ upToDate: false, expected: 2, applied: 1 }));

    await assert.rejects(connectPg(), (err: any) => {
      assert.ok(err instanceof MigrationFailedError, 'Debe ser instancia de MigrationFailedError');
      assert.match(err.message, /migraciones pendientes/);
      return true;
    });
    assert.equal(isPgConnectedStatus(), false, 'isPgConnected debe ser false tras el fallo');
  });

  test('connectPg en producción lanza MigrationFailedError si no puede verificar el esquema (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';

    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);
    const verifyError = new Error('permission denied for schema drizzle');
    setSchemaVerifierForTest(async () => {
      throw verifyError;
    });

    await assert.rejects(connectPg(), (err: any) => {
      assert.ok(err instanceof MigrationFailedError);
      assert.equal(err.cause, verifyError);
      return true;
    });
    assert.equal(isPgConnectedStatus(), false);
  });

  test('connectPg en desarrollo tolera fallo de migraciones y no lanza MigrationFailedError', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';

    // Mock del pool para conectar
    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);

    // Mock del runner de migraciones que falla
    setMigrationRunnerForTest(async () => {
      throw new Error('Migración falló en entorno de desarrollo');
    });

    // Mock de drizzleDb para que continue tras el catch tolerante
    const mockDb: any = {
      select: () => ({
        from: () => Promise.resolve([{ total: 10 }]),
      }),
    };
    setDrizzleDbForTest(mockDb);

    // En desarrollo NO debe lanzar error; debe continuar y conectar
    const result = await connectPg();
    assert.equal(result, true);
    assert.equal(isPgConnectedStatus(), true);
  });

  test('handleStartupError registra el error y llama a exitFn(1)', () => {
    let capturedCode: number | null = null;
    const mockExit = (code: number) => {
      capturedCode = code;
    };

    // Caso 1: err es una instancia de Error
    handleStartupError(new Error('Fatal DB migration failed'), mockExit);
    assert.equal(capturedCode, 1);

    // Caso 2: err es un string u objeto desconocido
    capturedCode = null;
    handleStartupError('Unknown crash string', mockExit);
    assert.equal(capturedCode, 1);
  });

  test('APPS-002: connectPg en producción con tabla vacía NO ejecuta auto-seed si AUTO_SEED está inactivo', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';
    delete process.env.AUTO_SEED;

    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);
    setSchemaVerifierForTest(async () => ({ upToDate: true, expected: 1, applied: 1 }));

    let insertCallCount = 0;
    const mockDb: any = {
      select: () => ({
        from: () => Promise.resolve([{ total: 0 }]),
      }),
      insert: () => {
        insertCallCount++;
        return {
          values: () => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        };
      },
    };
    setDrizzleDbForTest(mockDb);

    const connected = await connectPg();
    assert.equal(connected, true);
    assert.equal(isPgConnectedStatus(), true);
    assert.equal(insertCallCount, 0, 'En producción no debe ejecutar auto-seed; se delega al Seed Job');
  });

  test('APPS-002: connectPg en producción ejecuta auto-seed si AUTO_SEED=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';
    process.env.AUTO_SEED = 'true';

    const mockClient = {
      query: async () => ({ rows: [] }),
      release: () => {},
    };
    const mockPool: any = {
      connect: async () => mockClient,
      on: () => {},
      end: async () => {},
    };
    setPgPoolForTest(mockPool);
    setSchemaVerifierForTest(async () => ({ upToDate: true, expected: 1, applied: 1 }));

    let insertCallCount = 0;
    const mockDb: any = {
      select: () => ({
        from: () => Promise.resolve([{ total: 0 }]),
      }),
      insert: () => {
        insertCallCount++;
        return {
          values: () => ({
            onConflictDoNothing: () => Promise.resolve(),
          }),
        };
      },
    };
    setDrizzleDbForTest(mockDb);

    const connected = await connectPg();
    assert.equal(connected, true);
    assert.equal(isPgConnectedStatus(), true);
    assert.ok(insertCallCount > 0, 'Con AUTO_SEED=true debe ejecutar auto-seed explícito');
  });
});
