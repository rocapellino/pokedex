import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MigrationFailedError,
  isProductionEnv,
  getDatabaseUrl,
  connectPg,
  isPgConnectedStatus,
  setMigrationRunnerForTest,
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

  test('connectPg en producción lanza MigrationFailedError si runMigrations falla (fail-closed)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://fake-user:fake-pass@127.0.0.1:5432/fake_db';

    // Mock del pool para conectar exitosamente
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
    const migrationError = new Error('Relation already exists or syntax error');
    setMigrationRunnerForTest(async () => {
      throw migrationError;
    });

    await assert.rejects(
      async () => {
        await connectPg();
      },
      (err: any) => {
        assert.ok(err instanceof MigrationFailedError, 'Debe ser instancia de MigrationFailedError');
        assert.match(err.message, /Las migraciones Drizzle fallaron/);
        assert.equal(err.cause, migrationError);
        return true;
      }
    );

    assert.equal(isPgConnectedStatus(), false, 'isPgConnected debe ser false tras el fallo');
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
    setMigrationRunnerForTest(async () => {});

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
    setMigrationRunnerForTest(async () => {});

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
