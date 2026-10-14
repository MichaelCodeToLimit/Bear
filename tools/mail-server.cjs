/**
 * Bear's local test mail server: IMAP (hoodiecrow) plus SMTP that delivers every message into the
 * same mailbox. For development and automated tests only — it accepts any password, stores
 * mail in memory, and listens on localhost.
 *
 *   pnpm mail-server              # IMAP on 1143, SMTP on 1025, sign in as bear@bear.local / bear
 *
 * In Bear: Mail > Add account > "Other", server 127.0.0.1, IMAP port 1143, SMTP port 1025, security "None".
 */
const hoodiecrow = require('hoodiecrow-imap')
const { SMTPServer } = require('smtp-server')

const USER = 'bear@bear.local'
const PASSWORD = 'bear'

const welcome = [
  'From: "Bear Team" <team@bear.local>',
  `To: ${USER}`,
  'Subject: Welcome to Bear Mail',
  `Date: ${new Date().toUTCString()}`,
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<h2>Welcome to Bear Mail</h2><p>This message comes from Bear\'s <b>local test mail server</b>. Anything you send to any address arrives back here.</p>'
].join('\r\n')

function start({ imapPort = 1143, smtpPort = 1025, seed = true, quiet = false } = {}) {
  const imap = hoodiecrow({
    plugins: ['id', 'sasl-ir', 'auth-plain', 'namespace', 'idle', 'enable', 'condstore', 'unselect', 'special-use', 'create-special-use', 'literalplus', 'uidplus', 'move'],
    users: { [USER]: { password: PASSWORD } },
    storage: {
      INBOX: { messages: seed ? [{ raw: welcome, flags: [] }] : [] },
      '': {
        separator: '/',
        folders: {
          Drafts: { 'special-use': '\\Drafts' },
          Sent: { 'special-use': '\\Sent' },
          Archive: { 'special-use': '\\Archive' },
          Junk: { 'special-use': '\\Junk' },
          Trash: { 'special-use': '\\Trash' }
        }
      }
    }
  })

  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth(auth, _session, done) {
      if (auth.username === USER && auth.password === PASSWORD) return done(null, { user: auth.username })
      done(new Error('Invalid username or password'))
    },
    onData(stream, _session, done) {
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('error', done)
      stream.on('end', () => {
        imap.appendMessage('INBOX', [], false, Buffer.concat(chunks).toString('binary'))
        done()
      })
    }
  })

  return new Promise((resolve, reject) => {
    imap.listen(imapPort, '127.0.0.1', (err) => {
      if (err) return reject(err)
      smtp.listen(smtpPort, '127.0.0.1', () => {
        // Port 0 picks any free port (tests do this so parallel runs never collide); report the real ones.
        imapPort = imap.server.address().port
        smtpPort = smtp.server.address().port
        if (!quiet) console.log(`Bear test mail server: IMAP 127.0.0.1:${imapPort}, SMTP 127.0.0.1:${smtpPort}, user ${USER} / ${PASSWORD}`)
        resolve({
          user: USER,
          password: PASSWORD,
          imapPort,
          smtpPort,
          /** Drop a raw message into a folder, as if it had just arrived. */
          deliver: (raw, folder = 'INBOX') => imap.appendMessage(folder, [], false, raw),
          close: () => new Promise((r) => smtp.close(() => imap.close(() => r())))
        })
      })
    })
  })
}

module.exports = { start, USER, PASSWORD }

if (require.main === module) {
  start().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
