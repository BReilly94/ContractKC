import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logo } from './Logo.js';

describe('Logo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes an accessible name (a11y — ui.md §2)', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Technica Mining' })).not.toBeNull();
  });

  it('accepts a custom title for accessible name', () => {
    render(<Logo title="Technica Mining — Contract Knowledge Base" />);
    expect(
      screen.getByRole('img', { name: 'Technica Mining — Contract Knowledge Base' }),
    ).not.toBeNull();
  });

  it('renders at the requested width and preserves aspect ratio', () => {
    render(<Logo variant="horizontal" width={400} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('width')).toBe('400');
    // horizontal viewBox is 680x150 → height = 400 * 150/680 ≈ 88.23
    expect(Number(svg.getAttribute('height'))).toBeCloseTo((400 * 150) / 680, 1);
  });

  it('warns in dev when below the horizontal minimum width (brand guide p.6)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Logo variant="horizontal" width={100} />);
    expect(warn).toHaveBeenCalled();
  });

  it('warns in dev when below the vertical minimum width', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Logo variant="vertical" width={50} />);
    expect(warn).toHaveBeenCalled();
  });

  it('does not warn at or above the minimum width', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Logo variant="mark" width={42} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders the wordmark on horizontal and vertical but not on mark', () => {
    // The <title> element is always present for accessibility; the visible
    // wordmark is the <text> node. Brand rule: the wordmark must accompany
    // the mark on horizontal/vertical and be absent on the mark-only variant.
    const { rerender, container } = render(<Logo variant="horizontal" />);
    expect(container.querySelector('svg > text')?.textContent).toBe('Technica Mining');
    rerender(<Logo variant="vertical" />);
    expect(container.querySelector('svg > text')?.textContent).toBe('Technica Mining');
    rerender(<Logo variant="mark" />);
    expect(container.querySelector('svg > text')).toBeNull();
  });

  it('switches color via tone prop (brand: black/white/gray only)', () => {
    const { container, rerender } = render(<Logo tone="black" />);
    const span = container.querySelector('[data-ckb-logo]') as HTMLElement;
    expect(span.style.color).toMatch(/rgb\(0, 0, 0\)|#000000/i);
    rerender(<Logo tone="white" />);
    expect(span.style.color).toMatch(/rgb\(255, 255, 255\)|#ffffff/i);
    rerender(<Logo tone="gray" />);
    expect(span.style.color).toMatch(/rgb\(204, 204, 204\)|#cccccc/i);
  });

  it('applies clear-space padding proportional to the inner circle (brand guide p.5)', () => {
    const { container } = render(<Logo variant="mark" width={200} />);
    const span = container.querySelector('[data-ckb-logo]') as HTMLElement;
    // mark: inner circle is 40/200 = 20% of width → 40px padding at 200px rendered
    expect(span.style.padding).toBe('40px');
  });
});
