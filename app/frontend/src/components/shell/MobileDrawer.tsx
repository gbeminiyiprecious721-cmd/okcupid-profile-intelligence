import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type RefObject } from "react";
import { SidebarNav } from "./SidebarNav";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; returnFocusTo: RefObject<HTMLElement | null> };

export function MobileDrawer({ open, onOpenChange, returnFocusTo }: Props) {
  // After a link is used, the new page heading takes focus. Otherwise focus goes back to the menu button.
  const leftByLink = useRef(false);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!leftByLink.current) returnFocusTo.current?.focus();
            leftByLink.current = false;
          }}
          className="drawer-content fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto border-r border-line bg-surface p-4"
        >
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title asChild>
              <span>
                <Wordmark />
                <span className="sr-only">: navigation</span>
              </span>
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close navigation"
              className="inline-flex size-11 items-center justify-center rounded-md border border-control text-fg"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <SidebarNav
            onNavigate={() => {
              leftByLink.current = true;
              onOpenChange(false);
            }}
          />
          <div className="mt-2 border-t border-line pt-4 sm:hidden">
            <p className="mb-2 px-3 text-sm font-semibold text-muted">Colour theme</p>
            <div className="px-3">
              <ThemeToggle />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
