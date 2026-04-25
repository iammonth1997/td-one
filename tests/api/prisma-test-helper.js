import { vi } from 'vitest';

export function mockPrismaModule(prismaMock) {
  return {
    __esModule: true,
    default: prismaMock,
    getPrisma: vi.fn(() => prismaMock),
  };
}
