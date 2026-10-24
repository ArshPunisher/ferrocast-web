// The Simple or Advanced switch at the top of a screen (owner's pick 1B).

import { Segmented } from '@ferrocast/ui'
import { useMode, type Mode } from '../lib/mode'

export function ModeSwitch({ screen }: { screen: string }) {
  const [mode, setMode] = useMode(screen)
  return (
    <Segmented<Mode>
      label="Simple or Advanced"
      size="sm"
      value={mode}
      options={[
        { value: 'simple', label: 'Simple' },
        { value: 'advanced', label: 'Advanced', title: 'Every setting, as numbers you type' },
      ]}
      onChange={setMode}
    />
  )
}
