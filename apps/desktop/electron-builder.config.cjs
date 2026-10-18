// electron-builder configuration, chosen by the BEAR_EDITION environment variable (all | office | studio).
const { builderConfig } = require('./build-config/editions.cjs')

module.exports = builderConfig(process.env.BEAR_EDITION || 'all')
