import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { access, constants } from 'fs/promises';
import { DeepgramService, TranscriptionError } from './services/deepgram.service';
import { GeminiService, SOAPGenerationError } from './services/gemini.service';

class FileOperationError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'FileOperationError';
  }
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly deepgramService: DeepgramService,
    private readonly geminiService: GeminiService
  ) {}

  async processAudio(filePath: string, id?: string) {
    const method = 'processAudio';
    this.logger.log(`[${method}] Starting audio processing for file: ${filePath}`);
    
    if (!filePath || typeof filePath !== 'string') {
      throw new HttpException('Invalid file path provided', HttpStatus.BAD_REQUEST);
    }

    try {

      try {
        await access(filePath, constants.R_OK);
      } catch (error) {
        throw new FileOperationError(
          `Audio file not found or not accessible: ${filePath}`, 
          'FILE_NOT_ACCESSIBLE',
          { filePath, error: error.message }
        );
      }

      this.logger.log(`[${method}] Starting transcription`);
      console.time("transcribing");
      
      let transcript = '';
      let audioDuration = 0;
      
      try {
        const transcriptionResult = await this.deepgramService.transcribeAudio(filePath);
        transcript = transcriptionResult.transcript;
        audioDuration = transcriptionResult.metadata.duration;
        this.logger.log(`[${method}] Transcription completed, length: ${transcript.length} chars`);
        console.timeEnd("transcribing");

        this.logger.log(`[${method}] Starting SOAP report generation`);
        console.time("soap_report");
        
        let soapReport;
        try {
          soapReport = await this.geminiService.generateSOAPReport(transcript);
          this.logger.log(`[${method}] SOAP report generated successfully`);
          
          return { 
            success: true,
            transcript, 
            soapReport,
            metadata: {
              audioDuration,
              wordCount: transcript.split(/\s+/).length,
              timestamp: new Date().toISOString()
            }
          };
          
        } catch (error) {
          this.logger.error(`[${method}] SOAP report generation failed`, error);
          soapReport = 'SOAP report generation failed: ' + error.message;
          
          return { 
            success: true,
            transcript, 
            soapReport,
            metadata: {
              audioDuration,
              wordCount: transcript.split(/\s+/).length,
              timestamp: new Date().toISOString()
            }
          };
          
        } finally {
          console.timeEnd("soap_report");
        }
      } catch (error) {
        this.logger.error(`[${method}] Transcription failed`, error);
        throw new TranscriptionError(
          `Transcription failed: ${error.message}`,
          'TRANSCRIPTION_FAILED',
          { error: error.message, stack: error.stack }
        );
      }
      
    } catch (error) {
      this.logger.error(`[${method}] Error processing audio`, error);
      
      if (error instanceof FileOperationError || 
          error instanceof TranscriptionError || 
          error instanceof SOAPGenerationError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: error.message,
            error: error.name,
            code: error.code,
            details: error.details
          },
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred during audio processing',
          error: 'INTERNAL_SERVER_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      
    }
  }
}
