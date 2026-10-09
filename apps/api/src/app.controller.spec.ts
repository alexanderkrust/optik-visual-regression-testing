import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './database/prisma.service';
import { StorageService } from './storage/storage.service';

describe('AppController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const storage = { ping: jest.fn() };
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    controller = module.get(AppController);
  });

  it('reports liveness', () => {
    expect(controller.health()).toEqual({ status: 'ok', version: expect.any(String) });
  });

  it('is ready when database and storage respond', async () => {
    prisma.$queryRaw.mockResolvedValue([1]);
    storage.ping.mockResolvedValue(true);
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: true, storage: true },
    });
  });

  it('is not ready when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    storage.ping.mockResolvedValue(true);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
