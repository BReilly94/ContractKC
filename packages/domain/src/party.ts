import type { PartyId, UserId } from './ids.js';

export interface Party {
  readonly id: PartyId;
  readonly name: string;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
}
