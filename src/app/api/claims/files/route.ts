// Claim Files Upload API - Upload files and save to CM_ClaimFile table
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadToS3, getContentType } from '@/lib/s3';
import prisma from '@/lib/prisma';

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

        // Get user from database
        const user = await prisma.cM_User.findUnique({
            where: { Email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, message: 'User not found' },
                { status: 404 }
            );
        }

        // Parse form data
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const claimId = formData.get('claimId') as string;

        if (!claimId) {
            return NextResponse.json(
                { success: false, message: 'ClaimID is required' },
                { status: 400 }
            );
        }

        // Verify claim exists
        const claim = await prisma.cM_DocClaim.findUnique({
            where: { ClaimID: parseInt(claimId) },
        });

        if (!claim) {
            return NextResponse.json(
                { success: false, message: 'Claim not found' },
                { status: 404 }
            );
        }

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

        const savedFiles: Array<{
            fileId: number;
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

            // Save to CM_ClaimFile table
            const savedFile = await prisma.cM_ClaimFile.create({
                data: {
                    ClaimID: parseInt(claimId),
                    FileName: file.name,
                    FileType: contentType,
                    FileSize: file.size,
                    FilePath: url,
                    S3Path: s3Path,
                    CreateBy: user.UserID,
                },
            });

            savedFiles.push({
                fileId: savedFile.FileID,
                fileName: file.name,
                url,
                s3Path,
                size: file.size,
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Files uploaded and saved successfully',
            files: savedFiles,
        });
    } catch (error) {
        console.error('Claim file upload error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to upload files' },
            { status: 500 }
        );
    }
}

// GET /api/claims/files?claimId=xxx - Get files for a claim
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const claimId = searchParams.get('claimId');

        if (!claimId) {
            return NextResponse.json(
                { success: false, message: 'ClaimID is required' },
                { status: 400 }
            );
        }

        const files = await prisma.cM_ClaimFile.findMany({
            where: {
                ClaimID: parseInt(claimId),
                IsActive: true,
            },
            orderBy: { CreateDate: 'desc' },
        });

        return NextResponse.json({
            success: true,
            data: files,
        });
    } catch (error) {
        console.error('Error fetching claim files:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch files' },
            { status: 500 }
        );
    }
}
