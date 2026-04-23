export interface SecretsProvider {
  readonly mode: 'local' | 'azure';
  get(key: string): Promise<string | undefined>;
  getRequired(key: string): Promise<string>;
  has(key: string): Promise<boolean>;
}
