import { normalizeEmail } from './normalize.js';
import { checkSyntax } from './syntax.js';
import { extractDomain } from './domain.js';
import { getMxRecords } from './mx.js';
import { resolveMxHostname } from './dns.js';
// import { SmtpResult } from './smtp.js';
import { checkSmtpMailbox, SmtpResult } from './smtp.js';
import { Logger } from '@nestjs/common';

const logger = new Logger('VerificationPipeline');

export interface VerificationResult {
  email: string;
  syntax: { valid: boolean };
  domain: { valid: boolean; value: string };
  mx: { valid: boolean; servers: any[] };
  smtp: { status: 'accepted' | 'rejected' | 'unknown'; message?: string };
  disposable: boolean;
  role_account: boolean;
  catch_all: boolean;
  final_status: 'valid' | 'invalid' | 'risky' | 'unknown';
}

/**
 * Phase 1 Completer: The Orchestrator
 * Fully strings together Steps 1 through 8 to verify an email address safely.
 */
export async function verifyEmailAddress(
  rawEmail: string,
): Promise<VerificationResult> {
  // Base Result Blueprint
  const result: VerificationResult = {
    email: rawEmail,
    syntax: { valid: false },
    domain: { valid: false, value: '' },
    mx: { valid: false, servers: [] },
    smtp: { status: 'unknown' },
    disposable: false, // Phase 5 feature (Stub)
    role_account: false, // Phase 6 feature (Stub)
    catch_all: false, // Phase 4 feature (Stub)
    final_status: 'unknown',
  };

  // Step 1: Normalize
  const normalized = normalizeEmail(rawEmail);
  result.email = normalized.normalizedEmail;
  if (!normalized.normalizedEmail) {
    logger.debug(`[${rawEmail}] Normalization failed (empty/invalid string).`);
    result.final_status = 'invalid';
    return result;
  }

  // Step 2: Syntax Validation
  const syntaxCheck = checkSyntax(normalized.normalizedEmail);
  result.syntax.valid = syntaxCheck.isValid;
  if (!syntaxCheck.isValid) {
    logger.debug(`[${result.email}] Syntax check failed.`);
    result.final_status = 'invalid';
    return result;
  }
  logger.debug(`[${result.email}] Syntax is valid.`);

  // Step 3: Extract Domain
  const domainExtraction = extractDomain(normalized.normalizedEmail);
  const domain = domainExtraction.domain;
  result.domain.valid = !!domain;
  result.domain.value = domain;
  if (!domain) {
    logger.debug(`[${result.email}] Domain extraction failed.`);
    result.final_status = 'invalid';
    return result;
  }
  logger.debug(`[${result.email}] Extracted domain: ${domain}`);

  // Steps 4 & 5: MX Lookup
  const mxCheck = await getMxRecords(domain);
  result.mx.valid = mxCheck.hasMx;
  result.mx.servers = mxCheck.records;

  if (!mxCheck.hasMx || mxCheck.records.length === 0) {
    logger.debug(
      `[${result.email}] No MX servers configured for domain ${domain}.`,
    );
    result.final_status = 'invalid';
    result.smtp.message = 'No MX servers configued for this domain.';
    return result;
  }
  logger.debug(
    `[${result.email}] Found ${mxCheck.records.length} MX servers (Top: ${mxCheck.records[0].exchange}).`,
  );

  // Steps 6, 7 & 8: Resolve IP, Connect, and Converse via SMTP
  let smtpResponse: SmtpResult | null = null;

  for (const mx of mxCheck.records) {
    logger.debug(`[${result.email}] Resolving MX Hostname: ${mx.exchange}`);
    const resolvedHost = await resolveMxHostname(mx.exchange);

    if (resolvedHost.resolved && resolvedHost.ips.length > 0) {
      const targetIp = resolvedHost.ips[0]; // Trying the very first IP resolved for this MX server

      logger.debug(
        `[${result.email}] Attempting SMTP connect via IP: ${targetIp}`,
      );
      smtpResponse = await checkSmtpMailbox(
        targetIp,
        normalized.normalizedEmail,
      );

      // Only proceed down the MX list if we couldn't reach the server entirely
      // If we got a 2xx, 4xx, or 5xx code, the SMTP conversation succeeded
      if (smtpResponse.code !== 0) {
        logger.debug(
          `[${result.email}] SMTP handshake successful (Code: ${smtpResponse.code}).`,
        );
        break;
      } else {
        logger.warn(
          `[${result.email}] SMTP target failed to reply properly on IP: ${targetIp} - ${smtpResponse.message}`,
        );
      }
    } else {
      logger.warn(`[${result.email}] Failed to resolve IPs for ${mx.exchange}`);
    }
  }

  if (!smtpResponse || smtpResponse.code === 0) {
    logger.error(
      `[${result.email}] Exhausted MX servers. Unable to establish SMTP connection.`,
    );
    result.smtp.status = 'unknown';
    result.smtp.message =
      smtpResponse?.message ||
      'Failed to establish TCP connection to any MX records';
    result.final_status = 'unknown';
    return result;
  }

  // Temporary Basic Classifier (Full classifier logic planned for Phase 7)
  result.smtp.message = smtpResponse.message;

  // 2xx = Mailbox Accepted
  if (smtpResponse.code >= 200 && smtpResponse.code < 300) {
    result.smtp.status = 'accepted';
    result.final_status = 'valid';
  }
  // 5xx = Permanent Rejection (e.g., Mailbox Not Found)
  else if (smtpResponse.code >= 500 && smtpResponse.code < 600) {
    result.smtp.status = 'rejected';
    result.final_status = 'invalid';
  }
  // 4xx = Temporary Failure (e.g., Greylisting, Rate Limited)
  else {
    result.smtp.status = 'unknown';
    result.final_status = 'unknown';
  }

  logger.log(
    `[${result.email}] Final evaluation state: ${result.final_status} (SMTP: ${result.smtp.status})`,
  );
  return result;
}
