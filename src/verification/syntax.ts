import * as emailValidator from 'email-validator';

export interface SyntaxCheckResult {
  isValid: boolean;
}

/**
 * Validates the structural syntax of an email address.
 * Use a proper parsing library rather than regex as per spec.
 *
 * Note: Syntax valid ≠ Email exists. This only confirms correct structure.
 *
 * @param email The parsed and normalized email address
 * @returns An object containing the syntax validity
 */
export function checkSyntax(email: string): SyntaxCheckResult {
  const isValid = emailValidator.validate(email);
  return { isValid };
}
