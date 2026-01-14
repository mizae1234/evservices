// File Upload API - Upload to DigitalOcean Spaces (S3)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadToS3, getContentType } from '@/lib/s3';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse form data
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No files provided' },
                { status: 400 }
            );
        }

        // Validate file count (max 5 files)
        if (files.length > 5) {
            return NextResponse.json(
                { success: false, message: 'Maximum 5 files allowed' },
                { status: 400 }
            );
        }

        const uploadedFiles: Array<{
            fileName: string;
            url: string;
            s3Path: string;
            size: number;
        }> = [];

        for (const file of files) {
            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { success: false, message: `File ${file.name} exceeds 10MB limit` },
                    { status: 400 }
                );
            }

            // Validate file type
            const contentType = getContentType(file.name);
            if (!ALLOWED_TYPES.includes(contentType) && !ALLOWED_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { success: false, message: `File type not allowed: ${file.name}` },
                    { status: 400 }
                );
            }

            // Convert file to buffer
            const buffer = Buffer.from(await file.arrayBuffer());

            // Upload to S3
            const { url, s3Path } = await uploadToS3(
                buffer,
                file.name,
                contentType,
                'evidence'
            );

            uploadedFiles.push({
                fileName: file.name,
                url,
                s3Path,
                size: file.size,
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Files uploaded successfully',
            files: uploadedFiles,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to upload files' },
            { status: 500 }
        );
    }
}
