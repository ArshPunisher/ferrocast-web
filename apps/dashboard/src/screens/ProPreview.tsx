// Demo only (`#/preview/pro`): the Pro panel pieces with stand-in content, so they can be
// checked in a browser and by Playwright before any Pro feature ships. Goes once the first
// real Pro panel exists (M1 History); see docs/plan/PRO.md in the engine repo.

import { PageHeader } from '../components/Panel'
import { ProPanel } from '../components/pro/ProPanel'

export function ProPreview() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pro panels (demo preview)"
        description="How a Pro feature looks. Change it with ?pro=open, ?pro=active and ?pro_features=on."
      />
      <ProPanel id="preview-pro-any" title="Example Pro section">
        <p className="text-sm text-text-2" data-testid="pro-preview-content">
          The feature itself shows here for Pro subscribers.
        </p>
      </ProPanel>
      <ProPanel id="preview-pro-history" title="Stream history" feature="history">
        <p className="text-sm text-text-2" data-testid="pro-preview-history">
          Stream history shows here once the relay has it.
        </p>
      </ProPanel>
    </div>
  )
}
