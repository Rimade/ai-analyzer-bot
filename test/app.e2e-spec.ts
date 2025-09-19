import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    jest.setTimeout(90000); // Увеличиваем таймаут для всего сьюта

    // Мокаем методы PrismaService
    mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      analysis: {
        create: jest.fn(),
      },
    };

    // Создаём тестовый модуль с подменённым PrismaService
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (mockPrisma && mockPrisma.$disconnect) {
      await mockPrisma.$disconnect();
    }
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.text).toBe('Hello World!');
  });

  // it('/user (POST)', async () => {
  //   const userDto = { telegramId: '123', username: 'test' };
  //   const mockUser = { id: 1, ...userDto };

  //   mockPrisma.user.create.mockResolvedValueOnce(mockUser);

  //   const res = await request(app.getHttpServer())
  //     .post('/user')
  //     .send(userDto)
  //     .expect(201);

  //   expect(res.body).toEqual(mockUser);
  // });
});
