// Pure-logic tests (ไม่ต่อ DB): state machine, สิทธิ์, QR token
// รัน: QUEUE_QR_SECRET=test npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-queue-logic.ts

import assert from 'node:assert/strict';
import { canManageQueue, canTransition, getNextStatus, requiresRepairDetail } from '../src/lib/queue-status';
import { signBranchToken, verifyBranchToken } from '../src/lib/queue-token';

// เดินหน้าทีละขั้นเท่านั้น
assert.equal(canTransition('WAITING_CALL', 'WAITING_REPAIR'), true);
assert.equal(canTransition('WAITING_CALL', 'IN_REPAIR'), false);
assert.equal(canTransition('IN_REPAIR', 'WAITING_REPAIR'), false);
assert.equal(canTransition('WAITING_PAYMENT', 'DONE'), true);
assert.equal(canTransition('DONE', 'CANCELLED'), false);
assert.equal(canTransition('IN_REPAIR', 'CANCELLED'), true);
assert.equal(canTransition('WAITING_CALL', 'NO_SHOW'), true);
assert.equal(canTransition('IN_REPAIR', 'NO_SHOW'), false);
assert.equal(getNextStatus('DONE'), null);
assert.equal(requiresRepairDetail('WAITING_CALL', 'WAITING_REPAIR'), true);
assert.equal(requiresRepairDetail('WAITING_REPAIR', 'IN_REPAIR'), false);

// สิทธิ์ตามสาขา
// บริการ "อื่นๆ" ข้ามสถานะไปข้างหน้าได้ แต่ย้อนกลับไม่ได้ และไม่บังคับรายละเอียดงานซ่อม
assert.equal(canTransition('WAITING_CALL', 'DONE', true), true);
assert.equal(canTransition('WAITING_CALL', 'IN_REPAIR', true), true);
assert.equal(canTransition('IN_REPAIR', 'WAITING_REPAIR', true), false);
assert.equal(canTransition('WAITING_CALL', 'DONE', false), false);
assert.equal(canTransition('DONE', 'DONE', true), false);
assert.equal(requiresRepairDetail('WAITING_CALL', 'WAITING_REPAIR', true), false);
assert.equal(requiresRepairDetail('WAITING_CALL', 'WAITING_REPAIR'), true);

assert.equal(canManageQueue({ role: 'ADMIN' }, 5), true);
assert.equal(canManageQueue({ role: 'SERVICE_CENTER', branchId: 1 }, 1), true);
assert.equal(canManageQueue({ role: 'SERVICE_CENTER', branchId: 1 }, 2), false);
assert.equal(canManageQueue({ role: 'SERVICE_CENTER', branchId: null }, 1), false);
assert.equal(canManageQueue({ role: 'CS', branchId: 1 }, 1), false);

// QR token ผูกกับสาขา + วัตถุประสงค์
const t = signBranchToken('BR001', 'checkin');
assert.equal(verifyBranchToken('BR001', 'checkin', t), true);
assert.equal(verifyBranchToken('BR002', 'checkin', t), false);
assert.equal(verifyBranchToken('BR001', 'monitor', t), false);
assert.equal(verifyBranchToken('BR001', 'checkin', null), false);
assert.equal(verifyBranchToken('BR001', 'checkin', 'x'), false);

console.log('queue logic tests passed');
