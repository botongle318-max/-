import { create } from 'zustand'

export type Page = 'dashboard' | 'courses' | 'lab' | 'progress' | 'settings'
const pages: Page[] = ['dashboard', 'courses', 'lab', 'progress', 'settings']
const initialPage = location.hash.slice(1) as Page

export const useUI = create<{
  page: Page
  lessonId: string
  setPage: (page: Page) => void
  startLesson: (id: string) => void
}>((set) => ({
  page: pages.includes(initialPage) ? initialPage : 'dashboard',
  lessonId: localStorage.getItem('codegrow-current-lesson') || 'for-loop',
  setPage: (page) => { location.hash = page; set({ page }) },
  startLesson: (id) => {
    localStorage.setItem('codegrow-current-lesson', id)
    location.hash = 'lab'
    set({ lessonId: id, page: 'lab' })
  },
}))

window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1) as Page
  if (pages.includes(page)) useUI.setState({ page })
})
