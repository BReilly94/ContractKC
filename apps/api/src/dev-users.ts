import type { User } from '@ckb/domain';
import { asBrandedId } from '@ckb/shared';

const STABLE_CREATED_AT = new Date('2026-04-01T00:00:00.000Z');

export const DEV_USERS: readonly User[] = [
  {
    id: asBrandedId<'User'>('01HXDEVSEED0000000000BRYAN'),
    email: 'breilly@technicamining.com',
    displayName: 'Brian Reilly',
    globalRole: 'SystemAdministrator',
    isPm: false,
    canCreateContracts: true,
    createdAt: STABLE_CREATED_AT,
  },
  {
    id: asBrandedId<'User'>('01HXDEVSEED00000000000DANA'),
    email: 'dana.pm@technicamining.com',
    displayName: 'Dana (PM)',
    globalRole: 'Standard',
    isPm: true,
    canCreateContracts: false,
    createdAt: STABLE_CREATED_AT,
  },
  {
    id: asBrandedId<'User'>('01HXDEVSEED000000000000SAM'),
    email: 'sam.viewer@technicamining.com',
    displayName: 'Sam (Viewer)',
    globalRole: 'Standard',
    isPm: false,
    canCreateContracts: false,
    createdAt: STABLE_CREATED_AT,
  },
];
