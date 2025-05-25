import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { TranscriptionController } from './app.controller';
import { DeepgramService } from './services/deepgram.service';
import { GeminiService } from './services/gemini.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [TranscriptionController],
  providers: [
    AppService,
    DeepgramService,
    GeminiService
  ],
})
export class AppModule {}
