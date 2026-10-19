// electron-builder configuration, chosen by the BEAR_EDITION environment variable (all | office | studio).
const { builderConfig } = require('./build-config/editions.cjs')

// An unknown value throws, so a typo can't build the wrong edition.
module.exports = builderConfig(process.env.BEAR_EDITION)
