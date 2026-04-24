import { Module } from '@nestjs/common';
import { InterpretationsController } from './interpretations.controller.js';
import { InterpretationsService } from './interpretations.service.js';

@Module({
  controllers: [InterpretationsController],
  providers: [InterpretationsService],
  exports: [InterpretationsService],
})
export class InterpretationsModule {}
