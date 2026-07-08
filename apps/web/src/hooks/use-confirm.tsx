"use client";

import * as React from "react";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";

type ConfirmOptions = Parameters<ConfirmDialogHandle["open"]>[0];

/** In-app replacement for `window.confirm`. Render the returned element once, call `confirm(...)` anywhere in the component. */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactElement] {
  const ref = React.useRef<ConfirmDialogHandle>(null);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return ref.current?.open(options) ?? Promise.resolve(false);
  }, []);

  const element = <ConfirmDialog ref={ref} />;

  return [confirm, element];
}
