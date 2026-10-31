import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from './app.js';

describe('SICAF API', () => {
  it('responde a la comprobación de estado', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'sicaf-api' });
  });

  it('publica el registro de módulos iniciales', async () => {
    const response = await request(app).get('/api/v1');
    expect(response.status).toBe(200);
    expect(response.body.modules).toHaveLength(6);
    expect(response.body.modules).toContainEqual({
      key: 'users',
      name: 'Usuarios y roles',
      path: '/api/v1/users',
    });
  });

  it('permite al panel web consultar la API mediante CORS', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('responde 404 para rutas inexistentes', async () => {
    const response = await request(app).get('/ruta-inexistente');
    expect(response.status).toBe(404);
  });

  it('protege la administración de usuarios', async () => {
    const response = await request(app).get('/api/v1/users');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('No autorizado');
  });

  it('protege el catálogo de funcionarios', async () => {
    const response = await request(app).get('/api/v1/catalogs/employees');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('No autorizado');
  });

  it('protege el catálogo de vehículos institucionales', async () => {
    const response = await request(app).get('/api/v1/catalogs/institutional-vehicles');
    expect(response.status).toBe(401);
  });

  it('protege el catálogo de vehículos particulares', async () => {
    const response = await request(app).get('/api/v1/catalogs/private-vehicles');
    expect(response.status).toBe(401);
  });

  it('protege la resolución y creación de movimientos NFC', async () => {
    const resolution = await request(app).post('/api/v1/movements/employees/nfc/resolve').send({ code: 'TAG-001' });
    const creation = await request(app).post('/api/v1/movements/employees/nfc').send({ code: 'TAG-001', movementType: 'INGRESO', source: 'NFC_SIMULADO' });
    expect(resolution.status).toBe(401);
    expect(creation.status).toBe(401);
  });

  it('protege los movimientos manuales y la consulta de aforo', async () => {
    expect((await request(app).post('/api/v1/movements/employees/manual/resolve')).status).toBe(401);
    expect((await request(app).post('/api/v1/movements/employees/manual')).status).toBe(401);
    expect((await request(app).get('/api/v1/movements/employees/presence/count')).status).toBe(401);
    expect((await request(app).get('/api/v1/movements/presence/emergency')).status).toBe(401);
  });

  it('protege el registro y la consulta de visitantes', async () => {
    expect((await request(app).post('/api/v1/movements/visitors/entry')).status).toBe(401);
    expect((await request(app).get('/api/v1/movements/visitors/active')).status).toBe(401);
    expect((await request(app).get('/api/v1/movements/visitors/identity?identification=1')).status).toBe(401);
    expect((await request(app).get('/api/v1/movements/visitors/badges/available')).status).toBe(401);
    expect((await request(app).post('/api/v1/movements/visitor-vehicles/entry')).status).toBe(401);
    expect((await request(app).post('/api/v1/movements/visitors/00000000-0000-0000-0000-000000000000/exit')).status).toBe(401);
  });

  it('protege el historial de auditoría de movimientos', async () => {
    expect((await request(app).get('/api/v1/movements/history')).status).toBe(401);
  });
});
