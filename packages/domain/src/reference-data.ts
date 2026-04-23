export interface GoverningLawOption {
  readonly code: string;
  readonly label: string;
  readonly group: 'Canada' | 'United States' | 'International';
}

export const GOVERNING_LAW_OPTIONS: readonly GoverningLawOption[] = [
  { code: 'CA-ON', label: 'Ontario, Canada', group: 'Canada' },
  { code: 'CA-QC', label: 'Quebec, Canada', group: 'Canada' },
  { code: 'CA-BC', label: 'British Columbia, Canada', group: 'Canada' },
  { code: 'CA-AB', label: 'Alberta, Canada', group: 'Canada' },
  { code: 'CA-SK', label: 'Saskatchewan, Canada', group: 'Canada' },
  { code: 'CA-MB', label: 'Manitoba, Canada', group: 'Canada' },
  { code: 'CA-NB', label: 'New Brunswick, Canada', group: 'Canada' },
  { code: 'CA-NS', label: 'Nova Scotia, Canada', group: 'Canada' },
  { code: 'CA-PE', label: 'Prince Edward Island, Canada', group: 'Canada' },
  { code: 'CA-NL', label: 'Newfoundland and Labrador, Canada', group: 'Canada' },
  { code: 'CA-YT', label: 'Yukon, Canada', group: 'Canada' },
  { code: 'CA-NT', label: 'Northwest Territories, Canada', group: 'Canada' },
  { code: 'CA-NU', label: 'Nunavut, Canada', group: 'Canada' },
  { code: 'CA-FEDERAL', label: 'Canada (Federal)', group: 'Canada' },
  { code: 'US-DE', label: 'Delaware, United States', group: 'United States' },
  { code: 'US-NY', label: 'New York, United States', group: 'United States' },
  { code: 'GB-EW', label: 'England and Wales', group: 'International' },
  { code: 'AU-NSW', label: 'New South Wales, Australia', group: 'International' },
  { code: 'AU-WA', label: 'Western Australia', group: 'International' },
  { code: 'MX-FEDERAL', label: 'Mexico (Federal)', group: 'International' },
  { code: 'OTHER', label: 'Other', group: 'International' },
];

export function isValidGoverningLaw(code: string): boolean {
  return GOVERNING_LAW_OPTIONS.some((o) => o.code === code);
}
