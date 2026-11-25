import { useBlocker } from 'react-router-dom';
import ConfirmModal from './ui/ConfirmModal';

export default function FormRouteGuard({ shouldBlock, message }: { shouldBlock: () => boolean; message?: string }) {
  const blocker = useBlocker(shouldBlock);
  return <ConfirmModal isOpen={blocker.state === 'blocked'} title="저장하지 않고 이동할까요?"
    message={message ?? "작성 중인 내용이 있어요. 남겨두려면 취소한 뒤 저장해주세요."} danger={false} confirmLabel="이동하기"
    onCancel={() => { if (blocker.state === 'blocked') blocker.reset(); }}
    onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed(); }} />;
}

