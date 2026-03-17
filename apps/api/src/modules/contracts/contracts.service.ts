import { prisma } from '../../config/database';
import { contractQueue } from './contracts.queue';
import { logger } from '../../utils/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadContract(
  userId: string,
  filename: string,
  buffer: Buffer,
  mimetype: string,
): Promise<{ contractId: string }> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error('File too large (max 10 MB)'), { status: 413 });
  }

  let rawText: string;
  const lowerFilename = filename.toLowerCase();

  try {
    if (mimetype === 'application/pdf' || lowerFilename.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      rawText = data.text;
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerFilename.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      throw Object.assign(new Error('Unsupported file type. Upload a PDF or DOCX.'), { status: 400 });
    }
  } catch (err: any) {
    if (err.status) throw err;
    logger.error({ err, filename }, '[Contracts] Text extraction failed');
    throw Object.assign(new Error('Failed to extract text from file'), { status: 422 });
  }

  if (!rawText.trim()) {
    throw Object.assign(new Error('No readable text found in the file'), { status: 422 });
  }

  const contract = await prisma.contract.create({
    data: { userId, filename, rawText, status: 'PENDING' },
  });

  await contractQueue.add('analyze', { contractId: contract.id });
  logger.info({ contractId: contract.id, filename }, '[Contracts] Queued for analysis');

  return { contractId: contract.id };
}

export async function getContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { analysis: true },
  });

  if (!contract) throw Object.assign(new Error('Contract not found'), { status: 404 });
  if (contract.userId !== userId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // Never return rawText to frontend
  const { rawText: _rawText, ...safe } = contract;
  return safe;
}

export async function listContracts(userId: string) {
  return prisma.contract.findMany({
    where: { userId },
    select: {
      id: true,
      filename: true,
      status: true,
      createdAt: true,
      analysis: { select: { riskScore: true, summary: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
