import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TranscriptionController } from './app.controller';

@Module({
  imports: [],
  controllers: [TranscriptionController],
  providers: [AppService],
})
export class AppModule {}
