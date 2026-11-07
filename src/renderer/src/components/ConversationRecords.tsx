import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileClockIcon } from 'lucide-react'
import { Button } from './ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger
} from './ui/sheet'

/** Keep supporting records out of the analysis reading flow without changing their owner. */
export function ConversationRecords({
  target,
  zh,
  children
}: {
  target: HTMLElement | null
  zh: boolean
  children: ReactNode
}) {
  if (!target) return null
  return createPortal(
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="xs">
          <FileClockIcon aria-hidden="true" />
          {zh ? '排查记录' : 'Diagnostic records'}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{zh ? '排查记录' : 'Diagnostic records'}</SheetTitle>
          <SheetDescription>
            {zh
              ? '终端证据与历史步骤；当前分析和建议保留在对话中。'
              : 'Terminal evidence and previous steps. Analysis and suggestions remain in the conversation.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 text-xs break-words">{children}</div>
      </SheetContent>
    </Sheet>,
    target
  )
}
