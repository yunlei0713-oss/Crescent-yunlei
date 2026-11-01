import type { ReactElement } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { ContextMenu } from 'radix-ui'
import { whaleMotionAssets, type WhaleMotionAsset } from './registry'
import { whaleCategoryLabel, whaleMotionLabel } from './motion-labels'

const motionGroups = [...new Set(whaleMotionAssets.map((motion) => motion.category))].map(
  (category) => ({
    category,
    motions: whaleMotionAssets.filter((motion) => motion.category === category)
  })
)
const menuClassName =
  'z-[70] min-w-44 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg'
const itemClassName =
  'flex cursor-default select-none items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=open]:bg-accent'

export function WhaleMotionMenu({
  en,
  onOpenChange,
  onSelect,
  children
}: {
  en: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (motion: WhaleMotionAsset) => void
  children: ReactElement
}): React.JSX.Element {
  return (
    <ContextMenu.Root onOpenChange={onOpenChange}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuClassName} collisionPadding={12}>
          <ContextMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {en ? 'Play an action once' : '播放动作（一次）'}
          </ContextMenu.Label>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          {motionGroups.map(({ category, motions }) => (
            <ContextMenu.Sub key={category}>
              <ContextMenu.SubTrigger className={itemClassName}>
                {whaleCategoryLabel(category, en)}
                <ChevronRightIcon className="size-3.5" aria-hidden="true" />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className={menuClassName} collisionPadding={12}>
                  {motions.map((motion) => (
                    <ContextMenu.Item
                      key={motion.id}
                      className={itemClassName}
                      onSelect={() => onSelect(motion)}
                    >
                      {whaleMotionLabel(motion.id, en)}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
