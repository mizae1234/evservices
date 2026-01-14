// Script to upload logo to S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function uploadLogo() {
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

    const logoPath = path.join(process.cwd(), 'public/images/ev7-logo.png');
    const fileBuffer = fs.readFileSync(logoPath);

    const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: 'ev7-logo.png',
        Body: fileBuffer,
        ContentType: 'image/png',
        ACL: 'public-read',
    });

    await s3Client.send(command);
    console.log('Logo uploaded successfully!');
    console.log(`URL: ${process.env.S3_PUBLIC_URL}/ev7-logo.png`);
}

uploadLogo()
    .catch(console.error);
