'use client';

import { Modal, Button } from '@/components/ui';

export interface ActionModalState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'confirm' | 'cancel_reason' | 'info' | 'error';
    reasonText: string;
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

    return (
        <Modal isOpen={state.isOpen} onClose={close} title={state.title}>
            <div className="space-y-4 pt-2">
                <p className="text-sm text-gray-700 font-medium">{state.message}</p>

                {state.type === 'cancel_reason' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">เหตุผลในการยกเลิก *</label>
                        <textarea
                            value={state.reasonText}
                            onChange={(e) => onStateChange({ ...state, reasonText: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-red-500 focus:outline-none placeholder:text-gray-400"
                            placeholder="พิมพ์เหตุผลที่นี่..."
                            autoFocus
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    {state.type === 'confirm' || state.type === 'cancel_reason' ? (
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
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={close}>
                            ตกลง
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
