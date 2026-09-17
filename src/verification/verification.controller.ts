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
   *
   * Returns the full EmailVerificationReport from @visulima/email-verifier,
   * which includes:
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
    @Body() body: { email: string },
  ): Promise<EmailVerificationReport> {
    if (!body || typeof body.email !== 'string' || body.email.trim() === '') {
      this.logger.warn(
        'Received an invalid or empty email verification request.',
      );
      throw new BadRequestException(
        'A valid "email" string field is required.',
      );
    }

    this.logger.log(`Starting verification pipeline for: ${body.email}`);

    const report = await verifyEmailAddress(body.email);

    this.logger.log(
      `Completed verification for ${body.email} — state: ${report.state}, score: ${report.score}`,
    );

    return report;
  }
}
