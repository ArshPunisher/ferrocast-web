// Studio settings. The command-line renders use scripts/render.mjs instead.
import { Config } from '@remotion/cli/config'

Config.setChromiumOpenGlRenderer('angle')
Config.setPublicDir('public')
