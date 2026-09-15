export interface ExtractDomainResult {
  domain: string;
}

/**
 * Extracts the domain from an email address.
 * Assumes the email has already passed basic normalization.
 *
 * @param email The parsed and normalized email address
 * @returns An object containing the extracted domain
 */
export function extractDomain(email: string): ExtractDomainResult {
  const lastAt = email.lastIndexOf('@');

  if (lastAt === -1 || lastAt === email.length - 1) {
    return { domain: '' };
  }

  return {
    domain: email.substring(lastAt + 1),
  };
}
