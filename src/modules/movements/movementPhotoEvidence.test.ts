import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../config/database.js', () => ({
  requireDatabase: () => ({ query: queryMock }),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    bunnyStorageZone: 'test-zone',
    bunnyStorageAccessKey: 'test-key',
    bunnyCdnHostname: 'cdn.example.test',
  },
}));

import { uploadMovementPhoto } from './movementPhotoEvidence.service.js';

const movementId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function validInput() {
  return {
    movementType: 'VEHICULO_PARTICULAR' as const,
    movementId,
    plate: 'ABC-123',
    contentType: 'image/jpeg',
    image: Buffer.from('photo'),
    userId,
  };
}

describe('uploadMovementPhoto', () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('does not save an evidence reference when Bunny rejects the upload', async () => {
    queryMock.mockResolvedValueOnce([{ id: movementId }]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadMovementPhoto(validInput())).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Bunny.net rechazó'),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it('saves the reference only after Bunny accepts the upload', async () => {
    const publicUrl = expect.stringContaining('https://cdn.example.test/movimientos/');
    queryMock
      .mockResolvedValueOnce([{ id: movementId }])
      .mockResolvedValueOnce([{ id: 'evidence-id', public_url: 'https://cdn.example.test/movimientos/photo.jpg' }]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadMovementPhoto(validInput())).resolves.toEqual({
      id: 'evidence-id',
      url: 'https://cdn.example.test/movimientos/photo.jpg',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://storage.bunnycdn.com/test-zone/movimientos/'),
      expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ AccessKey: 'test-key' }) }),
    );
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1]?.[0]).toContain('INSERT INTO movement_photo_evidence');
    expect(queryMock.mock.calls[1]?.[1]?.replacements.publicUrl).toEqual(publicUrl);
  });
});
