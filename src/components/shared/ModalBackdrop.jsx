"use client";

// Keep the caller's portal, dialog layout and saving guards intact.
export default function ModalBackdrop({onClose, className = "modal-bg", children, ...props}) {
  return <div {...props} className={className} onMouseDown={event => {
    if (event.target === event.currentTarget) onClose?.();
  }}>{children}</div>;
}
