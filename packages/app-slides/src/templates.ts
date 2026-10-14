import { newSlide, type LayoutId } from './layouts'
import type { Presentation, TextElement } from './model'

export interface DeckTemplate {
  id: string
  name: string
  description: string
  build: () => Presentation
}

/** Build a slide from a layout and fill its placeholders in order. */
function slide(layout: LayoutId, ...texts: string[]) {
  const s = newSlide(layout)
  s.elements.forEach((el, i) => {
    if (texts[i] !== undefined) (el as TextElement).text = texts[i]
  })
  return s
}

export const DECK_TEMPLATES: DeckTemplate[] = [
  { id: 'blank', name: 'Blank presentation', description: 'One title slide', build: () => ({ theme: 'paper', slides: [newSlide('title')] }) },
  {
    id: 'pitch',
    name: 'Pitch deck',
    description: 'Problem, solution, market, ask',
    build: () => ({
      theme: 'ember',
      slides: [
        slide('title', 'Your Company', 'One line that says what you do'),
        slide('titleContent', 'The problem', 'Who has it\nHow they solve it today\nWhy that falls short'),
        slide('titleContent', 'Our solution', 'What we built\nHow it works\nWhy it is better'),
        slide('twoContent', 'Market', 'Size of the opportunity\nWho buys', 'Competitors\nOur edge'),
        slide('section', 'The ask', 'What we need and what it unlocks')
      ]
    })
  },
  {
    id: 'update',
    name: 'Project update',
    description: 'Status, risks and next steps',
    build: () => ({
      theme: 'ocean',
      slides: [
        slide('title', 'Project update', new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        slide('titleContent', 'Agenda', 'Where we are\nWhat changed\nRisks\nNext steps'),
        slide('twoContent', 'Status', 'Done\nIn progress', 'Blocked\nNeeds a decision'),
        slide('titleContent', 'Next steps', 'Owner: task, due date\nOwner: task, due date')
      ]
    })
  },
  {
    id: 'lesson',
    name: 'Lesson',
    description: 'Objectives, content, recap',
    build: () => ({
      theme: 'forest',
      slides: [
        slide('title', 'Lesson title', 'Subject · Grade'),
        slide('titleContent', 'Today you will', 'Learn…\nPractise…\nBe able to…'),
        slide('section', 'Part 1', 'Topic'),
        slide('titleContent', 'Recap', 'Key point one\nKey point two\nQuestions?')
      ]
    })
  }
]
