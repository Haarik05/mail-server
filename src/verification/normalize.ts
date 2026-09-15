export interface NormalizedEmail {
  originalInput: string;
  normalizedEmail: string;
  localPart: string;
  domain: string;
}

/**
 * Normalizes an email address according to the verification system specifications.
 *
 * Rules:
 * - Removes surrounding whitespace.
 * - Normalizes the domain portion to lowercase.
 * - Preserves the original input for logging/auditing.
 * - Avoids blindly modifying the local part (preserves case).
 *
 * @param input The raw email string to normalize
 * @returns An object containing the normalized data
 */
export function normalizeEmail(input: string): NormalizedEmail {
  const originalInput = input;

  // 1. Remove surrounding whitespace
  const trimmed = input.trim();

  // 2. Identify the separation between local part and domain.
  // The domain is typically the part after the last '@'.
  const lastAt = trimmed.lastIndexOf('@');

  // If there is no '@', or it's malformed, we just maintain basic structure.
  // We don't throw here; syntax validation will happen in Step 2.
  if (lastAt === -1 || lastAt === 0 || lastAt === trimmed.length - 1) {
    return {
      originalInput,
      normalizedEmail: trimmed.toLowerCase(), // fallback normalization
      localPart: trimmed,
      domain: '',
    };
  }

  const localPart = trimmed.slice(0, lastAt);
  const domainPart = trimmed.slice(lastAt + 1);

  // 3. Normalize domain to lowercase
  const normalizedDomain = domainPart.toLowerCase();

  return {
    originalInput,
    localPart,
    domain: normalizedDomain,
    normalizedEmail: `${localPart}@${normalizedDomain}`,
  };
}
