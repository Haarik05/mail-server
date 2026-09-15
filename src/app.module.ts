import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { VerificationController } from './verification/verification.controller.js';

@Module({
  imports: [],
  controllers: [AppController, VerificationController],
  providers: [AppService],
})
export class AppModule {}
