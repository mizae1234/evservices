'use client';

import { Modal, Button } from '@/components/ui';

export interface ActionModalState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'cancel_reason' | 'info' | 'error' | 'prompt' | 'success';
    reasonText: string;
    promptLabel?: string;
    promptPlaceholder?: string;
    onConfirm?: (reason?: string) => void;
}

export const defaultActionModal: ActionModalState = {
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm',
    reasonText: '',
};

interface ActionConfirmModalProps {
    state: ActionModalState;
    onStateChange: (state: ActionModalState) => void;
}

export function ActionConfirmModal({ state, onStateChange }: ActionConfirmModalProps) {
    const close = () => onStateChange({ ...state, isOpen: false });

    const needsTextInput = state.type === 'cancel_reason' || state.type === 'prompt';
    const needsConfirmButtons = state.type === 'confirm' || needsTextInput;

    return (
        <Modal isOpen={state.isOpen} onClose={close} title={state.title}>
            <div className="space-y-4 pt-2">
                <p className="text-sm text-gray-700 font-medium">{state.message}</p>

                {needsTextInput && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                            {state.promptLabel || (state.type === 'cancel_reason' ? 'เหตุผลในการยกเลิก *' : 'กรุณาระบุ')}
                        </label>
                        <textarea
                            value={state.reasonText}
                            onChange={(e) => onStateChange({ ...state, reasonText: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                            placeholder={state.promptPlaceholder || 'พิมพ์ที่นี่...'}
                            autoFocus
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    {needsConfirmButtons ? (
                        <>
                            <Button variant="outline" onClick={close}>
                                ยกเลิก
                            </Button>
                            <Button
                                className={state.type === 'cancel_reason' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                                onClick={() => {
                                    const reason = state.reasonText;
                                    const onConf = state.onConfirm;
                                    close();
                                    if (onConf) onConf(reason);
                                }}
                            >
                                ตกลงยืนยัน
                            </Button>
                        </>
                    ) : (
                        <Button
                            className={state.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : state.type === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                            onClick={() => {
                                const onConf = state.onConfirm;
                                close();
                                if (onConf) onConf();
                            }}
                        >
                            ตกลง
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
