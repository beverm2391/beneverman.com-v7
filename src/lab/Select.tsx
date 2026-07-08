// Real select primitive (base-ui) styled for the lab's dark theme. Replaces the
// native <select>, which rendered as a plain text box with no dropdown
// affordance. The popup portals to <body>, so its styles use literal colors
// rather than the .lab-scoped CSS variables.

import { Select } from '@base-ui/react/select'
import { Check, ChevronsUpDown } from 'lucide-react'

export type SelectOption = { value: string; label: string }

export function LabSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]))
  return (
    <Select.Root items={items} onValueChange={(next) => onChange(String(next))} value={value}>
      <Select.Trigger className="lab__select">
        <Select.Value className="lab__select-value" />
        <Select.Icon className="lab__select-icon">
          <ChevronsUpDown size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} className="lab__select-positioner" sideOffset={4}>
          <Select.Popup className="lab__select-popup">
            {options.map((option) => (
              <Select.Item className="lab__select-item" key={option.value} value={option.value}>
                <Select.ItemIndicator className="lab__select-check">
                  <Check size={13} />
                </Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
