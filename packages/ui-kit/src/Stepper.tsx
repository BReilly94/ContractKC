export interface Step {
  readonly id: string;
  readonly label: string;
  readonly state: 'pending' | 'current' | 'complete';
}

export interface StepperProps {
  readonly steps: readonly Step[];
  readonly ariaLabel?: string;
}

export function Stepper({ steps, ariaLabel = 'Progress' }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.state === 'current');
  return (
    <nav aria-label={ariaLabel} className="ckb-stepper">
      <ol>
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={`ckb-stepper__item ckb-stepper__item--${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="ckb-stepper__index" aria-hidden="true">
              {i + 1}
            </span>
            <span className="ckb-stepper__label">{step.label}</span>
            {step.state === 'complete' && (
              <span className="ckb-visuallyhidden">(completed)</span>
            )}
          </li>
        ))}
      </ol>
      {currentIndex >= 0 && (
        <p className="ckb-visuallyhidden">
          Step {currentIndex + 1} of {steps.length}: {steps[currentIndex]?.label}
        </p>
      )}
    </nav>
  );
}
