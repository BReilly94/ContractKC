import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'node',
      include: [
        'packages/shared/**/*.test.ts',
        'packages/domain/**/*.test.ts',
        'packages/secrets/**/*.test.ts',
        'packages/auth/**/*.test.ts',
        'packages/audit/**/*.test.ts',
        'apps/api/**/*.test.ts',
      ],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'dom',
      include: [
        'packages/ui-kit/**/*.test.ts',
        'packages/ui-kit/**/*.test.tsx',
        'apps/web/**/*.test.ts',
        'apps/web/**/*.test.tsx',
      ],
      environment: 'jsdom',
      setupFiles: ['./packages/ui-kit/vitest.setup.ts'],
    },
  },
]);
