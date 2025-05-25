import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createClient } from '@deepgram/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { rm, access, constants } from 'fs/promises';

class TranscriptionError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

class SOAPGenerationError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'SOAPGenerationError';
  }
}

class FileOperationError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'FileOperationError';
  }
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private deepgram: ReturnType<typeof createClient>;
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.initializeServices();
  }

  private initializeServices() {
    try {
      if (!process.env.DEEPGRAM_API_KEY) {
        throw new Error('DEEPGRAM_API_KEY is not set in environment variables');
      }
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in environment variables');
      }
      
      this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    } catch (error) {
      this.logger.error('Failed to initialize services', error);
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }

  async processAudio(filePath: string, id?: string) {
    const method = 'processAudio';
    this.logger.log(`[${method}] Starting audio processing for file: ${filePath}`);
    
    // Input validation
    if (!filePath || typeof filePath !== 'string') {
      throw new HttpException('Invalid file path provided', HttpStatus.BAD_REQUEST);
    }

    const chunkDir = path.join(__dirname, '..', '..', 'uploads', 'chunks');
    
    try {
      // Ensure uploads directory exists
      await fs.promises.mkdir(path.dirname(chunkDir), { recursive: true });
      
      // Create chunks directory with proper error handling
      try {
        await fs.promises.mkdir(chunkDir, { recursive: true });
      } catch (error) {
        throw new FileOperationError(
          `Failed to create chunks directory: ${error.message}`, 
          'CHUNK_DIR_CREATION_ERROR',
          { path: chunkDir, error: error.message }
        );
      }

      // Verify file exists and is accessible
      try {
        await access(filePath, constants.R_OK);
      } catch (error) {
        throw new FileOperationError(
          `Audio file not found or not accessible: ${filePath}`, 
          'FILE_NOT_ACCESSIBLE',
          { filePath, error: error.message }
        );
      }

      // Transcribe audio file
      this.logger.log(`[${method}] Starting transcription`);
      console.time("transcribing");
      
      let transcriptionResult;
      try {
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
        
        transcriptionResult = response.result;
      } catch (error) {
        if (error instanceof TranscriptionError) throw error;
        
        throw new TranscriptionError(
          `Transcription failed: ${error.message}`,
          'TRANSCRIPTION_FAILED',
          { error: error.message, stack: error.stack }
        );
      }

      const transcript = transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      this.logger.log(`[${method}] Transcription completed, length: ${transcript.length} chars`);
      console.timeEnd("transcribing");

      // Generate SOAP report using Gemini
      this.logger.log(`[${method}] Starting SOAP report generation`);
      console.time("soap_report");
      
      let soapReport;
      try {
        soapReport = await this.generateSOAPReport(transcript);
        this.logger.log(`[${method}] SOAP report generated successfully`);
      } catch (error) {
        this.logger.error(`[${method}] SOAP report generation failed`, error);
        // Continue with partial results if SOAP generation fails
        soapReport = 'SOAP report generation failed: ' + error.message;
      } finally {
        console.timeEnd("soap_report");
      }
      
      return { 
        success: true,
        transcript, 
        soapReport,
        metadata: {
          audioDuration: transcriptionResult?.metadata?.duration,
          wordCount: transcript.split(/\s+/).length,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      this.logger.error(`[${method}] Error processing audio`, error);
      
      // Convert specific errors to HTTP exceptions
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
      
      // Re-throw HTTP exceptions as is
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Handle unexpected errors
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred during audio processing',
          error: 'INTERNAL_SERVER_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
      
    } finally {
      // Cleanup chunks directory
      try {
        await rm(chunkDir, { recursive: true, force: true });
        this.logger.log(`[${method}] Cleaned up temporary files`);
      } catch (cleanupError) {
        this.logger.error(`[${method}] Failed to clean up temporary files`, cleanupError);
      }
    }
  }

  // chunkAudio(inputPath: string, outputDir: string): Promise<void> {
  //   return new Promise((resolve, reject) => {
  //     ffmpeg(inputPath)
  //       .output(path.join(outputDir, 'chunk_%03d.wav'))
  //       .audioCodec('pcm_s16le')
  //       .audioChannels(1)
  //       .audioFrequency(16000)
  //       .format('wav')
  //       .outputOptions('-f', 'segment', '-segment_time', '300') // 5 minutes
  //       .on('end', () => resolve())
  //       .on('error', (err) => reject(err))
  //       .run();
  //   });
  // }

  private async generateSOAPReport(transcript: string): Promise<string> {
    const method = 'generateSOAPReport';
    this.logger.log(`[${method}] Generating SOAP report for transcript (${transcript.length} chars)`);
    
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      throw new Error('Transcript is empty or invalid');
    }

    try {
      // Truncate very long transcripts to avoid hitting token limits
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 4000,
        },
      });
      
      const prompt = `Please analyze the following medical conversation and generate a SOAP report. 
      If the conversation is not medical-related, please state that it's not a medical conversation.
      
      Conversation:
      ${transcript}
      
      Format your response as follows:
      
      **Subjective (S):**
      - Patient's symptoms and concerns
      - History of present illness
      - Review of systems
      
      **Objective (O):**
      - Physical exam findings
      - Vital signs (if mentioned)
      - Test results (if mentioned)
      
      **Assessment (A):**
      - Diagnosis or impression
      - Differential diagnosis (if applicable)
      
      **Plan (P):**
      - Diagnostic tests (if needed)
      - Treatment plan
      - Follow-up instructions
      - Patient education`;

      this.logger.log(`[${method}] Sending request to Gemini API`);
      const result = await model.generateContent(prompt);
      
      if (!result || !result.response) {
        throw new SOAPGenerationError(
          'Empty response from Gemini API',
          'GEMINI_EMPTY_RESPONSE'
        );
      }
      
      const text = await result.response.text();
      
      if (!text || text.trim().length === 0) {
        throw new SOAPGenerationError(
          'Empty SOAP report generated',
          'EMPTY_SOAP_REPORT'
        );
      }
      
      return text;
      
    } catch (error) {
      this.logger.error(`[${method}] Error generating SOAP report`, error);
      
      if (error instanceof SOAPGenerationError) {
        throw error;
      }
      
      throw new SOAPGenerationError(
        `Failed to generate SOAP report: ${error.message}`,
        'SOAP_GENERATION_FAILED',
        { 
          error: error.message,
          stack: error.stack,
          transcriptLength: transcript.length 
        }
      );
    }
  }
}
