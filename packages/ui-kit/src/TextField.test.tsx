import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField.js';

describe('TextField', () => {
  it('associates the label with the input (a11y — ui.md §2)', () => {
    render(<TextField label="Contract name" name="name" />);
    const input = screen.getByLabelText('Contract name');
    expect(input).not.toBeNull();
  });

  it('announces errors with role=alert and aria-invalid', () => {
    render(<TextField label="Name" error="Required" />);
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Required');
  });

  it('wires help text via aria-describedby when no error', () => {
    render(<TextField label="Name" help="Must be unique" />);
    const input = screen.getByLabelText('Name');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const helpEl = describedBy ? document.getElementById(describedBy) : null;
    expect(helpEl?.textContent).toBe('Must be unique');
  });

  it('shows required marker in label when required', () => {
    render(<TextField label="Name" required />);
    expect(screen.getByText(/Name/).textContent).toContain('*');
  });
});
