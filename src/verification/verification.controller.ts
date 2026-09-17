import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  verifyEmailAddress,
  type EmailVerificationReport,
} from './verifier.js';

@Controller('v1')
export class VerificationController {
  private readonly logger = new Logger(VerificationController.name);

  /**
   * POST /v1/verify
   * Body: { "email": "address@example.com" }
   *    or { "emails": ["address@example.com", "another@example.com"] }
   *
   * Returns a single EmailVerificationReport or an array of reports from
   * @visulima/email-verifier, which includes:
   *  - state        ("deliverable" | "undeliverable" | "risky" | "unknown")
   *  - score        (0–100 quality score)
   *  - syntax       (structural validity)
   *  - mx           (MX record details)
   *  - smtp         (SMTP probe result, catch-all flag, retry info)
   *  - disposable   (disposable-domain flag)
   *  - free         (free-provider flag)
   *  - role         (role-account flag)
   *  - typo         (typo suggestion if detected)
   *  - provider     (provider classification)
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: { email?: string; emails?: string[] },
  ): Promise<EmailVerificationReport | EmailVerificationReport[]> {
    if (
      body?.email &&
      typeof body.email === 'string' &&
      body.email.trim() !== ''
    ) {
      this.logger.log(`Starting verification pipeline for: ${body.email}`);
      const report = await verifyEmailAddress(body.email);
      this.logger.log(
        `Completed verification for ${body.email} — state: ${report.state}, score: ${report.score}`,
      );
      return report;
    }

    if (body?.emails && Array.isArray(body.emails) && body.emails.length > 0) {
      if (body.emails.some((e) => typeof e !== 'string' || e.trim() === '')) {
        throw new BadRequestException(
          'All elements in the "emails" array must be valid, non-empty strings.',
        );
      }
      this.logger.log(
        `Starting verification pipeline for array of ${body.emails.length} emails`,
      );
      const reports = await Promise.all(
        body.emails.map((e) => verifyEmailAddress(e)),
      );
      this.logger.log(
        `Completed verification for array of ${body.emails.length} emails`,
      );
      return reports;
    }

    this.logger.warn(
      'Received an invalid or empty email verification request.',
    );
    throw new BadRequestException(
      'A valid "email" string or "emails" array field is required.',
    );
  }
}
