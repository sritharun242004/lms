"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Imperative in-app replacement for `window.confirm`. Render once, call `.open()` to prompt. */
export interface ConfirmDialogHandle {
  open: (options: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
}

export const ConfirmDialog = React.forwardRef<ConfirmDialogHandle>(function ConfirmDialog(
  _props,
  ref
) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [options, setOptions] = React.useState<{
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  } | null>(null);
  const resolveRef = React.useRef<(value: boolean) => void>(null);

  React.useImperativeHandle(ref, () => ({
    open: (opts) => {
      setOptions(opts);
      setIsOpen(true);
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
      });
    },
  }));

  function settle(result: boolean) {
    setIsOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={
              options?.destructive
                ? "bg-destructive text-white shadow-xs hover:bg-destructive/90"
                : undefined
            }
          >
            {options?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
