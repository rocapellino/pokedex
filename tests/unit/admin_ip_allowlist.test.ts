import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { adminIpRestricted, isAdminIpAllowed } from '../../apps/backend/src/middleware/auth.js';

test('🛡️ Admin IP: coincidencia exacta de IPv4 e IPv6', () => {
  assert.equal(isAdminIpAllowed('10.42.0.1', ['10.42.0.1']), true);
  assert.equal(isAdminIpAllowed('10.42.0.2', ['10.42.0.1']), false);
  assert.equal(isAdminIpAllowed('fd00::1', ['fd00::1']), true);
  assert.equal(isAdminIpAllowed('fd00::2', ['fd00::1']), false);
});

test('🛡️ Admin IP: rangos CIDR IPv4 e IPv6', () => {
  assert.equal(isAdminIpAllowed('10.42.7.9', ['10.42.0.0/16']), true);
  assert.equal(isAdminIpAllowed('10.43.0.1', ['10.42.0.0/16']), false);
  assert.equal(isAdminIpAllowed('192.168.1.200', ['192.168.1.0/24']), true);
  assert.equal(isAdminIpAllowed('192.168.2.1', ['192.168.1.0/24']), false);
  assert.equal(isAdminIpAllowed('fd00::abcd', ['fd00::/8']), true);
  assert.equal(isAdminIpAllowed('fe80::1', ['fd00::/8']), false);
});

test('🛡️ Admin IP: el prefijo IPv4-mapeado se normaliza (sockets de pila dual)', () => {
  assert.equal(isAdminIpAllowed('::ffff:10.42.0.1', ['10.42.0.1']), true);
  assert.equal(isAdminIpAllowed('::ffff:10.42.5.5', ['10.42.0.0/16']), true);
  assert.equal(isAdminIpAllowed('::ffff:127.0.0.1', ['10.42.0.1']), true);
  assert.equal(isAdminIpAllowed('::ffff:10.99.0.1', ['10.42.0.0/16']), false);
});

test('🛡️ Admin IP: el loopback siempre está permitido y una IP vacía o inválida nunca', () => {
  assert.equal(isAdminIpAllowed('127.0.0.1', ['10.42.0.1']), true);
  assert.equal(isAdminIpAllowed('::1', ['10.42.0.1']), true);
  assert.equal(isAdminIpAllowed('', ['0.0.0.0/0']), false);
  assert.equal(isAdminIpAllowed('no-es-una-ip', ['0.0.0.0/0']), false);
});

test('🛡️ Admin IP: las entradas inválidas se ignoran y nunca autorizan (fail-closed)', () => {
  assert.equal(isAdminIpAllowed('10.42.0.1', ['basura', '10.42.0.0/99', '10.42.0.0/x']), false);
  assert.equal(isAdminIpAllowed('10.42.0.1', ['basura', '10.42.0.1']), true);
});

function runMiddleware(ip: string, allowed: string | undefined) {
  const previous = process.env.ADMIN_ALLOWED_IPS;
  if (allowed === undefined) delete process.env.ADMIN_ALLOWED_IPS;
  else process.env.ADMIN_ALLOWED_IPS = allowed;
  try {
    let status = 200;
    let nextCalled = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;
    adminIpRestricted({ ip, socket: { remoteAddress: ip } } as unknown as Request, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    return { status, nextCalled };
  } finally {
    if (previous === undefined) delete process.env.ADMIN_ALLOWED_IPS;
    else process.env.ADMIN_ALLOWED_IPS = previous;
  }
}

test('🛡️ Admin IP: el middleware responde 403 fuera de la lista y deja pasar dentro de un CIDR', () => {
  assert.deepEqual(runMiddleware('10.42.3.4', '10.42.0.0/16, 192.168.1.50'), { status: 200, nextCalled: true });
  assert.deepEqual(runMiddleware('203.0.113.9', '10.42.0.0/16, 192.168.1.50'), { status: 403, nextCalled: false });
});

test('🛡️ Admin IP: sin ADMIN_ALLOWED_IPS el panel no se restringe por IP', () => {
  assert.deepEqual(runMiddleware('203.0.113.9', undefined), { status: 200, nextCalled: true });
  assert.deepEqual(runMiddleware('203.0.113.9', ''), { status: 200, nextCalled: true });
});
