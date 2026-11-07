// Which computer the dashboard runs on, for words that differ (the GPU encoder's name, the
// default recordings folder, shortcut keys). In the app this is the engine's own computer;
// in a browser elsewhere it's that browser's, which is the best there is to go by.

export type Os = 'mac' | 'windows' | 'linux'

export function osOf(ua: string): Os {
  if (/Mac|iPhone|iPad/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'windows'
  return 'linux'
}

export const os: Os = typeof navigator === 'undefined' ? 'linux' : osOf(navigator.userAgent)

/** The hardware encoder's name here. */
export function hardwareEncoderName(o: Os = os): string {
  return o === 'mac' ? 'Mac hardware' : 'Graphics card'
}

/** Where recordings go when no folder is picked (the engine's default), as people say it. */
export function defaultRecordingsFolder(o: Os = os): string {
  return o === 'mac' ? 'Movies › Ferrocast' : 'Videos › Ferrocast'
}

/** An example full path of a file in the user's `folder` ("Music", "Videos"). */
export function examplePath(folder: string, file: string, o: Os = os): string {
  return o === 'windows'
    ? `C:\\Users\\you\\${folder}\\${file}`
    : o === 'mac'
      ? `/Users/you/${folder}/${file}`
      : `/home/you/${folder}/${file}`
}

/** A shortcut as this computer writes it: `key` with ⌘ on a Mac, Ctrl elsewhere; `shift` adds
 *  Shift ("⇧⌘Z", "Ctrl+Shift+Z"). */
export function shortcut(key: string, shift = false, o: Os = os): string {
  return o === 'mac' ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`
}
