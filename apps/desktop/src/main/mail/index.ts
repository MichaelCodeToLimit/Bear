import { app, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import type { MailAccountInput, MailBridge, OAuthClients, OutgoingMessage } from '@bear/core'
import { AccountStore } from './accounts'
import { MailService } from './service'
import { ENDPOINTS, interactiveSignIn } from './oauth'

/** Wire every MailBridge method to an IPC handler named mail:<method>. */
export function registerMailIpc(): MailService {
  const store = new AccountStore(join(app.getPath('userData'), 'mail'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64'))
  })
  const mail = new MailService(store)

  const handlers: { [K in keyof MailBridge]: (...args: Parameters<MailBridge[K]>) => ReturnType<MailBridge[K]> } = {
    listAccounts: () => store.list(),
    testAccount: (input: MailAccountInput) => mail.test(input),
    saveAccount: (input: MailAccountInput, id?: string) => mail.save(input, id),
    removeAccount: (id: string) => mail.removeAccount(id),
    getOAuthClients: () => store.oauthClients(),
    setOAuthClients: (c: OAuthClients) => store.setOAuthClients(c),
    signIn: async (provider) => {
      const client = (await store.oauthClients())[provider]
      if (!client?.clientId) return { ok: false, error: `Add your ${provider === 'google' ? 'Google' : 'Microsoft'} app ID in Mail settings first.` }
      try {
        const r = await interactiveSignIn(ENDPOINTS[provider], client, (url) => void shell.openExternal(url))
        return { ok: true, value: { session: mail.addSession({ provider, tokens: r.tokens }), email: r.email, name: r.name } }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    listFolders: (id) => mail.folders(id),
    listMessages: (id, folder, before) => mail.messages(id, folder, before),
    getMessage: (id, folder, uid) => mail.message(id, folder, uid),
    getAttachment: (id, folder, uid, att) => mail.attachment(id, folder, uid, att),
    setFlags: (id, folder, uids, flags) => mail.setFlags(id, folder, uids, flags),
    move: (id, folder, uids, target) => mail.move(id, folder, uids, target),
    remove: (id, folder, uids) => mail.remove(id, folder, uids),
    archive: (id, folder, uids) => mail.archive(id, folder, uids),
    search: (id, folder, q) => mail.search(id, folder, q),
    send: (id, msg: OutgoingMessage) => mail.send(id, msg)
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`mail:${name}`, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  app.on('before-quit', () => void mail.closeAll())
  return mail
}
