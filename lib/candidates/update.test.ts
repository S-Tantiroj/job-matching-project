import { normalizeEditable, needsReembed } from './update'
import type { CandidateInput } from '@/lib/ingest/normalize'

const base: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Data Scientist',
  summary: 'Analyst with 5 years',
  source: 'csv',
  skills: ['Python'],
  education: [{ degree: 'MSc', institution: 'MIT', country: 'USA' }],
  experience: [{ title: 'Analyst', company: 'Acme' }],
}

test('normalizeEditable trims and converts blanks to null', () => {
  const r = normalizeEditable({
    full_name: '  Somchai Jaidee  ',
    headline: '   ',
    location: 'Bangkok',
    summary: '',
    linkedin_url: undefined,
    professional_email: ' a@b.co ',
  })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value).toEqual({
    full_name: 'Somchai Jaidee',
    headline: null,
    location: 'Bangkok',
    summary: null,
    linkedin_url: null,
    professional_email: 'a@b.co',
  })
})

test('normalizeEditable rejects a blank name', () => {
  expect(normalizeEditable({ full_name: '   ' }).ok).toBe(false)
  expect(normalizeEditable({}).ok).toBe(false)
})

test('needsReembed is false when nothing changes', () => {
  expect(needsReembed(base, { ...base })).toBe(false)
})

test('needsReembed is false for fields outside the embed text', () => {
  expect(needsReembed(base, { ...base, location: 'Chiang Mai' })).toBe(false)
  expect(needsReembed(base, { ...base, linkedin_url: 'https://x.co/y' })).toBe(false)
  expect(needsReembed(base, { ...base, professional_email: 'new@b.co' })).toBe(false)
})

test('needsReembed is true when an embedded main field changes', () => {
  expect(needsReembed(base, { ...base, headline: 'ML Engineer' })).toBe(true)
  expect(needsReembed(base, { ...base, summary: 'Different' })).toBe(true)
  expect(needsReembed(base, { ...base, full_name: 'Somchai Jai' })).toBe(true)
})

test('needsReembed is true when child data changes', () => {
  expect(needsReembed(base, { ...base, skills: ['Python', 'SQL'] })).toBe(true)
  expect(needsReembed(base, { ...base, education: [{ degree: 'PhD', institution: 'MIT' }] })).toBe(true)
  expect(needsReembed(base, { ...base, experience: [{ title: 'Lead', company: 'Acme' }] })).toBe(true)
})
