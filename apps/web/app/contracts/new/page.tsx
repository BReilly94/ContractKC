'use client';

import { Stepper, type Step } from '@ckb/ui-kit';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthedShell } from '@/components/AuthedShell';
import { Step1Basics } from '@/components/wizard/Step1Basics';
import { Step2Commercial } from '@/components/wizard/Step2Commercial';
import { Step3Access } from '@/components/wizard/Step3Access';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useWizardStore } from '@/lib/wizard-store';

export default function NewContractPage() {
  return (
    <AuthedShell>
      <Wizard />
    </AuthedShell>
  );
}

function Wizard() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const state = useWizardStore();
  const reset = useWizardStore((s) => s.reset);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: Step[] = [
    { id: 'basics', label: 'Basics', state: stepState('basics', state.step) },
    { id: 'commercial', label: 'Commercial & term', state: stepState('commercial', state.step) },
    { id: 'access', label: 'Access & review', state: stepState('access', state.step) },
  ];

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: state.name,
        clientPartyId: state.clientPartyId,
        responsiblePmUserId: state.responsiblePmUserId,
        currency: state.currency,
        startDate: state.startDate,
        governingLaw: state.governingLaw,
        confidentialityClass: state.confidentialityClass,
        language: state.language,
        additionalGrants: state.additionalGrants,
      };
      if (state.contractValueCents !== null) body.contractValueCents = state.contractValueCents;
      if (state.endDate) body.endDate = state.endDate;
      if (state.humanEmailAlias) body.humanEmailAlias = state.humanEmailAlias;

      const created = await api.createContract({ token }, body);
      reset();
      router.push(`/contracts/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>New contract</h1>
      <Stepper steps={steps} ariaLabel="Contract creation steps" />
      <div className="ckb-card">
        {state.step === 'basics' && (
          <Step1Basics onNext={() => state.setStep('commercial')} />
        )}
        {state.step === 'commercial' && (
          <Step2Commercial
            onBack={() => state.setStep('basics')}
            onNext={() => state.setStep('access')}
          />
        )}
        {state.step === 'access' && (
          <Step3Access
            onBack={() => state.setStep('commercial')}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </main>
  );
}

function stepState(
  id: 'basics' | 'commercial' | 'access',
  current: 'basics' | 'commercial' | 'access' | 'submitting',
): Step['state'] {
  const order = ['basics', 'commercial', 'access'];
  const iIdx = order.indexOf(id);
  const cIdx = order.indexOf(current === 'submitting' ? 'access' : current);
  if (iIdx === cIdx) return 'current';
  if (iIdx < cIdx) return 'complete';
  return 'pending';
}
