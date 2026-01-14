// FileUpload Component
// Drag and drop file upload with preview

'use client';

import * as React from 'react';
import { cn, formatFileSize, isValidFileType } from '@/lib/utils';
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react';

interface UploadedFile {
    file: File;
    preview?: string;
}

interface FileUploadProps {
    onFilesChange: (files: File[]) => void;
    maxFiles?: number;
    maxSize?: number; // in bytes
    accept?: string;
    error?: string;
}

export function FileUpload({
    onFilesChange,
    maxFiles = 5,
    maxSize = 10 * 1024 * 1024, // 10MB
    accept = '.jpg,.jpeg,.png,.gif,.pdf,.doc,.docx',
    error,
}: FileUploadProps) {
    const [files, setFiles] = React.useState<UploadedFile[]>([]);
    const [isDragOver, setIsDragOver] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFiles = (newFiles: FileList | null) => {
        if (!newFiles) return;

        const validFiles: UploadedFile[] = [];

        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];

            // Check file count
            if (files.length + validFiles.length >= maxFiles) break;

            // Check file size
            if (file.size > maxSize) continue;

            // Check file type
            if (!isValidFileType(file.name)) continue;

            // Create preview for images
            const isImage = file.type.startsWith('image/');
            const preview = isImage ? URL.createObjectURL(file) : undefined;

            validFiles.push({ file, preview });
        }

        const updatedFiles = [...files, ...validFiles];
        setFiles(updatedFiles);
        onFilesChange(updatedFiles.map((f) => f.file));
    };

    const removeFile = (index: number) => {
        const updatedFiles = files.filter((_, i) => i !== index);
        setFiles(updatedFiles);
        onFilesChange(updatedFiles.map((f) => f.file));

        // Revoke preview URL
        if (files[index].preview) {
            URL.revokeObjectURL(files[index].preview!);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    return (
        <div className="w-full">
            {/* Drop Zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                    'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                    isDragOver
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400',
                    error && 'border-red-500'
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={accept}
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                />
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">
                    <span className="font-medium text-blue-600">คลิกเพื่อเลือกไฟล์</span>{' '}
                    หรือลากไฟล์มาวางที่นี่
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    รองรับ JPG, PNG, GIF, PDF, DOC, DOCX (สูงสุด {maxFiles} ไฟล์, ไม่เกิน{' '}
                    {formatFileSize(maxSize)})
                </p>
            </div>

            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

            {/* File List */}
            {files.length > 0 && (
                <div className="mt-4 space-y-2">
                    {files.map((item, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                            {/* Preview or Icon */}
                            {item.preview ? (
                                <img
                                    src={item.preview}
                                    alt={item.file.name}
                                    className="w-10 h-10 object-cover rounded"
                                />
                            ) : item.file.type === 'application/pdf' ? (
                                <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-red-600" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                                    <ImageIcon className="w-5 h-5 text-gray-400" />
                                </div>
                            )}

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {item.file.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {formatFileSize(item.file.size)}
                                </p>
                            </div>

                            {/* Remove Button */}
                            <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                            >
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
