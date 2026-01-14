// Script to upload font to S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function uploadFont() {
    console.log('Using endpoint:', process.env.S3_ENDPOINT);

    const s3Client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'sgp1',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: false,
    });

    const fontPath = path.join(process.cwd(), 'public/fonts/th-sarabun-new.ttf');
    const fileBuffer = fs.readFileSync(fontPath);

    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: 'fonts/th-sarabun-new.ttf',
        Body: fileBuffer,
        ContentType: 'font/ttf',
        ACL: 'public-read',
    });

    await s3Client.send(command);
    console.log('Font uploaded successfully!');
    console.log(`URL: ${process.env.S3_PUBLIC_URL}/fonts/th-sarabun-new.ttf`);
}

uploadFont()
    .catch(console.error);
