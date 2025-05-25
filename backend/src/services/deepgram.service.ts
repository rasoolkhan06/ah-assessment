import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import { access, constants } from 'fs/promises';

export class TranscriptionError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

@Injectable()
export class DeepgramService {
  private readonly logger = new Logger(DeepgramService.name);
  private deepgram: ReturnType<typeof createClient>;

  constructor() {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY is not set in environment variables');
    }
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  }

  async transcribeAudio(filePath: string) {
    const method = 'transcribeAudio';
    this.logger.log(`[${method}] Starting transcription for file: ${filePath}`);

    try {
      // Verify file exists and is accessible
      await access(filePath, constants.R_OK);
      
      this.logger.log(`[${method}] Sending request to Deepgram API`);
      const response = await this.deepgram.listen.prerecorded.transcribeFile(
        fs.readFileSync(filePath),
        {
          model: "nova-3",
          diarize: true,
          diarize_version: "v2",
          smart_format: true,
        }
      );
      
      if (response.error) {
        throw new TranscriptionError(
          `Deepgram API error: ${response.error.message}`,
          'DEEPGRAM_API_ERROR',
          { error: response.error }
        );
      }
      
      const transcript = response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      this.logger.log(`[${method}] Transcription completed, length: ${transcript.length} chars`);
      
      return {
        transcript,
        metadata: {
          duration: response.result?.metadata?.duration,
          wordCount: transcript.split(/\s+/).length,
        },
        fullResponse: response.result
      };
      
    } catch (error) {
      this.logger.error(`[${method}] Transcription failed`, error);
      
      if (error instanceof TranscriptionError) {
        throw error;
      }
      
      throw new TranscriptionError(
        error.message || 'Failed to transcribe audio',
        'TRANSCRIPTION_FAILED',
        { 
          error: error.message,
          stack: error.stack,
          filePath 
        }
      );
    }
  }
}
