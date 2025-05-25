import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class SOAPGenerationError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: any) {
    super(message);
    this.name = 'SOAPGenerationError';
  }
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async generateSOAPReport(transcript: string): Promise<string> {
    const method = 'generateSOAPReport';
    this.logger.log(`[${method}] Generating SOAP report for transcript (${transcript.length} chars)`);
    
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      throw new Error('Transcript is empty or invalid');
    }

    try {
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
