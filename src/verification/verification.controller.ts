import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { verifyEmailAddress, VerificationResult } from './verifier.js';

@Controller('v1')
export class VerificationController {
  private readonly logger = new Logger(VerificationController.name);

  /**
   * Endpoint matches: POST /v1/verify
   * Expects JSON: { "email": "address@example.com" }
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: { email: string },
  ): Promise<VerificationResult> {
    if (!body || typeof body.email !== 'string' || body.email.trim() === '') {
      this.logger.warn('Received invalid/empty email verification request.');
      throw new BadRequestException('A valid email string field is required.');
    }

    this.logger.log(`Starting verification pipeline for: ${body.email}`);

    // Pipe the request into our verification engine
    const result = await verifyEmailAddress(body.email);

    this.logger.log(
      `Completed verification for ${body.email} -> Status: ${result.final_status}`,
    );
    return result;
  }
}
