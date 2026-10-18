import type { ComponentType } from 'react'
import type { AppId } from '@bear/core'
import WriteDemo from './WriteDemo'
import SheetsDemo from './SheetsDemo'
import SlidesDemo from './SlidesDemo'
import NotesDemo from './NotesDemo'
import MailDemo from './MailDemo'
import SitesDemo from './SitesDemo'
import BoardDemo from './BoardDemo'
import TasksDemo from './TasksDemo'
import PhotoDemo from './PhotoDemo'

/** One demo per finished app. `playing === false` renders the final frame. */
export const DEMOS: Partial<Record<AppId, ComponentType<{ playing: boolean }>>> = {
  write: WriteDemo,
  sheets: SheetsDemo,
  slides: SlidesDemo,
  notes: NotesDemo,
  mail: MailDemo,
  sites: SitesDemo,
  board: BoardDemo,
  tasks: TasksDemo,
  photo: PhotoDemo
}

export { default as SleepingBear } from './SleepingBear'
