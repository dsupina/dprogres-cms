import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Shield, Check } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { organizationService } from '../../services/organization';

interface TransferOwnershipModalProps {
  organizationId: number;
  organizationName: string;
  newOwnerId: number;
  newOwnerName: string;
  onClose: () => void;
}

export default function TransferOwnershipModal({
  organizationId,
  organizationName,
  newOwnerId,
  newOwnerName,
  onClose,
}: TransferOwnershipModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const queryClient = useQueryClient();

  const expectedConfirmText = 'TRANSFER';

  const transferMutation = useMutation({
    mutationFn: () => organizationService.transferOwnership(organizationId, { newOwnerId }),
    onSuccess: () => {
      toast.success(`Ownership transferred to ${newOwnerName}`);
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to transfer ownership');
    },
  });

  const handleTransfer = () => {
    if (confirmText !== expectedConfirmText) {
      toast.error(`Please type "${expectedConfirmText}" to confirm`);
      return;
    }
    transferMutation.mutate();
  };

  const isConfirmed = confirmText === expectedConfirmText;

  return (
    <Modal title="Transfer Ownership" onClose={onClose}>
      <div className="space-y-6">
        {/* Warning Banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-orange-800">This action cannot be undone</h3>
            <p className="text-sm text-orange-700 mt-1">
              Once you transfer ownership, you will lose all owner privileges and become an admin.
              Only the new owner can transfer ownership back to you.
            </p>
          </div>
        </div>

        {/* Transfer Details */}
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Transfer Details</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Organization</dt>
                <dd className="font-medium text-gray-900">{organizationName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">New Owner</dt>
                <dd className="font-medium text-gray-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  {newOwnerName}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Your New Role</dt>
                <dd className="font-medium text-gray-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Admin
                </dd>
              </div>
            </dl>
          </div>

          {/* What will change */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">What will change:</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <span>{newOwnerName} will have full control of organization settings</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <span>{newOwnerName} will manage billing and subscriptions</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5" />
                <span>You will retain admin access to manage members and content</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Confirmation Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type <span className="font-mono font-bold text-red-600">{expectedConfirmText}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder={expectedConfirmText}
            className="input"
            autoComplete="off"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={transferMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleTransfer}
            loading={transferMutation.isPending}
            disabled={!isConfirmed}
          >
            Transfer Ownership
          </Button>
        </div>
      </div>
    </Modal>
  );
}
