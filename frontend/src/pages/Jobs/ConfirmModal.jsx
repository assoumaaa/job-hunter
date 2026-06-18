import { Trash2 } from "lucide-react";

import { Button } from "components/ui/button";
import { Modal } from "components/ui/modal";

export default function ConfirmModal({ message, onConfirm, onCancel }) {
	return (
		<Modal
			open
			onClose={onCancel}
			title="Confirm delete"
			icon={Trash2}
			width={380}
			footer={
				<>
					<Button variant="subtle" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="destructive" size="sm" onClick={onConfirm}>
						<Trash2 className="h-3.5 w-3.5" />
						Delete
					</Button>
				</>
			}
		>
			<p className="text-[13px] text-zinc-600 leading-relaxed">{message}</p>
		</Modal>
	);
}
