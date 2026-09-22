"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { TranslatedText, useTranslation } from "@/i18n/provider";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  expectedText?: string;
  typedText?: string;
  onTypedTextChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  destructive = true,
  expectedText,
  typedText = "",
  onTypedTextChange,
  onCancel,
  onConfirm,
}: Props) {
  const { tx } = useTranslation();
  const allowed = !expectedText || typedText.trim() === expectedText;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay confirm-dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          }}
        >
          <motion.section
            className="modal-box confirm-dialog"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <button className="icon-button confirm-dialog-close" aria-label={tx("Close")} disabled={busy} onClick={onCancel}>
              <X size={18} />
            </button>
            <div className={`confirm-dialog-icon ${destructive ? "danger" : "warning"}`}>
              {destructive ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
            </div>
            <h3 id="confirm-dialog-title"><TranslatedText text={title} /></h3>
            <p><TranslatedText text={description} /></p>
            {expectedText && (
              <label className="confirm-dialog-verify">
                <span><TranslatedText text="Type the school name to confirm" />: <strong data-no-translate>{expectedText}</strong></span>
                <input
                  className="input-field"
                  value={typedText}
                  disabled={busy}
                  autoFocus
                  autoComplete="off"
                  onChange={(event) => onTypedTextChange?.(event.target.value)}
                />
              </label>
            )}
            <div className="confirm-dialog-actions">
              <button className="btn" disabled={busy} onClick={onCancel}><TranslatedText text={cancelLabel} /></button>
              <button className={destructive ? "btn btn-danger" : "btn btn-primary"} disabled={busy || !allowed} onClick={onConfirm}>
                <TranslatedText text={busy ? "Please wait…" : confirmLabel} />
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
