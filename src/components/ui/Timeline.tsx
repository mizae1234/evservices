// Timeline Component
// Displays claim status history

import { cn } from '@/lib/utils';
import { formatDateTime, getActionText } from '@/lib/utils';
import { ClaimLog } from '@/types';
import { Check, Clock, X, AlertCircle, Edit, Send } from 'lucide-react';

interface TimelineProps {
    logs: ClaimLog[];
}

export function Timeline({ logs }: TimelineProps) {
    const getIcon = (action: string) => {
        switch (action) {
            case 'CREATED':
                return <Edit className="w-4 h-4" />;
            case 'SUBMITTED':
                return <Send className="w-4 h-4" />;
            case 'APPROVED':
                return <Check className="w-4 h-4" />;
            case 'REJECTED':
                return <X className="w-4 h-4" />;
            case 'INFO_REQUESTED':
                return <AlertCircle className="w-4 h-4" />;
            default:
                return <Clock className="w-4 h-4" />;
        }
    };

    const getIconColor = (action: string) => {
        switch (action) {
            case 'APPROVED':
                return 'bg-green-500 text-white';
            case 'REJECTED':
                return 'bg-red-500 text-white';
            case 'INFO_REQUESTED':
                return 'bg-blue-500 text-white';
            case 'SUBMITTED':
                return 'bg-yellow-500 text-white';
            default:
                return 'bg-gray-400 text-white';
        }
    };

    if (logs.length === 0) {
        return (
            <p className="text-gray-500 text-center py-4">ไม่มีประวัติการดำเนินการ</p>
        );
    }

    return (
        <div className="flow-root">
            <ul className="-mb-8">
                {logs.map((log, idx) => (
                    <li key={log.LogID}>
                        <div className="relative pb-8">
                            {idx !== logs.length - 1 && (
                                <span
                                    className="absolute left-4 top-8 -ml-px h-full w-0.5 bg-gray-200"
                                    aria-hidden="true"
                                />
                            )}
                            <div className="relative flex items-start space-x-3">
                                <div
                                    className={cn(
                                        'relative px-1 flex h-8 w-8 items-center justify-center rounded-full',
                                        getIconColor(log.Action)
                                    )}
                                >
                                    {getIcon(log.Action)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {getActionText(log.Action)}
                                        </p>
                                        <p className="mt-0.5 text-sm text-gray-500">
                                            โดย {log.User?.FullName || 'ระบบ'} • {formatDateTime(log.ActionDate)}
                                        </p>
                                    </div>
                                    {log.Description && (
                                        <p className="mt-2 text-sm text-gray-600">{log.Description}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
