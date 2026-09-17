import {
  verifyEmail,
  type EmailVerificationReport,
} from '@visulima/email-verifier';
import { Logger } from '@nestjs/common';

export type { EmailVerificationReport };

const logger = new Logger('VerificationPipeline');

/**
 * Verifies an email address end-to-end using @visulima/email-verifier.
 *
 * Runs all offline checks (syntax, disposable, free-provider, role-account,
 * tag, typo detection) immediately, then performs live MX + SMTP probing
 * concurrently, including greylist retry logic and catch-all detection.
 *
 * @param rawEmail  The raw email address string supplied by the caller.
 * @returns         A fully-scored EmailVerificationReport.
 */
export async function verifyEmailAddress(
  rawEmail: string,
): Promise<EmailVerificationReport> {
  logger.debug(`[${rawEmail}] Starting verification pipeline.`);

  const report = await verifyEmail(rawEmail, {
    checkSmtp: true,
    smtp: {
      /**
       * Retry once on temporary (4xx / greylisting) failures before marking
       * the result as deferred.
       */
      retries: 1,
      retryDelay: 5_000, // 5 s between greylist retries
      timeout: 10_000, // 10 s per SMTP connection attempt
      catchAllProbes: 1, // send one random probe to detect catch-all domains
    },
  });

  logger.log(
    `[${rawEmail}] Verification complete — state: ${report.state}, score: ${report.score}`,
  );

  return report;
}
