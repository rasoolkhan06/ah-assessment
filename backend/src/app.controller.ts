import { Controller, Post, Get, UploadedFile, UseInterceptors, Param, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { AppService } from './app.service';

const prisma = new PrismaClient();

@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly transcriptionService: AppService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('audio'))
  async uploadAudio(@UploadedFile() file: Express.Multer.File) {
    const uploadsDir = join(__dirname, '..', '..', 'uploads');
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = join(uploadsDir, file.originalname);
    console.log('Saving file to:', filePath);
    await writeFile(filePath, file.buffer);
    console.log('File saved successfully');

    const record = await prisma.transcription.create({
      data: { fileName: file.originalname, status: 'in_progress', transcript: '' },
    });

    this.transcriptionService.processAudio(filePath, record.id);

    return { 
      id: record.id, 
      status: 'processing',
      message: 'Transcription is being processed. Use the report endpoint to check status.'
    };
  }

  @Get('report/:id')
  async getReport(@Param('id') id: string) {
    const record = await prisma.transcription.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        transcript: true,
        soapReport: true,
        error: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!record) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    return {
      success: true,
      data: record
    };
  }
}
