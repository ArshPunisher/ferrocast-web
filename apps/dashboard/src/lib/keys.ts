const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'color',
  'file',
  'button',
  'submit',
  'reset',
  'image',
])

const NON_TEXT_ROLES = new Set(['switch', 'slider', 'listbox', 'checkbox', 'radio'])

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="switch"], [role="slider"], [role="listbox"], [role="checkbox"], [role="radio"]'

/** True when `el` is or sits inside any form control or editable surface. */
export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  if (el instanceof HTMLInputElement) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if ((el as HTMLElement).isContentEditable) return true
  return el.closest(EDITABLE_SELECTOR) !== null
}

/** True when `el` edits text natively so Backspace/Delete must keep browser default behavior. */
export function isTextEditingElement(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  }
  if ((el as HTMLElement).isContentEditable) return true
  const matched = el.closest(EDITABLE_SELECTOR)
  if (!matched) return false
  if (matched instanceof HTMLSelectElement) return false
  if (matched instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has((matched.type || 'text').toLowerCase())
  }
  const role = matched.getAttribute('role')
  if (role && NON_TEXT_ROLES.has(role)) return false
  return true
}

/** True when an open modal dialog, alertdialog, or menu is capturing keyboard input. */
export function hasOpenDialog(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]') !==
      null
  )
}
