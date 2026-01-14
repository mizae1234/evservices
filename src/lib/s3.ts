// S3 Client for DigitalOcean Spaces
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 Client for DigitalOcean Spaces
export const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'sgp1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: false,
});

// Get current month folder name (YYYYMM format)
export function getMonthFolder(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
}

// Generate unique filename
export function generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = originalName.split('.').pop() || 'file';
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
    return `${baseName}_${timestamp}_${randomStr}.${ext}`;
}

// Upload file to S3
export async function uploadToS3(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = 'evidence'
): Promise<{ url: string; s3Path: string }> {
    const monthFolder = getMonthFolder();
    const uniqueFileName = generateFileName(fileName);
    const s3Path = `${folder}/${monthFolder}/${uniqueFileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Path,
        Body: file,
        ContentType: contentType,
        ACL: 'public-read',
    });

    await s3Client.send(command);

    const url = `${process.env.S3_PUBLIC_URL}/${s3Path}`;

    return { url, s3Path };
}

// Get file extension content type mapping
export function getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const contentTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return contentTypes[ext] || 'application/octet-stream';
}
