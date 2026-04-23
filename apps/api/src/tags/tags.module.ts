import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller.js';

@Module({
  controllers: [TagsController],
})
export class TagsModule {}
