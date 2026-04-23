'use client';

import { create } from 'zustand';

export type WizardStep = 'basics' | 'commercial' | 'access' | 'submitting';

export type ContractRole =
  | 'Owner'
  | 'Administrator'
  | 'Contributor'
  | 'Viewer'
  | 'RestrictedViewer';

export interface WizardState {
  step: WizardStep;
  name: string;
  clientPartyId: string;
  responsiblePmUserId: string;
  confidentialityClass: 'Standard' | 'Restricted' | 'HighlyRestricted';
  language: string;
  contractValueCents: number | null;
  currency: string;
  startDate: string;
  endDate: string;
  governingLaw: string;
  humanEmailAlias: string;
  additionalGrants: Array<{ userId: string; role: ContractRole }>;
  setField<K extends keyof WizardState>(key: K, value: WizardState[K]): void;
  setStep(step: WizardStep): void;
  reset(): void;
}

const INITIAL: Omit<WizardState, 'setField' | 'setStep' | 'reset'> = {
  step: 'basics',
  name: '',
  clientPartyId: '',
  responsiblePmUserId: '',
  confidentialityClass: 'Standard',
  language: 'en',
  contractValueCents: null,
  currency: 'CAD',
  startDate: '',
  endDate: '',
  governingLaw: '',
  humanEmailAlias: '',
  additionalGrants: [],
};

export const useWizardStore = create<WizardState>((set) => ({
  ...INITIAL,
  setField: (key, value) => set({ [key]: value } as Partial<WizardState>),
  setStep: (step) => set({ step }),
  reset: () => set(INITIAL),
}));
