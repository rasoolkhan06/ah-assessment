import { Injectable } from '@nestjs/common';
import { createClient } from '@deepgram/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import { rm } from 'fs/promises';

@Injectable()
export class AppService {
  private deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  async processAudio(filePath: string, id?: string) {
    const chunkDir = path.join(__dirname, '..', '..', 'uploads', 'chunks');
    fs.mkdirSync(chunkDir, { recursive: true });

    // 1. Split into 5-min WAV chunks
    // await this.chunkAudio(filePath, chunkDir);

    // 2. Transcribe each chunk
    // const files = (await readdir(chunkDir)).filter(f => f.endsWith('.wav'));
    // let finalTranscript = '';

    console.time("transcribing");

    const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
      fs.readFileSync(filePath),
      {
        model: "nova-3",
        diarize: true,
        diarize_version: "v2",
        smart_format: true,
      }
    );

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    console.log('Transcript:', transcript);
    console.timeEnd("transcribing");

    // Generate SOAP report using Gemini
    console.time("soap_report");
    const soapReport = await this.generateSOAPReport(transcript);
    console.log('SOAP Report:', soapReport);
    console.timeEnd("soap_report");
    
    // Cleanup
    await rm(chunkDir, { recursive: true, force: true });
    
    return { transcript, soapReport };
  }

  chunkAudio(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(path.join(outputDir, 'chunk_%03d.wav'))
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .outputOptions('-f', 'segment', '-segment_time', '300') // 5 minutes
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async generateSOAPReport(transcript: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
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

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating SOAP report:', error);
      return 'Failed to generate SOAP report. Please try again.';
    }
  }
}
