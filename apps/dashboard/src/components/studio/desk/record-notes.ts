// Words for the record page that depend on what the engine says about sharing the stream's encode.

/**
 * A line for "Same as stream" when it can't share the stream's encode, with why, whatever the
 * encoder budget's level (it says so over the budget's limit too, but the person asked for it
 * and must be told at once). Null when it shares, another quality is chosen, or no reason is known.
 */
export function sharedNote(
  choice: string,
  budget:
    { shared?: boolean | undefined; why_not_shared?: string | null | undefined } | undefined | null,
): string | null {
  if (choice !== 'stream' || !budget || budget.shared === true || !budget.why_not_shared)
    return null
  return `Same as stream can't share here: ${budget.why_not_shared}. It uses an encoder of its own.`
}
