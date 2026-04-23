import { ulid as makeUlid } from 'ulid';

export function newUlid(): string {
  return makeUlid();
}

export type BrandedId<TBrand extends string> = string & { readonly __brand: TBrand };

export function asBrandedId<TBrand extends string>(id: string): BrandedId<TBrand> {
  return id as BrandedId<TBrand>;
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isValidUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}
